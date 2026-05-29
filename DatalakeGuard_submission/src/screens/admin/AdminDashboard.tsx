// src/screens/admin/AdminDashboard.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Typography } from '../../constants/colors';
import { OfflineBadge } from '../../components/OfflineBadge';
import { EmbeddingService } from '../../services/EmbeddingService';
import { SyncService } from '../../services/SyncService';

export const AdminDashboard = ({ navigation }: any) => {
  const [enrolledCount, setEnrolledCount] = useState<number>(0);
  const [pendingLogs, setPendingLogs] = useState<number>(0);
  const [lastSyncText, setLastSyncText] = useState<string>('Never');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadDashboardData = async () => {
    try {
      const enrolled = await EmbeddingService.getEnrolledCount();
      setEnrolledCount(enrolled);

      const status = await SyncService.getStatus();
      setPendingLogs(status.pendingCount);

      if (status.lastSyncTime) {
        const diffMs = Date.now() - status.lastSyncTime;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) {
          setLastSyncText('Just now');
        } else if (diffMin < 60) {
          setLastSyncText(`${diffMin}m ago`);
        } else {
          const diffHrs = Math.floor(diffMin / 60);
          setLastSyncText(`${diffHrs}h ago`);
        }
      } else {
        setLastSyncText('Never');
      }
    } catch (e) {
      console.error('[Dashboard] Error loading data:', e);
    }
  };

  useEffect(() => {
    loadDashboardData();
    // Refresh whenever the screen is focused
    const unsubscribe = navigation.addListener('focus', () => {
      loadDashboardData();
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Home')}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
              fill={Colors.text}
            />
          </Svg>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>System Hub</Text>
        <OfflineBadge />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.sectionLabel}>SYSTEM HEALTH</Text>
          <Text style={styles.mainTitle}>Admin Dashboard</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Enrolled Workers Card */}
          <View style={[styles.statCard, { borderLeftColor: Colors.primary }]}>
            <View>
              <Text style={styles.statLabel}>Enrolled Workers</Text>
              <Text style={styles.statValue}>{enrolledCount}</Text>
            </View>
            <View style={styles.statIconContainer}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 3.24 5 5s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                  fill={Colors.primary}
                />
              </Svg>
            </View>
          </View>

          {/* Pending Sync Card */}
          <TouchableOpacity
            style={[styles.statCard, { borderLeftColor: Colors.warning }]}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('SyncStatus')}
          >
            <View>
              <Text style={styles.statLabel}>Pending Sync Logs</Text>
              <Text style={styles.statValue}>{pendingLogs}</Text>
            </View>
            <View style={styles.statIconContainer}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                  fill={Colors.warning}
                />
              </Svg>
            </View>
          </TouchableOpacity>

          {/* Last Sync Card */}
          <TouchableOpacity
            style={[styles.statCard, { borderLeftColor: Colors.success }]}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('SyncStatus')}
          >
            <View>
              <Text style={styles.statLabel}>Last Sync</Text>
              <Text style={styles.statValueSub}>{lastSyncText}</Text>
            </View>
            <View style={styles.statIconContainer}>
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8h-1.5z"
                  fill={Colors.success}
                />
              </Svg>
            </View>
          </TouchableOpacity>
        </View>

        {/* Management Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionLabel}>MANAGEMENT ACTIONS</Text>

          <TouchableOpacity
            style={styles.primaryActionButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Enroll')}
          >
            <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={styles.actionIcon}>
              <Path
                d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                fill={Colors.text}
              />
            </Svg>
            <Text style={styles.primaryActionText}>Enroll New Worker</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActionsRow}>
            <TouchableOpacity
              style={styles.secondaryActionButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('SyncStatus')}
            >
              <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={styles.actionIcon}>
                <Path
                  d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2zm0 8H7v-2h10v2z"
                  fill={Colors.text}
                />
              </Svg>
              <Text style={styles.secondaryActionText}>Sync Status</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryActionButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Settings')}
            >
              <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={styles.actionIcon}>
                <Path
                  d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                  fill={Colors.text}
                />
              </Svg>
              <Text style={styles.secondaryActionText}>Settings</Text>
            </TouchableOpacity>
          </View>
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
    gap: 28,
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
  statsGrid: {
    gap: 16,
  },
  statCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  statLabel: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
  },
  statValue: {
    ...Typography.headlineXl,
    color: Colors.text,
    marginTop: 4,
  },
  statValueSub: {
    ...Typography.titleMd,
    color: Colors.text,
    fontSize: 20,
    marginTop: 8,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsSection: {
    gap: 16,
  },
  primaryActionButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryActionText: {
    ...Typography.titleMd,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  secondaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    height: 52,
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    ...Typography.titleMd,
    color: Colors.text,
    fontSize: 14,
  },
  actionIcon: {
    marginRight: 8,
  },
});
export default AdminDashboard;
