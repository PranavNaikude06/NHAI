// src/services/SyncService.ts

import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';
import { Config } from '../constants/config';
import { AuthLogService } from './AuthLogService';
import { getDatabase } from '../db/database';
import { PayloadSigner } from './PayloadSigner';

export interface SyncStatus {
  pendingCount: number;
  lastSyncTime: number | null;
  isSyncing: boolean;
  lastError: string | null;
}

export class SyncService {
  private static isSyncing = false;
  private static lastSyncTime: number | null = null;
  private static lastError: string | null = null;
  private static unsubscribeNetInfo: (() => void) | null = null;

  // Call this in App.tsx after database init
  static startConnectivityListener(deviceId: string): void {
    if (this.unsubscribeNetInfo) return;

    this.unsubscribeNetInfo = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && !this.isSyncing) {
        console.log('[SyncService] Connectivity restored, starting sync...');
        await this.sync(deviceId);
      }
    });
  }

  static stopConnectivityListener(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }

  // Can also be triggered manually from Sync Status screen
  static async sync(deviceId: string): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.lastError = null;

    try {
      const pendingLogs = await AuthLogService.getPendingLogs();
      if (pendingLogs.length === 0) {
        console.log('[SyncService] No pending logs to sync.');
        this.isSyncing = false;
        return;
      }

      console.log(`[SyncService] Syncing ${pendingLogs.length} logs...`);

      // Batch into chunks of SYNC_BATCH_SIZE
      const chunks = this.chunk(pendingLogs, Config.SYNC_BATCH_SIZE);

      for (const chunk of chunks) {
        const payload = {
          device_id: deviceId,
          sync_timestamp: Date.now(),
          auth_logs: chunk.map(log => ({
            log_id: log.id,
            user_id: log.userId,
            timestamp: log.timestamp,
            confidence: log.confidence,
            liveness_pass: log.livenessPass,
            result: log.result,
            location: log.locationLat
              ? { lat: log.locationLat, lng: log.locationLng }
              : null,
          })),
        };

        const signature = await PayloadSigner.sign(payload, Config.AWS_API_KEY);

        const response = await axios.post(Config.AWS_SYNC_ENDPOINT, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': Config.AWS_API_KEY,
            'x-signature': signature,
          },
          timeout: 15000, // 15s timeout
        });

        if (response.data.ok) {
          const syncedIds = chunk.map(log => log.id!).filter(Boolean);
          await AuthLogService.markLogsAsSynced(syncedIds);
          console.log(`[SyncService] Successfully synced ${syncedIds.length} logs.`);
        } else {
          throw new Error(response.data.error || 'Server rejected sync payload');
        }
      }

      this.lastSyncTime = Date.now();
      await this.saveLastSyncTime(this.lastSyncTime, deviceId);
      console.log('[SyncService] Sync sequence complete.');

    } catch (error: any) {
      this.lastError = error.message ?? 'Sync failed';
      console.error('[SyncService] Sync failed');
      // Don't throw — sync failure is non-blocking
    } finally {
      this.isSyncing = false;
    }
  }

  static async getStatus(): Promise<SyncStatus> {
    return {
      pendingCount: await AuthLogService.getPendingCount(),
      lastSyncTime: this.lastSyncTime,
      isSyncing: this.isSyncing,
      lastError: this.lastError,
    };
  }

  private static chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private static async saveLastSyncTime(time: number, deviceId: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.executeSql(
        'INSERT OR REPLACE INTO sync_meta (id, last_sync_time, device_id) VALUES (1, ?, ?)',
        [time, deviceId]
      );
    } catch (error) {
      console.error('[SyncService] Saving last sync time failed');
    }
  }
}
