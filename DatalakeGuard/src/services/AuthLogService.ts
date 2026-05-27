// src/services/AuthLogService.ts

import { getDatabase } from '../db/database';
import { InputValidator } from './InputValidator';
import { Config } from '../constants/config';

export interface AuthLog {
  id?: number;
  userId: string | null;
  timestamp: number;
  confidence: number;
  livenessPass: boolean;
  result: 'authenticated' | 'unknown' | 'spoof_rejected';
  locationLat?: number;
  locationLng?: number;
  synced: boolean;
}

export class AuthLogService {

  // Called by Person B's AuthResultScreen immediately after each auth attempt
  static async logAuthAttempt(log: Omit<AuthLog, 'id' | 'synced'>): Promise<void> {
    try {
      InputValidator.validateAuthLog(log);
      
      let pendingCount = await this.getPendingCount();
      if (pendingCount >= Config.MAX_UNSYNCED_LOGS) {
        await this.purgeSyncedLogs();
        pendingCount = await this.getPendingCount();
        if (pendingCount >= Config.MAX_UNSYNCED_LOGS) {
          console.warn('[AuthLogService] Maximum unsynced logs limit reached. Rejecting auth log entry to prevent local DoS.');
          throw new Error('Database limit reached: Maximum unsynced logs exceeded');
        }
      }

      const db = await getDatabase();
      await db.executeSql(
        `INSERT INTO auth_logs 
         (user_id, timestamp, confidence, liveness_pass, result, location_lat, location_lng, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          log.userId,
          log.timestamp,
          log.confidence,
          log.livenessPass ? 1 : 0,
          log.result,
          log.locationLat ?? null,
          log.locationLng ?? null,
        ]
      );
    } catch (error) {
      console.error('[AuthLogService] Logging auth attempt failed');
      throw error;
    }
  }

  static async getPendingLogs(): Promise<AuthLog[]> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql(
        'SELECT * FROM auth_logs WHERE synced = 0 ORDER BY timestamp ASC',
        []
      );
      const logs: AuthLog[] = [];
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        logs.push({
          id: row.id,
          userId: row.user_id,
          timestamp: row.timestamp,
          confidence: row.confidence,
          livenessPass: row.liveness_pass === 1,
          result: row.result as any,
          locationLat: row.location_lat,
          locationLng: row.location_lng,
          synced: false,
        });
      }
      return logs;
    } catch (error) {
      console.error('[AuthLogService] Fetching pending logs failed');
      return [];
    }
  }

  static async markLogsAsSynced(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const db = await getDatabase();
      const placeholders = ids.map(() => '?').join(',');
      await db.executeSql(
        `UPDATE auth_logs SET synced = 1 WHERE id IN (${placeholders})`,
        ids
      );
    } catch (error) {
      console.error('[AuthLogService] Marking logs as synced failed');
      throw error;
    }
  }

  static async getPendingCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql(
        'SELECT COUNT(*) as count FROM auth_logs WHERE synced = 0',
        []
      );
      return result.rows.item(0).count;
    } catch (error) {
      console.error('[AuthLogService] Getting pending count failed');
      return 0;
    }
  }

  // Deletes logs that have been successfully synced (keeps unsynced)
  static async purgeSyncedLogs(): Promise<void> {
    try {
      const db = await getDatabase();
      await db.executeSql('DELETE FROM auth_logs WHERE synced = 1', []);
    } catch (error) {
      console.error('[AuthLogService] Purging synced logs failed');
      throw error;
    }
  }
}
