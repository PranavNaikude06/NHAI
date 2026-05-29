// src/screens/HomeScreen.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Colors, Typography } from '../constants/colors';
import { EmbeddingService } from '../services/EmbeddingService';
import { SyncService } from '../services/SyncService';

export const HomeScreen = ({ navigation }: any) => {
  const scanAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [enrolledCount, setEnrolledCount] = useState<number>(0);
  const [pendingLogs, setPendingLogs] = useState<number>(0);

  const loadStatus = useCallback(async () => {
    try {
      const [enrolled, syncStatus] = await Promise.all([
        EmbeddingService.getEnrolledCount(),
        SyncService.getStatus(),
      ]);
      setEnrolledCount(enrolled);
      setPendingLogs(syncStatus.pendingCount);
    } catch (error) {
      console.error('[Home] Failed to load system status:', error);
    }
  }, []);

  useEffect(() => {
    // Loop scanning line animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Loop spinning circle animation
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 12000,
        useNativeDriver: true,
      })
    ).start();
  }, [scanAnim, spinAnim]);

  useEffect(() => {
    loadStatus();
    const unsubscribe = navigation.addListener('focus', loadStatus);
    return unsubscribe;
  }, [loadStatus, navigation]);

  const translateY = scanAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [16, 200, 16],
  });

  const opacity = scanAnim.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* TopAppBar */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={styles.headerIcon}>
            <Path
              d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
              fill={Colors.primary}
            />
          </Svg>
          <Text style={styles.headerTitle}>DatalakeGuard</Text>
        </View>
        <TouchableOpacity
          style={styles.adminIconButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('AdminLogin')}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 10 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z"
              fill={Colors.onSurfaceVariant}
            />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Main Content Canvas */}
      <View style={styles.content}>
        {/* Status Indicator */}
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>SYSTEM ARMED</Text>
        </View>

        {/* Face Scan Illustration Container */}
        <View style={styles.scannerWrapper}>
          {/* Dash ring spinning */}
          <Animated.View style={[styles.dashRingContainer, { transform: [{ rotate: spin }] }]}>
            <Svg width="210" height="210" viewBox="0 0 100 100">
              <Circle
                cx="50"
                cy="50"
                r="46"
                stroke="rgba(173, 199, 255, 0.15)"
                strokeWidth="1"
                strokeDasharray="4 4"
                fill="none"
              />
            </Svg>
          </Animated.View>

          {/* Center Biometric Icon */}
          <View style={styles.scannerCenter}>
            <Svg width="96" height="96" viewBox="0 0 24 24" fill="none">
              <Path
                d="M9 11.75c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h.01c.41 0 .75.34.75.75s-.34.75-.75.75zm6 0c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h.01c.41 0 .75.34.75.75s-.34.75-.75.75zm-3 4.25c-1.63 0-3.06-.79-3.92-2-.19-.27-.12-.64.15-.83.27-.19.64-.12.83.15.65.91 1.71 1.48 2.94 1.48s2.29-.57 2.94-1.48c.19-.27.56-.34.83-.15.27.19.34.56.15.83-.86 1.21-2.29 2-3.92 2zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-11c-2.48 0-4.5 2.02-4.5 4.5s2.02 4.5 4.5 4.5 4.5-2.02 4.5-4.5S14.48 9 12 9zm0 7.5c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"
                fill={Colors.primary}
              />
            </Svg>
            <Text style={styles.scannerCode}>
              {enrolledCount} profiles | {pendingLogs} pending logs
            </Text>
          </View>

          {/* Scanning Animation line */}
          <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }, { opacity }]} />
        </View>

        {/* Hero Text */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>Identity Verification</Text>
          <Text style={styles.description}>
            Multi-factor biometric validation required for Datalake node access.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('AuthCamera')}
          >
            <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={styles.buttonIcon}>
              <Path
                d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6-5c1.66 0 3 1.34 3 3v2H9V6c0-1.66 1.34-3 3-3zm6 17H6V10h12v10z"
                fill={Colors.text}
              />
            </Svg>
            <Text style={styles.primaryButtonText}>Authenticate</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('AdminLogin')}
          >
            <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={styles.buttonIcon}>
              <Path
                d="M12 1c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l3.79-3.79c1.54 1.23 3.49 1.97 5.61 1.97 4.97 0 9-4.03 9-9 0-4.97-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm1-9h-2v4h2V7zm0 6h-2v2h2v-2z"
                fill={Colors.text}
              />
            </Svg>
            <Text style={styles.secondaryButtonText}>Admin Panel</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Navigation stub */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navItemActive}>
          <Text style={styles.navTextActive}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('AdminLogin')}>
          <Text style={styles.navText}>Admin</Text>
        </TouchableOpacity>
      </View>
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
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    ...Typography.headlineLgMobile,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  adminIconButton: {
    padding: 8,
    borderRadius: 9999,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 9999,
    marginBottom: 32,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: 8,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  statusText: {
    ...Typography.labelMd,
    color: Colors.success,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  scannerWrapper: {
    width: 220,
    height: 220,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(139, 144, 159, 0.2)',
    backgroundColor: 'rgba(26, 115, 232, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    overflow: 'hidden',
    position: 'relative',
  },
  dashRingContainer: {
    position: 'absolute',
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerCenter: {
    alignItems: 'center',
    gap: 12,
  },
  scannerCode: {
    ...Typography.monoData,
    color: 'rgba(173, 199, 255, 0.6)',
    fontSize: 11,
    letterSpacing: 1,
  },
  scanLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    ...Typography.headlineLg,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    height: 48,
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    ...Typography.titleMd,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  secondaryButton: {
    flexDirection: 'row',
    height: 48,
    width: '100%',
    backgroundColor: Colors.surfaceContainer,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...Typography.titleMd,
    color: Colors.text,
  },
  buttonIcon: {
    marginRight: 8,
  },
  navBar: {
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainer,
    borderTopWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingBottom: 4,
  },
  navItemActive: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(26, 115, 232, 0.15)',
    borderRadius: 20,
  },
  navTextActive: {
    ...Typography.labelMd,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  navText: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
  },
});
