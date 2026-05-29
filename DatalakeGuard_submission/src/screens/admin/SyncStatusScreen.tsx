// src/screens/admin/SyncStatusScreen.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import NetInfo from '@react-native-community/netinfo';
import { Colors, Typography } from '../../constants/colors';
import { OfflineBadge } from '../../components/OfflineBadge';
import { SyncService, SyncStatus } from '../../services/SyncService';
import { AuthLogService, AuthLog } from '../../services/AuthLogService';
import { getDatabase } from '../../db/database';
import { DeviceIdentityService } from '../../services/DeviceIdentityService';

export const SyncStatusScreen = ({ navigation }: any) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [logs, setLogs] = useState<AuthLog[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string>('');

  const loadData = async () => {
    try {
      // Load status metrics
      const status = await SyncService.getStatus();
      setSyncStatus(status);
      setDeviceId(await DeviceIdentityService.getDeviceId());

      // Listen to connectivity
      const state = await NetInfo.fetch();
      setIsOnline(!!state.isConnected);

      // Load recent 20 logs from SQLite database
      const db = await getDatabase();
      const [result] = await db.executeSql(
        'SELECT * FROM auth_logs ORDER BY timestamp DESC LIMIT 20',
        []
      );
      
      const loadedLogs: AuthLog[] = [];
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        loadedLogs.push({
          id: row.id,
          userId: row.user_id,
          timestamp: row.timestamp,
          confidence: row.confidence,
          livenessPass: row.liveness_pass === 1,
          result: row.result as any,
          synced: row.synced === 1,
        });
      }
      setLogs(loadedLogs);
    } catch (e) {
      console.error('[SyncStatus] Loading logs failed:', e);
    }
  };

  useEffect(() => {
    loadData();
    // Subscribe to connection updates
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const handleSyncNow = async () => {
    if (!isOnline) {
      Alert.alert('Offline Warning', 'Cannot sync logs while offline. Please connect to the internet.');
      return;
    }
    
    setSyncing(true);
    try {
      const activeDeviceId = deviceId || await DeviceIdentityService.getDeviceId();
      await SyncService.sync(activeDeviceId);
      await loadData();
      Alert.alert('Sync Processed', 'Logs sync routine executed successfully.');
    } catch (error: any) {
      Alert.alert('Sync Failed', error.message || 'An unexpected error occurred during sync.');
    } finally {
      setSyncing(false);
    }
  };

  const handlePurgeLogs = async () => {
    try {
      await AuthLogService.purgeSyncedLogs();
      await loadData();
      Alert.alert('Database Cleaned', 'Successfully purged synced logs from local storage.');
    } catch (error) {
      console.error('[SyncStatus] Purge synced logs failed:', error);
      Alert.alert('Error', 'Failed to purge synced records.');
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
              fill={Colors.text}
            />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sync Manager</Text>
        <OfflineBadge />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.sectionLabel}>AWS DATA SYNC LAYER</Text>
          <Text style={styles.mainTitle}>Sync Status</Text>
        </View>

        {/* Sync Status Overview Card */}
        <View style={styles.overviewCard}>
          <Text style={styles.cardHeader}>CLOUD INTEGRATION STATUS</Text>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Network Connection</Text>
            <Text style={[styles.statusValue, { color: isOnline ? Colors.success : Colors.danger }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Device Identity</Text>
            <Text style={styles.statusValue}>{deviceId || 'Loading...'}</Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Pending Sync Logs</Text>
            <Text style={[styles.statusValue, { color: syncStatus?.pendingCount ? Colors.warning : Colors.text }]}>
              {syncStatus?.pendingCount ?? 0} records
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Last Successfully Synced</Text>
            <Text style={styles.statusValue}>
              {syncStatus?.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleString() : 'Never'}
            </Text>
          </View>

          {syncStatus?.lastError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorLabel}>Last Error:</Text>
              <Text style={styles.errorText}>{syncStatus.lastError}</Text>
            </View>
          )}

          {/* Sync Trigger Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.syncBtn,
                (!isOnline || syncing) && styles.disabledBtn,
                { backgroundColor: Colors.primary }
              ]}
              disabled={!isOnline || syncing}
              activeOpacity={0.8}
              onPress={handleSyncNow}
            >
              {syncing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.syncBtnText}>Sync Now</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.syncBtn, styles.purgeBtn]}
              activeOpacity={0.8}
              onPress={handlePurgeLogs}
            >
              <Text style={styles.purgeBtnText}>Purge Synced</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logs Table / List */}
        <View style={styles.logsSection}>
          <Text style={styles.sectionLabel}>RECENT SYSTEM LOGS</Text>
          
          {logs.length === 0 ? (
            <View style={styles.emptyLogsCard}>
              <Text style={styles.emptyText}>No authentication logs recorded yet.</Text>
            </View>
          ) : (
            logs.map(log => {
              const success = log.result === 'authenticated';
              const spoof = log.result === 'spoof_rejected';
              
              let badgeColor = Colors.danger;
              let label = 'FAILED';
              if (success) {
                badgeColor = Colors.success;
                label = 'PASSED';
              } else if (spoof) {
                badgeColor = Colors.danger;
                label = 'SPOOF';
              }

              return (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logLeft}>
                    <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
                      <Text style={styles.statusBadgeText}>{label}</Text>
                    </View>
                    <View style={styles.logDetails}>
                      <Text style={styles.logWorker}>
                        {log.userId ? `ID: ${log.userId}` : 'Unknown Profile'}
                      </Text>
                      <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                    </View>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={styles.logConfidence}>
                      {(log.confidence * 100).toFixed(0)}% Match
                    </Text>
                    <Text style={[styles.syncStatusText, { color: log.synced ? Colors.success : Colors.warning }]}>
                      {log.synced ? 'Synced' : 'Local'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: Colors.surfaceContainer,
    borderBottomWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    ...Typography.titleMd,
    color: Colors.text,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
  },
  titleSection: {
    gap: 4,
  },
  sectionLabel: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  mainTitle: {
    ...Typography.headlineLg,
    color: Colors.text,
    fontSize: 26,
  },
  overviewCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingBottom: 8,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  statusValue: {
    ...Typography.bodyLg,
    color: Colors.text,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: 'rgba(234, 67, 53, 0.05)',
    borderColor: 'rgba(234, 67, 53, 0.2)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  errorLabel: {
    ...Typography.labelMd,
    color: Colors.danger,
    fontWeight: 'bold',
  },
  errorText: {
    ...Typography.bodyMd,
    color: Colors.danger,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  syncBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purgeBtn: {
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
  },
  disabledBtn: {
    backgroundColor: Colors.surfaceContainerHighest,
    opacity: 0.5,
  },
  syncBtnText: {
    ...Typography.titleMd,
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  purgeBtnText: {
    ...Typography.titleMd,
    color: Colors.text,
    fontSize: 14,
  },
  logsSection: {
    gap: 12,
  },
  emptyLogsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  emptyText: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  logCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: 60,
    alignItems: 'center',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  logDetails: {
    gap: 2,
  },
  logWorker: {
    ...Typography.bodyLg,
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  logTime: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontSize: 11,
  },
  logRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  logConfidence: {
    ...Typography.bodyMd,
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 13,
  },
  syncStatusText: {
    ...Typography.labelMd,
    fontSize: 10,
  },
});
export default SyncStatusScreen;
