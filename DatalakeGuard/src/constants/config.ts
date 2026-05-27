// src/constants/config.ts

export const Config = {
  // Replace with actual production values when ready
  AWS_SYNC_ENDPOINT: 'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/sync',
  AWS_API_KEY: 'YOUR_KEY_HERE',
  
  SYNC_BATCH_SIZE: 100,       // Max logs per sync call
  COSINE_THRESHOLD: 0.6,      // Recognition threshold: >0.6 is a match
  
  // Database configuration
  DB_NAME: 'datalake_guard.db',
  MAX_UNSYNCED_LOGS: 10000,
  MAX_ENROLLED_WORKERS: 1000,
  
  // Encryption configuration
  KEYCHAIN_SERVICE: 'com.datalakeguard.embeddingkey',
};

