/* global Buffer */
// aws/lambda/sync-handler.js

const AWS = require('aws-sdk');
const crypto = require('crypto');
const s3 = new AWS.S3();

const MAX_SYNC_CLOCK_SKEW_MS = Number(process.env.MAX_SYNC_CLOCK_SKEW_MS || 5 * 60 * 1000);

function resolveDeviceSecret(deviceId, apiKey) {
  if (process.env.DEVICE_HMAC_SECRETS) {
    try {
      const secrets = JSON.parse(process.env.DEVICE_HMAC_SECRETS);
      if (secrets && typeof secrets[deviceId] === 'string') {
        return secrets[deviceId];
      }
    } catch (err) {
      console.error('Invalid DEVICE_HMAC_SECRETS JSON:', err);
    }
  }
  return process.env.DEVICE_HMAC_SECRET || apiKey;
}

function signaturesMatch(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Lambda handler to receive authentication logs from DatalakeGuard mobile app
 * and store them in an S3 bucket as JSON files.
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://datalakeguard.app',
  };

  try {
    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    if (!body) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const { device_id, sync_timestamp, auth_logs } = body;
    const headers = event.headers || {};

    const apiKey = headers['x-api-key'] || headers['X-Api-Key'] || 'YOUR_KEY_HERE';
    const headerDeviceId = headers['x-device-id'] || headers['X-Device-Id'] || device_id;
    const signature = headers['x-signature'] || headers['X-Signature'];
    const hmacSecret = resolveDeviceSecret(headerDeviceId, apiKey);
    const expectedSignature = crypto
      .createHmac('sha256', hmacSecret)
      .update(rawBody)
      .digest('hex');

    if (!signaturesMatch(signature, expectedSignature)) {
      return {
        statusCode: 401,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Unauthorized: Invalid payload signature' }),
      };
    }

    // Validation of top-level properties
    if (!device_id || !auth_logs || !Array.isArray(auth_logs)) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ 
          error: 'Invalid payload. Required fields: device_id, sync_timestamp, auth_logs (array)' 
        }),
      };
    }

    if (
      typeof sync_timestamp !== 'number' ||
      !Number.isFinite(sync_timestamp) ||
      Math.abs(Date.now() - sync_timestamp) > MAX_SYNC_CLOCK_SKEW_MS
    ) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Stale or invalid sync timestamp' }),
      };
    }

    // Payload size verification
    if (auth_logs.length > 500) {
      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Batch too large, max 500 logs' }),
      };
    }

    // Individual log entry schema verification
    for (const log of auth_logs) {
      if (typeof log !== 'object' || log === null) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid log entry structure' }),
        };
      }
      
      const { log_id, user_id, timestamp, confidence, liveness_score, liveness_pass, result, location } = log;
      
      if (log_id !== undefined && log_id !== null && typeof log_id !== 'number') {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid log_id' }),
        };
      }
      if (user_id !== null && user_id !== undefined && typeof user_id !== 'string') {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid user_id' }),
        };
      }
      if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp <= 0) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid timestamp' }),
        };
      }
      if (typeof confidence !== 'number' || isNaN(confidence) || confidence < 0 || confidence > 1) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid confidence' }),
        };
      }
      if (
        liveness_score !== undefined &&
        liveness_score !== null &&
        (typeof liveness_score !== 'number' || isNaN(liveness_score) || liveness_score < 0 || liveness_score > 1)
      ) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid liveness_score' }),
        };
      }
      if (typeof liveness_pass !== 'boolean') {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid liveness_pass' }),
        };
      }
      const allowedResults = ['authenticated', 'unknown', 'spoof_rejected'];
      if (typeof result !== 'string' || !allowedResults.includes(result)) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({ error: 'Invalid result' }),
        };
      }
      if (location !== undefined && location !== null) {
        if (typeof location !== 'object' || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
          return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'Invalid location object' }),
          };
        }
      }
    }

    // Define S3 key (organize by device_id and timestamp)
    const s3Bucket = process.env.S3_BUCKET_NAME;
    if (!s3Bucket) {
      throw new Error('S3_BUCKET_NAME environment variable not set');
    }

    // Sanitise device_id to prevent path traversal
    const sanitizedDeviceId = device_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const key = `logs/${sanitizedDeviceId}/${sync_timestamp || Date.now()}.json`;

    // Write logs to S3
    await s3.putObject({
      Bucket: s3Bucket,
      Key: key,
      Body: JSON.stringify({
        device_id: sanitizedDeviceId,
        sync_timestamp,
        auth_logs,
        received_at: new Date().toISOString()
      }),
      ContentType: 'application/json',
    }).promise();

    console.log(`Successfully stored ${auth_logs.length} logs to S3: ${key}`);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        ok: true,
        received: auth_logs.length,
        s3_key: key,
      }),
    };
  } catch (err) {
    console.error('Sync processing error:', err);
    
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error'
      }),
    };
  }
};
