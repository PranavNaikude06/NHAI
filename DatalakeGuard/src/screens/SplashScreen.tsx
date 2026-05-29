// src/screens/SplashScreen.tsx

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors, Typography } from '../constants/colors';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const SplashScreen = ({ navigation }: any) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Home');
    }, 2500);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Background Dots Grid */}
      <Svg height={screenHeight} width={screenWidth} style={styles.gridBackground} pointerEvents="none">
        <Rect width="100%" height="100%" fill="transparent" />
        {/* Draw subtle grid pattern */}
        {Array.from({ length: 15 }).map((_row, i) => (
          Array.from({ length: 10 }).map((_column, j) => (
            <Path
              key={`${i}-${j}`}
              d={`M ${j * (screenWidth / 9)} ${i * (screenHeight / 14)} h 1 v 1`}
              stroke="rgba(26, 115, 232, 0.08)"
              strokeWidth="2"
            />
          ))
        ))}
      </Svg>

      <View style={styles.spacer} />

      {/* Center Branding Cluster */}
      <View style={styles.centerCluster}>
        <View style={styles.glowOuter}>
          <View style={styles.logoContainer}>
            {/* Shield Lock Icon in SVG */}
            <Svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <Path
                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                fill={Colors.primary}
              />
            </Svg>
          </View>
        </View>

        <Text style={styles.appName}>DatalakeGuard</Text>
        <Text style={styles.subtext}>FACE AUTHENTICATION SYSTEM</Text>
      </View>

      {/* Bottom Footer Section */}
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
        
        <View style={styles.badge}>
          <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={styles.badgeIcon}>
            <Path
              d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
              fill={Colors.success}
            />
          </Svg>
          <Text style={styles.badgeText}>End-to-End Encrypted</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 64,
  },
  gridBackground: {
    ...StyleSheet.absoluteFill,
    opacity: 0.3,
  },
  spacer: {
    height: 40,
  },
  centerCluster: {
    alignItems: 'center',
    gap: 24,
  },
  glowOuter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    // Glow effect
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  appName: {
    ...Typography.headlineXl,
    color: Colors.text,
    textAlign: 'center',
  },
  subtext: {
    ...Typography.labelMd,
    color: Colors.textSecondary,
    letterSpacing: 2.8,
  },
  footer: {
    alignItems: 'center',
    gap: 24,
    width: '100%',
  },
  loader: {
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 9999,
  },
  badgeIcon: {
    marginRight: 6,
  },
  badgeText: {
    ...Typography.labelMd,
    color: Colors.onSurface,
    fontSize: 11,
  },
});
