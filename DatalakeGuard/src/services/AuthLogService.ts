// src/services/AuthLogService.ts

import { getDatabase } from '../db/database';
import { InputValidator } from './InputValidator';
import { Config } from '../constants/config';

export interface AuthLog {
  id?: number;
  userId: string | null;
  timestamp: number;
  confidence: number;
  livenessScore?: number;
  livenessPass: boolean;
  result: 'authenticated' | 'unknown' | 'spoof_rejected';
  locationLat?: number;
  locationLng?: number;
  synced: boolean;
}

export interface ConfidenceTrend {
  baselineAverage: number;
  recentAverage: number;
  drop: number;
  status: 'normal' | 'warning' | 'critical';
}

export interface AuthAnomaly {
  type: 'LOCATION_JUMP' | 'TIMESTAMP_DUPLICATE' | 'FAILED_THEN_SUCCESS';
  severity: 'medium' | 'high';
  message: string;
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
      const anomalies = await this.detectAnomalies(log);
      if (anomalies.length > 0) {
        console.warn('[AuthLogService] Authentication anomalies detected:', anomalies);
      }
      await db.executeSql(
        `INSERT INTO auth_logs 
         (user_id, timestamp, confidence, liveness_score, liveness_pass, result, location_lat, location_lng, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          log.userId,
          log.timestamp,
          log.confidence,
          log.livenessScore ?? null,
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
          livenessScore: row.liveness_score,
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

  static async isRateLimited(now: number = Date.now()): Promise<boolean> {
    try {
      const db = await getDatabase();
      const cutoff = now - Config.RATE_LIMIT_WINDOW_MS;
      const [result] = await db.executeSql(
        `SELECT result FROM auth_logs
         WHERE timestamp >= ?
         ORDER BY timestamp DESC
         LIMIT ?`,
        [cutoff, Config.RATE_LIMIT_MAX_FAILURES]
      );

      if (result.rows.length < Config.RATE_LIMIT_MAX_FAILURES) return false;

      for (let i = 0; i < result.rows.length; i++) {
        if (result.rows.item(i).result === 'authenticated') return false;
      }
      return true;
    } catch (error) {
      console.error('[AuthLogService] Rate limit check failed');
      return false;
    }
  }

  static async getConfidenceTrend(userId: string): Promise<ConfidenceTrend | null> {
    try {
      const db = await getDatabase();
      const totalNeeded = Config.CONFIDENCE_TREND_BASELINE_AUTHS + Config.CONFIDENCE_TREND_RECENT_AUTHS;
      const [result] = await db.executeSql(
        `SELECT confidence FROM auth_logs
         WHERE user_id = ? AND result = 'authenticated'
         ORDER BY timestamp DESC
         LIMIT ?`,
        [userId, totalNeeded]
      );

      const values: number[] = [];
      for (let i = 0; i < result.rows.length; i++) {
        values.push(result.rows.item(i).confidence);
      }
      if (values.length < Config.CONFIDENCE_TREND_RECENT_AUTHS + 3) return null;

      const recent = values.slice(0, Config.CONFIDENCE_TREND_RECENT_AUTHS);
      const baseline = values.slice(Config.CONFIDENCE_TREND_RECENT_AUTHS);
      if (baseline.length === 0) return null;

      const recentAverage = recent.reduce((a, b) => a + b, 0) / recent.length;
      const baselineAverage = baseline.reduce((a, b) => a + b, 0) / baseline.length;
      const drop = baselineAverage - recentAverage;
      const status = drop >= Config.CONFIDENCE_CRITICAL_DROP
        ? 'critical'
        : drop >= Config.CONFIDENCE_WARN_DROP
          ? 'warning'
          : 'normal';

      return { baselineAverage, recentAverage, drop, status };
    } catch (error) {
      console.error('[AuthLogService] Confidence trend calculation failed');
      return null;
    }
  }

  static async detectAnomalies(log: Omit<AuthLog, 'id' | 'synced'>): Promise<AuthAnomaly[]> {
    const anomalies: AuthAnomaly[] = [];
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql(
        `SELECT timestamp, result, location_lat, location_lng FROM auth_logs
         WHERE user_id = ?
         ORDER BY timestamp DESC
         LIMIT 5`,
        [log.userId]
      );

      for (let i = 0; i < result.rows.length; i++) {
        const previous = result.rows.item(i);
        if (previous.timestamp === log.timestamp) {
          anomalies.push({
            type: 'TIMESTAMP_DUPLICATE',
            severity: 'high',
            message: 'Duplicate authentication timestamp for same worker',
          });
        }

        if (
          log.locationLat !== undefined &&
          log.locationLng !== undefined &&
          previous.location_lat !== null &&
          previous.location_lng !== null &&
          previous.location_lat !== undefined &&
          previous.location_lng !== undefined
        ) {
          const deltaMs = Math.abs(log.timestamp - previous.timestamp);
          const distance = distanceMeters(log.locationLat, log.locationLng, previous.location_lat, previous.location_lng);
          if (deltaMs < 10 * 60 * 1000 && distance > 5000) {
            anomalies.push({
              type: 'LOCATION_JUMP',
              severity: 'high',
              message: 'Worker location changed too far within a short interval',
            });
          }
        }
      }

      const recentFailures = Array.from({ length: result.rows.length }, (_, i) => result.rows.item(i))
        .filter(row => row.result !== 'authenticated' && log.timestamp - row.timestamp < Config.RATE_LIMIT_WINDOW_MS);
      if (log.result === 'authenticated' && recentFailures.length >= 2) {
        anomalies.push({
          type: 'FAILED_THEN_SUCCESS',
          severity: 'medium',
          message: 'Successful authentication followed recent failed attempts',
        });
      }
    } catch (error) {
      console.error('[AuthLogService] Anomaly detection failed');
    }
    return anomalies;
  }
}
