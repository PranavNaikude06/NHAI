# ☁️ AWS Infrastructure Setup Guide — DatalakeGuard

This document outlines the steps to set up the backend synchronization infrastructure for the DatalakeGuard offline facial recognition system.

## 1. S3 Bucket Setup (Storage)

1. **Create Bucket**: Log in to AWS Console and create an S3 bucket named `datalake-guard-sync-logs-[unique-suffix]`.
2. **Region**: Select `ap-south-1` (Mumbai) or your preferred region.
3. **Public Access**: **Block all public access** ✅.
4. **Versioning**: Enable bucket versioning to track changes and prevent accidental deletions.
5. **Encryption**: Enable "Server-side encryption with Amazon S3 managed keys (SSE-S3)".

## 2. IAM Role for Lambda

1. Create a new IAM Role for a **Lambda Service**.
2. **Permissions**:
   - `AWSLambdaBasicExecutionRole` (for CloudWatch logs).
   - Create an inline policy allowing `s3:PutObject` on your specific bucket:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": "s3:PutObject",
           "Resource": "arn:aws:s3:::datalake-guard-sync-logs-[unique-suffix]/*"
         }
       ]
     }
     ```

## 3. Lambda Function Setup

1. **Create Function**: Name it `DatalakeGuard_SyncHandler`.
2. **Runtime**: Node.js 18.x or 20.x.
3. **Role**: Select the IAM Role created in Step 2.
4. **Environment Variables**:
   - `S3_BUCKET_NAME`: The name of your bucket.
5. **Code**: Upload the contents of `aws/lambda/sync-handler.js`.
6. **Timeout**: Increase to 30 seconds to handle larger batches.

## 4. API Gateway Setup (Endpoint)

1. **Create REST API**: Name it `DatalakeGuard_SyncAPI`.
2. **Create Resource**: `/sync`.
3. **Create Method**: `POST` on `/sync`.
   - Integration type: Lambda Function.
   - Use Lambda Proxy Integration: **Yes**.
4. **API Key Auth**:
   - Go to Method Request -> API Key Required: **true**.
   - Create an API Key in the API Gateway console.
   - Create a Usage Plan and link it to the API Key and your API Stage (`prod`).
5. **CORS**: Enable CORS on the `/sync` resource to allow requests from the mobile app.
6. **Deploy**: Deploy the API to a stage called `prod`.
7. **Endpoint**: Copy the "Invoke URL" for the POST method.

## 5. Mobile App Configuration

Update `src/constants/config.ts` with your new infrastructure details:

```typescript
export const Config = {
  AWS_SYNC_ENDPOINT: 'https://[API-ID].execute-api.[REGION].amazonaws.com/prod/sync',
  AWS_API_KEY: '[YOUR-GENERATED-API-KEY]',
  // ...
};
```

---
*Created: May 26, 2026 | DatalakeGuard Backend Documentation*
