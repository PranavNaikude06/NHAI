// src/screens/auth/AuthResultScreen.tsx

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Typography } from '../../constants/colors';
import { ConfidenceBar } from '../../components/ConfidenceBar';

export const AuthResultScreen = ({ route, navigation }: any) => {
  const { result } = route.params || { result: { identity: null, name: null, confidence: 0, livenessPass: false } };
  
  const isSuccess = result.livenessPass && result.identity !== null;
  const isSpoof = !result.livenessPass;
  const timestamp = result.timestamp ?? Date.now();
  const livenessScore = result.livenessScore ?? (result.livenessPass ? 1 : 0);
  const statusCode = result.statusCode ?? (isSpoof ? 'ERR_LIVENESS_REJECTED' : 'ERR_NO_MATCH');

  useEffect(() => {
    // Automatically navigate back to Home after 4.5 seconds on success
    if (isSuccess) {
      const timer = setTimeout(() => {
        navigation.navigate('Home');
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, navigation]);

  const handleDone = () => {
    navigation.navigate('Home');
  };

  const handleRetry = () => {
    navigation.replace('AuthCamera');
  };

  // ── Success State ───────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.success }]}>
        <View style={styles.content}>
          {/* Animated Success Checkmark Icon */}
          <View style={styles.iconCircle}>
            <Svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <Path
                d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                fill={Colors.success}
                strokeWidth="1"
              />
            </Svg>
          </View>

          <Text style={styles.resultTitle}>ACCESS GRANTED</Text>

          {/* Worker Info Card */}
          <View style={styles.infoContainer}>
            <Text style={styles.nameText}>{result.name?.toUpperCase() || 'UNKNOWN WORKER'}</Text>
            {result.role && <Text style={styles.roleText}>{String(result.role).toUpperCase()}</Text>}
            <Text style={styles.idText}>ID: {result.identity}</Text>
          </View>

          {/* Confidence bar */}
          <View style={styles.metaContainer}>
            <ConfidenceBar confidence={result.confidence} />
            
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Authenticated At:</Text>
              <Text style={styles.timeValue}>
                {new Date(timestamp).toLocaleTimeString()}
              </Text>
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>Verification Date:</Text>
              <Text style={styles.timeValue}>
                {new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.doneButton} activeOpacity={0.8} onPress={handleDone}>
          <Text style={[styles.doneButtonText, { color: Colors.success }]}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Failure State (Spoof Rejected / Unknown Face) ───────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: Colors.danger }]}>
      <View style={styles.content}>
        {/* Warning Icon */}
        <View style={styles.iconCircle}>
          {isSpoof ? (
            // Shield Lock Slash icon (Spoof)
            <Svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 15l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
                fill={Colors.danger}
              />
            </Svg>
          ) : (
            // Person / Face unknown question mark icon
            <Svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"
                fill={Colors.danger}
              />
            </Svg>
          )}
        </View>

        <Text style={styles.resultTitle}>
          {isSpoof ? 'LIVENESS CHECK FAILED' : 'FACE NOT RECOGNIZED'}
        </Text>

        <Text style={styles.failureReason}>
          {isSpoof
            ? 'Warning: Spoofing attempt detected! Flat surface or photo attack suspected.'
            : 'Access Denied: Face biometric vector does not match any registered worker profiles.'}
        </Text>

        {/* Diagnostic Data */}
        <View style={styles.anomalyCard}>
          <Text style={styles.anomalyTitle}>DIAGNOSTIC METRICS</Text>
          <View style={styles.anomalyRow}>
            <Text style={styles.anomalyLabel}>Liveness Score:</Text>
            <Text style={styles.anomalyValue}>{(livenessScore * 100).toFixed(0)}%</Text>
          </View>
          <View style={styles.anomalyRow}>
            <Text style={styles.anomalyLabel}>Match Similarity:</Text>
            <Text style={styles.anomalyValue}>{(result.confidence * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.anomalyRow}>
            <Text style={styles.anomalyLabel}>Status Code:</Text>
            <Text style={styles.anomalyValue}>{statusCode}</Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.retryButton} activeOpacity={0.8} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.failDoneButton} activeOpacity={0.8} onPress={handleDone}>
          <Text style={styles.failDoneButtonText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  resultTitle: {
    ...Typography.headlineLg,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 24,
    textAlign: 'center',
  },
  infoContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  nameText: {
    ...Typography.resultName,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  roleText: {
    ...Typography.resultRole,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: 'bold',
  },
  idText: {
    ...Typography.bodyMd,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  metaContainer: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeLabel: {
    ...Typography.labelMd,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  timeValue: {
    ...Typography.labelMd,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  failureReason: {
    ...Typography.bodyLg,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 290,
    marginBottom: 32,
  },
  anomalyCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  anomalyTitle: {
    ...Typography.labelMd,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  anomalyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  anomalyLabel: {
    ...Typography.bodyMd,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  anomalyValue: {
    ...Typography.bodyMd,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  doneButton: {
    height: 52,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  doneButtonText: {
    ...Typography.titleMd,
    fontWeight: 'bold',
  },
  buttonGroup: {
    width: '100%',
    gap: 16,
  },
  retryButton: {
    height: 52,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    ...Typography.titleMd,
    color: Colors.danger,
    fontWeight: 'bold',
  },
  failDoneButton: {
    height: 52,
    width: '100%',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failDoneButtonText: {
    ...Typography.titleMd,
    color: '#FFFFFF',
  },
});
