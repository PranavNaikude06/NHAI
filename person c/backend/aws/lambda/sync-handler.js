// aws/lambda/sync-handler.js

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

/**
 * Lambda handler to receive authentication logs from DatalakeGuard mobile app
 * and store them in an S3 bucket as JSON files.
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Parse the body (API Gateway sends it as a string)
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    if (!body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const { device_id, sync_timestamp, auth_logs } = body;

    // Validation
    if (!device_id || !auth_logs || !Array.isArray(auth_logs)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Invalid payload. Required fields: device_id, sync_timestamp, auth_logs (array)' 
        }),
      };
    }

    // Define S3 key (organize by device_id and timestamp)
    // Format: logs/DEVICE_ID/TIMESTAMP.json
    const s3Bucket = process.env.S3_BUCKET_NAME;
    if (!s3Bucket) {
      throw new Error('S3_BUCKET_NAME environment variable not set');
    }

    const key = `logs/${device_id}/${sync_timestamp || Date.now()}.json`;

    // Write logs to S3
    await s3.putObject({
      Bucket: s3Bucket,
      Key: key,
      Body: JSON.stringify({
        device_id,
        sync_timestamp,
        auth_logs,
        received_at: new Date().toISOString()
      }),
      ContentType: 'application/json',
    }).promise();

    console.log(`Successfully stored ${auth_logs.length} logs to S3: ${key}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Enable CORS for mobile clients
      },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: err.message
      }),
    };
  }
};
