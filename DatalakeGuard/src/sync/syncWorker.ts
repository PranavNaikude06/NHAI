// src/sync/syncWorker.ts

import { SyncService } from '../services/SyncService';

/**
 * syncWorker.ts
 * 
 * This file serves as a dedicated entry point for synchronization tasks.
 * It can be integrated with background task runners like:
 * - react-native-background-fetch
 * - react-native-background-actions
 * - react-native-work-manager
 */

export const performSyncTask = async (deviceId: string) => {
  console.log('[SyncWorker] Background sync task started');
  
  try {
    await SyncService.sync(deviceId);
    console.log('[SyncWorker] Background sync task completed successfully');
    return true;
  } catch (error) {
    console.error('[SyncWorker] Background sync task failed:', error);
    return false;
  }
};
