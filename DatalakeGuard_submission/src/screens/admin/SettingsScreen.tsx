// src/screens/admin/SettingsScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Switch, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Typography } from '../../constants/colors';
import { OfflineBadge } from '../../components/OfflineBadge';
import { Config } from '../../constants/config';
import { PrototypeService } from '../../services/PrototypeService';
import { getDatabase } from '../../db/database';
import { getModelDiagnostics, type ModelDiagnostic } from '../../native/TFLiteBridge';
import { DeviceIdentityService } from '../../services/DeviceIdentityService';

const switchTrackColors = {
  false: Colors.surfaceContainerHighest,
  true: 'rgba(26, 115, 232, 0.45)',
};

export const SettingsScreen = ({ navigation }: any) => {
  const [threshold, setThreshold] = useState<number>(Config.COSINE_THRESHOLD);
  const [simulatorMode, setSimulatorMode] = useState<boolean>(Config.ENABLE_SIMULATOR_MODE);
  const [modelDiagnostics, setModelDiagnostics] = useState<ModelDiagnostic[]>([]);
  const [modelDiagnosticsLoading, setModelDiagnosticsLoading] = useState<boolean>(true);
  const [deviceId, setDeviceId] = useState<string>('');
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const loadRuntimeData = async () => {
      try {
        const [models, identity] = await Promise.all([
          getModelDiagnostics(),
          DeviceIdentityService.getDeviceId(),
        ]);
        if (mounted) {
          setModelDiagnostics(models);
          setDeviceId(identity);
        }
      } catch (error) {
        console.error('[Settings] Failed to load runtime diagnostics:', error);
      } finally {
        if (mounted) {
          setModelDiagnosticsLoading(false);
        }
      }
    };

    loadRuntimeData();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAdjustThreshold = (direction: 'up' | 'down') => {
    let nextVal = threshold;
    if (direction === 'up') {
      nextVal = Math.min(0.95, parseFloat((threshold + 0.05).toFixed(2)));
    } else {
      nextVal = Math.max(0.40, parseFloat((threshold - 0.05).toFixed(2)));
    }
    setThreshold(nextVal);
    Config.COSINE_THRESHOLD = nextVal;
  };

  const handleToggleSimulatorMode = (enabled: boolean) => {
    setSimulatorMode(enabled);
    Config.ENABLE_SIMULATOR_MODE = enabled;
  };

  const handleRunCohortCalibration = async () => {
    setCalibrating(true);
    try {
      await PrototypeService.recomputeAllThresholds();
      setCalibrating(false);
      Alert.alert(
        'Calibration Complete',
        'Successfully recalibrated individual matching thresholds against current cohort margins.'
      );
    } catch (error) {
      console.error('[Settings] Cohort calibration failed:', error);
      setCalibrating(false);
      Alert.alert(
        'Calibration Error',
        'Cohort calibration requires at least two enrolled users with genuine prototypes.'
      );
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Reset Data',
      'Are you sure you want to clear all biometric profiles and authentication logs from local storage? This action is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Reset',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              const db = await getDatabase();
              await db.executeSql('DELETE FROM embeddings');
              await db.executeSql('DELETE FROM auth_logs');
              setClearing(false);
              Alert.alert('Reset Success', 'Local secure memory cache cleared successfully.');
            } catch (error) {
              console.error('[Settings] Local data reset failed:', error);
              setClearing(false);
              Alert.alert('Reset Failed', 'Could not empty SQLite storage tables.');
            }
          },
        },
      ]
    );
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
        <Text style={styles.headerTitle}>System Settings</Text>
        <OfflineBadge />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.sectionLabel}>TUNING ENVIRONMENT</Text>
          <Text style={styles.mainTitle}>Configurations</Text>
        </View>

        {/* Global Cosine Threshold */}
        <View style={styles.settingCard}>
          <Text style={styles.settingHeader}>RECOGNITION THRESHOLD</Text>
          <Text style={styles.settingDesc}>
            Adjust the minimum cosine similarity margin required for a match confirmation. High values prevent False Acceptances but increase False Rejection rates.
          </Text>

          <View style={styles.thresholdControlRow}>
            <TouchableOpacity
              style={styles.adjustBtn}
              onPress={() => handleAdjustThreshold('down')}
            >
              <Text style={styles.adjustBtnText}>-</Text>
            </TouchableOpacity>

            <View style={styles.thresholdDisplay}>
              <Text style={styles.thresholdVal}>{threshold.toFixed(2)}</Text>
              <Text style={styles.thresholdLabel}>MARGIN</Text>
            </View>

            <TouchableOpacity
              style={styles.adjustBtn}
              onPress={() => handleAdjustThreshold('up')}
            >
              <Text style={styles.adjustBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Simulator mode */}
        <View style={styles.settingCard}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.settingHeader}>CAMERA SIMULATOR MODE</Text>
              <Text style={styles.settingDesc}>
                Enables emulator-safe biometric demo controls for success, spoof, and unknown-face flows.
              </Text>
            </View>
            <Switch
              value={simulatorMode}
              onValueChange={handleToggleSimulatorMode}
              trackColor={switchTrackColors}
              thumbColor={simulatorMode ? Colors.primary : Colors.outline}
            />
          </View>
        </View>

        {/* Cohort Calibration */}
        <View style={styles.settingCard}>
          <Text style={styles.settingHeader}>COHORT THRESHOLD CALIBRATION</Text>
          <Text style={styles.settingDesc}>
            Run Equal Error Rate (EER) computations dynamically across all registered users' biometric banks to auto-adjust individualized security tolerances.
          </Text>

          <TouchableOpacity
            style={[styles.actionBtn, calibrating && styles.disabledBtn]}
            disabled={calibrating}
            onPress={handleRunCohortCalibration}
          >
            {calibrating ? (
              <Text style={styles.actionBtnText}>Running EER Calibration...</Text>
            ) : (
              <Text style={styles.actionBtnText}>Calibrate Cohort Thresholds</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Model Information */}
        <View style={styles.settingCard}>
          <Text style={styles.settingHeader}>TFLITE MODEL DIAGNOSTICS</Text>

          {modelDiagnosticsLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            modelDiagnostics.map(model => (
              <View style={styles.modelRow} key={model.filename}>
                <View style={styles.modelCopy}>
                  <Text style={styles.modelName}>{model.name}</Text>
                  <Text style={styles.modelVersion}>{model.filename}</Text>
                </View>
                <View style={styles.modelMeta}>
                  <Text style={styles.modelSize}>{formatBytes(model.sizeBytes)}</Text>
                  <Text
                    style={[
                      styles.modelStatus,
                      { color: model.status === 'loaded' ? Colors.success : Colors.danger },
                    ]}
                  >
                    {model.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Local database actions */}
        <View style={styles.settingCard}>
          <Text style={styles.settingHeader}>SYSTEM INTEGRITY OPERATIONS</Text>
          <Text style={styles.settingDesc}>
            Flush the SQLite storage database tables to prepare the environment for new registry profiles.
          </Text>

          <TouchableOpacity
            style={[styles.actionBtn, styles.dangerBtn, clearing && styles.disabledBtn]}
            disabled={clearing}
            onPress={handleClearCache}
          >
            <Text style={styles.dangerBtnText}>Wipe Database & Logs</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>Device identity: {deviceId || 'Loading...'}</Text>
      </ScrollView>
    </View>
  );
};

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  settingCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  settingHeader: {
    ...Typography.labelMd,
    color: Colors.primary,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  settingDesc: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
  },
  thresholdControlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginVertical: 12,
  },
  adjustBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustBtnText: {
    fontSize: 24,
    color: Colors.text,
    fontWeight: 'bold',
  },
  thresholdDisplay: {
    alignItems: 'center',
  },
  thresholdVal: {
    ...Typography.headlineXl,
    color: Colors.text,
    fontWeight: 'bold',
  },
  thresholdLabel: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontSize: 10,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchCopy: {
    flex: 1,
    gap: 8,
  },
  actionBtn: {
    height: 48,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  actionBtnText: {
    ...Typography.titleMd,
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  modelCopy: {
    flex: 1,
    paddingRight: 12,
  },
  modelMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  modelName: {
    ...Typography.bodyLg,
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  modelVersion: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 2,
  },
  modelSize: {
    ...Typography.monoData,
    color: Colors.textSecondary,
  },
  modelStatus: {
    ...Typography.labelMd,
    fontSize: 10,
    fontWeight: 'bold',
  },
  dangerBtn: {
    backgroundColor: 'rgba(234, 67, 53, 0.1)',
    borderColor: Colors.danger,
    borderWidth: 1,
  },
  dangerBtnText: {
    ...Typography.titleMd,
    color: Colors.danger,
    fontSize: 14,
    fontWeight: 'bold',
  },
  versionText: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 12,
  },
});
export default SettingsScreen;
