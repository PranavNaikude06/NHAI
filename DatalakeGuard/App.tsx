/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { initDatabase } from './src/db/database';
import { EncryptionService } from './src/services/EncryptionService';
import { SyncService } from './src/services/SyncService';
import { PayloadSigner } from './src/services/PayloadSigner';
import { ping } from './src/native/TFLiteBridge';
import { runDeviceBenchmark, BenchmarkReport } from './src/ml/benchmark';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [bridgeStatus, setBridgeStatus] = useState<string>('checking...');
  const [benchmarking, setBenchmarking] = useState<boolean>(false);
  const [report, setReport] = useState<BenchmarkReport | null>(null);

  useEffect(() => {
    ping()
      .then(res => setBridgeStatus(res))
      .catch(err => setBridgeStatus(`error: ${err}`));
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeBackend = async () => {
      try {
        await initDatabase();
        await EncryptionService.initialize();
        await PayloadSigner.initializeDeviceSecret();
        if (mounted) {
          SyncService.startConnectivityListener('device-001');
        }
      } catch (error) {
        console.error('[App] Backend initialization failed:', error);
      }
    };

    initializeBackend();

    return () => {
      mounted = false;
      SyncService.stopConnectivityListener();
    };
  }, []);

  const handleRunBenchmark = async () => {
    setBenchmarking(true);
    setReport(null);
    try {
      const result = await runDeviceBenchmark(50);
      setReport(result);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Benchmark failed. Ensure native modules are registered and models are in assets.');
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: safeAreaInsets.top + 20, paddingBottom: safeAreaInsets.bottom + 20, alignItems: 'center', backgroundColor: '#f5f7fb' }]}>
      <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#1A73E8', marginBottom: 5 }}>
        DatalakeGuard
      </Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#5f6368', marginBottom: 20 }}>
        ML & Native Module Diagnostics
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bridge Status</Text>
        <Text style={[styles.statusText, { color: bridgeStatus === 'bridge_ok' ? '#34A853' : '#EA4335' }]}>
          {bridgeStatus === 'bridge_ok' ? '✅ Connected' : `❌ Failed (${bridgeStatus})`}
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.button, benchmarking && styles.buttonDisabled]} 
        onPress={handleRunBenchmark}
        disabled={benchmarking}
      >
        {benchmarking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Run TFLite Benchmarks (50 runs)</Text>
        )}
      </TouchableOpacity>

      {benchmarking && (
        <Text style={{ marginTop: 10, color: '#5f6368', fontSize: 14 }}>
          Measuring latencies... This will take a few seconds.
        </Text>
      )}

      {report && (
        <View style={styles.reportCard}>
          <Text style={styles.cardTitle}>Performance Benchmark Report</Text>
          <Text style={{ fontSize: 12, color: '#5f6368', marginBottom: 15 }}>
            Iterations: {report.iterations} | Snapdragon/Exynos Benchmark
          </Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, { fontWeight: 'bold', flex: 2 }]}>Model</Text>
            <Text style={[styles.tableCell, { fontWeight: 'bold', textAlign: 'right' }]}>Avg (ms)</Text>
            <Text style={[styles.tableCell, { fontWeight: 'bold', textAlign: 'right' }]}>P95 (ms)</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2, color: '#3c4043' }]}>BlazeFace (Detection)</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#3c4043' }]}>{report.blazeFace.average.toFixed(1)}</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#3c4043' }]}>{report.blazeFace.p95.toFixed(0)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2, color: '#3c4043' }]}>FaceMesh (Landmarks)</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#3c4043' }]}>{report.faceMesh.average.toFixed(1)}</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#3c4043' }]}>{report.faceMesh.p95.toFixed(0)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2, color: '#3c4043' }]}>MobileFaceNet (Embed)</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#3c4043' }]}>{report.faceNet.average.toFixed(1)}</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#3c4043' }]}>{report.faceNet.p95.toFixed(0)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2, color: '#1A73E8', fontWeight: 'bold' }]}>Unified Pipeline (E2E Scan+Match)</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#1A73E8', fontWeight: 'bold' }]}>{report.fullPipeline.average.toFixed(1)}</Text>
            <Text style={[styles.tableCell, { textAlign: 'right', color: '#1A73E8', fontWeight: 'bold' }]}>{report.fullPipeline.p95.toFixed(0)}</Text>
          </View>

          <View style={{ marginTop: 15, borderTopWidth: 1, borderColor: '#e8eaed', paddingTop: 10 }}>
            <Text style={{ fontSize: 12, color: '#80868b', fontStyle: 'italic', textAlign: 'center' }}>
              Accuracy & spoof tests require real physical face camera frames.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#202124',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  button: {
    width: '100%',
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  buttonDisabled: {
    backgroundColor: '#dadce0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  reportCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#dadce0',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#f1f3f4',
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
    color: '#5f6368',
  },
});

export default App;
