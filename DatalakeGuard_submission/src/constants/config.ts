// src/constants/config.ts

export const Config = {
  // AWS Sync
  AWS_SYNC_ENDPOINT: 'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/sync',
  AWS_API_KEY: 'YOUR_KEY_HERE',

  SYNC_BATCH_SIZE: 100,

  // Recognition thresholds
  COSINE_THRESHOLD: 0.6,              // Fallback global threshold
  SECURITY_MARGIN: 0.10,             // Min gap between best and second-best match
  DUPLICATE_ENROLL_THRESHOLD: 0.80,  // Reject enrollment if face matches existing at this level
  GHOST_TWIN_THRESHOLD: 0.75,        // Warn admin if two workers match above this level
  HIGH_CONFIDENCE_UPDATE: 0.85,      // Min similarity to trigger prototype update (template aging)

  // Prototype bank
  MAX_PROTOTYPES: 10,                // Max prototypes stored per worker
  PROTOTYPE_DIVERSITY_MIN: 0.95,     // If new embedding is > this similar to existing, skip it
  AUTH_UPDATE_MIN_SIMILARITY: 0.82,  // Only add auth prototype if this confident

  // Provisional trust (batch CSV enrollment)
  PROVISIONAL_THRESHOLD: 0.50,       // Lower threshold for provisionally enrolled workers
  PROVISIONAL_PROMOTE_COUNT: 3,      // Confirmed matches needed to promote provisional → full

  // Database
  DB_NAME: 'datalake_guard.db',
  MAX_UNSYNCED_LOGS: 10000,
  MAX_ENROLLED_WORKERS: 1000,

  // Encryption
  KEYCHAIN_SERVICE: 'com.datalakeguard.embeddingkey',
  HMAC_KEY_SERVICE: 'com.datalakeguard.hmackey',
  DEVICE_ID_SERVICE: 'com.datalakeguard.deviceid',
  ADMIN_PIN_CODE: '1234',

  // Liveness
  LIVENESS_MODE: 'passive',
  ENABLE_SIMULATOR_MODE: false,
  ENABLE_CLAHE: true,
  PASSIVE_LIVENESS_BUFFER_SIZE: 10,
  PASSIVE_LIVENESS_MIN_BLINKS: 1,

  // Rate limiting
  RATE_LIMIT_MAX_FAILURES: 3,
  RATE_LIMIT_WINDOW_MS: 60000,       // 1 minute window
  RATE_LIMIT_COOLDOWN_MS: 60000,     // 60-second lockout

  // Contextual confidence (GPS + time)
  WORKSITE_LAT: 19.076,
  WORKSITE_LNG: 72.877,
  WORKSITE_RADIUS_METERS: 500,
  SHIFT_START_HOUR: 7,
  SHIFT_END_HOUR: 19,

  // Device benchmark profile thresholds
  BENCHMARK_FAST_MS: 40,
  BENCHMARK_MID_MS: 80,

  // Cohort recalibration
  COHORT_RECALIBRATE_EVERY_N_AUTHS: 50,

  // Confidence trend
  CONFIDENCE_TREND_BASELINE_AUTHS: 20,
  CONFIDENCE_TREND_RECENT_AUTHS: 10,
  CONFIDENCE_WARN_DROP: 0.07,
  CONFIDENCE_CRITICAL_DROP: 0.12,
};
