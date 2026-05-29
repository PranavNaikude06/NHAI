// src/db/migrations.ts

import { SQLiteDatabase } from 'react-native-sqlite-storage';

/**
 * Migration Service
 * 
 * Handles schema updates between app versions.
 * Currently, we are at version 1 (initialization).
 */

export const runMigrations = async (db: SQLiteDatabase): Promise<void> => {
  try {
    const [result] = await db.executeSql('PRAGMA table_info(embeddings)', []);
    const columns: string[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      columns.push(result.rows.item(i).name);
    }

    if (columns.length > 0 && !columns.includes('source')) {
      console.log('[Migrations] Upgrading embeddings table to support multi-prototype schema...');
      await db.executeSql('BEGIN TRANSACTION');
      
      // Rename old table
      await db.executeSql('ALTER TABLE embeddings RENAME TO embeddings_old');
      
      // Create new table
      await db.executeSql(`
        CREATE TABLE embeddings (
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
        )
      `);
      
      // Copy data
      await db.executeSql(`
        INSERT INTO embeddings (user_id, name, role, embedding, enrolled_at, source, lighting_bucket, pose_direction, provisional_trust_count, threshold_override, embedding_hash)
        SELECT user_id, name, role, embedding, enrolled_at, 'enrollment', 'unknown', 'center', 0, NULL, ''
        FROM embeddings_old
      `);
      
      // Drop old table
      await db.executeSql('DROP TABLE embeddings_old');
      
      await db.executeSql('COMMIT');
      console.log('[Migrations] Upgrade complete.');
    } else {
      console.log('[Migrations] Schema is up to date or empty.');
    }

    const [authLogInfo] = await db.executeSql('PRAGMA table_info(auth_logs)', []);
    const authLogColumns: string[] = [];
    for (let i = 0; i < authLogInfo.rows.length; i++) {
      authLogColumns.push(authLogInfo.rows.item(i).name);
    }
    if (authLogColumns.length > 0 && !authLogColumns.includes('liveness_score')) {
      console.log('[Migrations] Adding liveness_score to auth_logs...');
      await db.executeSql('ALTER TABLE auth_logs ADD COLUMN liveness_score REAL');
    }
  } catch (error) {
    try {
      await db.executeSql('ROLLBACK');
    } catch (rollbackError) {
      console.warn('[Migrations] Rollback failed after migration error:', rollbackError);
    }
    console.error('[Migrations] Error running migrations:', error);
    throw error;
  }
};
