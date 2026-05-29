// src/db/schema.ts

export const CREATE_EMBEDDINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS embeddings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                 TEXT NOT NULL,
    name                    TEXT NOT NULL,
    role                    TEXT NOT NULL DEFAULT 'Field Worker',
    embedding               BLOB NOT NULL,
    enrolled_at             INTEGER NOT NULL,
    source                  TEXT NOT NULL DEFAULT 'enrollment',
    lighting_bucket         TEXT NOT NULL DEFAULT 'unknown',
    pose_direction          TEXT NOT NULL DEFAULT 'center',
    provisional_trust_count INTEGER DEFAULT 0,
    threshold_override      REAL,
    embedding_hash          TEXT NOT NULL DEFAULT ''
  );
`;

export const CREATE_EMBEDDINGS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_embeddings_user_id ON embeddings (user_id);
`;

export const CREATE_AUTH_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS auth_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT,
    timestamp      INTEGER NOT NULL,
    confidence     REAL DEFAULT 0,
    liveness_score REAL,
    liveness_pass  INTEGER NOT NULL DEFAULT 0,
    result         TEXT NOT NULL,
    location_lat   REAL,
    location_lng   REAL,
    synced         INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_SYNC_META_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_meta (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    last_sync_time INTEGER,
    device_id      TEXT NOT NULL
  );
`;
