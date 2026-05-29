// src/screens/auth/AuthCameraScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type Photo,
} from 'react-native-vision-camera';
import { Colors, Typography } from '../../constants/colors';
import { Config } from '../../constants/config';
import { FaceOvalGuide } from '../../components/FaceOvalGuide';
import {
  createLivenessContext,
  evaluatePassiveLiveness,
  type LivenessContext,
  type LivenessState,
} from '../../ml/livenessStateMachine';
import type { BoundingBox } from '../../ml/types';
import { runFullPipeline } from '../../native/TFLiteBridge';
import { loadEmbeddingsToNative } from '../../native/VectorSearchBridge';
import { AuthLogService } from '../../services/AuthLogService';
import { EmbeddingService, type StoredWorker } from '../../services/EmbeddingService';

const { height: screenHeight } = Dimensions.get('window');
const LIVE_SCAN_MAX_FRAMES = 9;

type SimulationType = 'success' | 'spoof' | 'unknown';

/**
 * Returns the file URI of a captured photo, normalised for the native bridge.
 * VisionCamera's capturePhoto() on Android always writes a JPEG to disk —
 * to get the path, we must save it to a temporary file natively.
 */
async function getPhotoUri(photo: Photo): Promise<string> {
  const raw = await photo.saveToTemporaryFileAsync();
  return raw.startsWith('file://') ? raw : `file://${raw}`;
}

function parseLandmarkTriples(flat: number[]): Array<{ x: number; y: number; z: number }> {
  const landmarks: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    landmarks.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2] });
  }
  return landmarks;
}

function resultToBoundingBox(box: number[]): BoundingBox {
  return {
    x: box[0] ?? 0,
    y: box[1] ?? 0,
    width: box[2] ?? 1,
    height: box[3] ?? 1,
    confidence: box[4] ?? 0,
  };
}

export const AuthCameraScreen = ({ navigation }: any) => {
  const isFocused = useIsFocused();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = frontDevice ?? backDevice;
  const photoOutputOptions = useMemo(() => ({
    targetResolution: { width: 480, height: 640 },
    qualityPrioritization: 'speed' as const,
    quality: 0.65,
  }), []);
  const photoOutput = usePhotoOutput(photoOutputOptions);
  const outputs = useMemo(() => [photoOutput], [photoOutput]);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [livenessState, setLivenessState] = useState<LivenessState>('IDLE');
  const [instruction, setInstruction] = useState<string>('Position your face in the oval');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isScanningLive, setIsScanningLive] = useState<boolean>(false);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [simActive, setSimActive] = useState<boolean>(false);
  const [simType, setSimType] = useState<SimulationType | ''>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveFrameCount, setLiveFrameCount] = useState<number>(0);
  const simulatorEnabled = Config.ENABLE_SIMULATOR_MODE;

  const livenessContext = useRef<LivenessContext>(createLivenessContext(false, true));
  const enrolledWorkers = useRef<StoredWorker[]>([]);
  const nativeCacheReady = useRef<boolean>(false);
  const activeScanRun = useRef<number>(0);

  useEffect(() => {
    if (!simulatorEnabled && !hasPermission) {
      requestPermission().catch(error => {
        console.error('[AuthCamera] Camera permission request failed:', error);
      });
    }
  }, [hasPermission, requestPermission, simulatorEnabled]);

  const resetLiveContext = useCallback(() => {
    livenessContext.current = createLivenessContext(false, true);
    setLivenessState('IDLE');
    setLiveFrameCount(0);
  }, []);

  const getOvalStatus = () => {
    switch (livenessState) {
      case 'IDLE':
        return 'no_face';
      case 'TURN_LEFT':
      case 'TURN_RIGHT':
        return 'liveness_active';
      case 'PASSED':
        return 'success';
      case 'FAILED':
        return 'failure';
      default:
        return 'no_face';
    }
  };

  const ensureNativeSearchCache = useCallback(async () => {
    if (nativeCacheReady.current) return;

    const workers = await EmbeddingService.getAllEmbeddings();
    enrolledWorkers.current = workers;
    if (workers.length > 0) {
      await loadEmbeddingsToNative(
        workers.map(worker => worker.vector),
        workers.map(worker => worker.userId)
      );
    }
    nativeCacheReady.current = true;
  }, []);

  const logAndNavigate = useCallback(async (result: {
    identity: string | null;
    name: string | null;
    role?: string | null;
    confidence: number;
    livenessPass: boolean;
    livenessScore?: number;
    statusCode?: string;
    reason?: string;
  }) => {
    const timestamp = Date.now();
    try {
      await AuthLogService.logAuthAttempt({
        userId: result.identity,
        timestamp,
        confidence: result.confidence,
        livenessPass: result.livenessPass,
        livenessScore: result.livenessScore ?? (result.livenessPass ? 1 : 0.1),
        result: !result.livenessPass
          ? 'spoof_rejected'
          : result.identity
            ? 'authenticated'
            : 'unknown',
      });
    } catch (error) {
      console.error('[AuthCamera] Failed to log auth attempt:', error);
    }

    navigation.navigate('AuthResult', { result: { ...result, timestamp } });
  }, [navigation]);

  const analyzeLivePhoto = useCallback(async (): Promise<boolean> => {
    const photo = await photoOutput.capturePhoto(
      {
        flashMode: 'off',
        enableShutterSound: false,
      },
      {}
    );

    try {
      // Pass the JPEG file URI directly to the native pipeline.
      // The Kotlin bridge decodes it with BitmapFactory, which correctly handles
      // JPEG orientation (EXIF) and produces the raw ARGB pixel array natively.
      // This avoids the JS-side pixel buffer decoding that caused:
      //   "Unsupported camera pixel buffer layout: N bytes per pixel"
      const photoUri = await getPhotoUri(photo);
      await ensureNativeSearchCache();

      const pipelineResult = await runFullPipeline(
        photoUri,
        Config.ENABLE_CLAHE
      );

      if (!pipelineResult.faceDetected) {
        setLivenessState('IDLE');
        setInstruction('No face detected. Re-center inside the oval.');
        return false;
      }

      const landmarks = parseLandmarkTriples(pipelineResult.landmarks);
      const boundingBox = resultToBoundingBox(pipelineResult.box);
      const laplacian = pipelineResult.laplacian ?? 80;
      const { context, result: livenessResult } = evaluatePassiveLiveness(
        landmarks,
        livenessContext.current,
        boundingBox,
        laplacian
      );

      livenessContext.current = context;
      setLivenessState(context.state);
      setLiveFrameCount(livenessResult.framesAnalyzed);

      if (livenessResult.reason === 'insufficient_frames') {
        setInstruction(`Reading live motion... ${livenessResult.framesAnalyzed}/5 frames`);
        return false;
      }

      if (!livenessResult.passed) {
        setLivenessState('FAILED');
        setInstruction(
          livenessResult.reason === 'photo_detected'
            ? 'Liveness failed: flat/photo texture detected'
            : 'Liveness failed: no natural motion detected'
        );
        await logAndNavigate({
          identity: null,
          name: null,
          confidence: Math.max(0, pipelineResult.confidence),
          livenessPass: false,
          livenessScore: livenessResult.rigidityScore,
          statusCode: livenessResult.reason === 'photo_detected' ? 'ERR_SPOOF_DET' : 'ERR_LIVENESS_REJECTED',
          reason: livenessResult.reason ?? 'Liveness check failed',
        });
        return true;
      }

      setLivenessState('PASSED');
      setInstruction('Liveness confirmed. Matching identity...');

      const matchConfidence = Math.max(0, pipelineResult.confidence);
      const matchedIdentity = matchConfidence >= Config.COSINE_THRESHOLD
        ? pipelineResult.identity
        : null;
      const matchedWorker = matchedIdentity
        ? enrolledWorkers.current.find(worker => worker.userId === matchedIdentity)
        : undefined;

      await logAndNavigate({
        identity: matchedIdentity,
        name: matchedWorker?.name ?? null,
        role: matchedWorker?.role ?? null,
        confidence: matchConfidence,
        livenessPass: true,
      });
      return true;
    } finally {
      photo.dispose();
    }
  }, [ensureNativeSearchCache, logAndNavigate, photoOutput]);

  const startLiveScan = useCallback(async () => {
    if (isScanningLive || !device || !hasPermission || !isCameraReady) return;

    resetLiveContext();
    setCameraError(null);
    setIsScanningLive(true);
    setIsLoading(true);
    setInstruction('Starting live frame scan...');
    const runId = activeScanRun.current + 1;
    activeScanRun.current = runId;

    try {
      for (let i = 0; i < LIVE_SCAN_MAX_FRAMES && activeScanRun.current === runId; i++) {
        const completed = await analyzeLivePhoto();
        if (completed) return;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      setLivenessState('FAILED');
      setInstruction('Liveness timed out. Try again with steady lighting.');
      await logAndNavigate({
        identity: null,
        name: null,
        confidence: 0,
        livenessPass: false,
        livenessScore: 0,
        statusCode: 'ERR_LIVENESS_TIMEOUT',
        reason: 'Live scan timed out before liveness passed',
      });
    } catch (error: any) {
      console.error('[AuthCamera] Live frame scan failed:', error);
      const message = error?.message ?? 'Could not process live camera frame.';
      setCameraError(message);
      setInstruction('Live camera frame processing failed');
      Alert.alert('Live Camera Error', message);
    } finally {
      setIsLoading(false);
      setIsScanningLive(false);
    }
  }, [
    analyzeLivePhoto,
    device,
    hasPermission,
    isCameraReady,
    isScanningLive,
    logAndNavigate,
    resetLiveContext,
  ]);

  const runSimulation = (type: SimulationType) => {
    if (simActive) return;
    setSimActive(true);
    setSimType(type);
    setIsLoading(false);

    setLivenessState('TURN_LEFT');
    setInstruction('< Turn head LEFT');

    setTimeout(() => {
      if (type === 'spoof') {
        setLivenessState('FAILED');
        setInstruction('Liveness failed: flat surface/photo detected');

        setTimeout(async () => {
          setSimActive(false);
          await logAndNavigate({
            identity: null,
            name: null,
            confidence: 0.1,
            livenessPass: false,
            livenessScore: 0.12,
            statusCode: 'ERR_SPOOF_DET',
            reason: 'Liveness check failed (flat/photo detected)',
          });
        }, 1500);
        return;
      }

      setLivenessState('TURN_RIGHT');
      setInstruction('Turn head RIGHT >');

      setTimeout(() => {
        setInstruction('Please blink naturally');

        setTimeout(() => {
          setLivenessState('PASSED');
          setInstruction('Liveness confirmed');
          setIsLoading(true);

          setTimeout(async () => {
            setIsLoading(false);
            setSimActive(false);

            if (type === 'success') {
              await logAndNavigate({
                identity: 'EMP-102',
                name: 'John Smith',
                role: 'Field Worker',
                confidence: 0.942,
                livenessPass: true,
              });
              return;
            }

            await logAndNavigate({
              identity: null,
              name: null,
              confidence: 0.38,
              livenessPass: true,
            });
          }, 1500);
        }, 1000);
      }, 1200);
    }, 1200);
  };

  const cameraActive = isFocused && hasPermission && !!device && !simActive;

  return (
    <View style={styles.container}>
      {hasPermission && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={cameraActive}
          outputs={outputs}
          resizeMode="cover"
          mirrorMode="auto"
          onStarted={() => setIsCameraReady(true)}
          onStopped={() => setIsCameraReady(false)}
          onError={error => {
            console.error('[AuthCamera] Camera runtime error:', error);
            setCameraError(error.message);
            setIsCameraReady(false);
          }}
        />
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.3">
            <Path
              d="M12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm3 11H9v-2h6v2zm-3-4c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7-11h-3.17L17 3H7L5.17 5H2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z"
              fill={Colors.text}
            />
          </Svg>
          <Text style={styles.cameraFeedText}>
            {!hasPermission ? 'Camera Permission Required' : 'No Camera Device Found'}
          </Text>
        </View>
      )}

      <FaceOvalGuide status={getOvalStatus()} />

      <TouchableOpacity
        style={styles.backButton}
        activeOpacity={0.7}
        onPress={() => navigation.goBack()}
        disabled={isScanningLive}
      >
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            fill={Colors.text}
          />
        </Svg>
      </TouchableOpacity>

      <View style={styles.instructionOverlay}>
        <Text
          style={[
            styles.instructionText,
            livenessState === 'TURN_LEFT' || livenessState === 'TURN_RIGHT'
              ? styles.instructionWarn
              : livenessState === 'PASSED'
                ? styles.instructionSuccess
                : livenessState === 'FAILED'
                  ? styles.instructionDanger
                  : styles.instructionNeutral,
          ]}
        >
          {instruction}
        </Text>
        {isLoading && <ActivityIndicator color={Colors.primary} style={styles.loadingIndicator} />}
        {!simulatorEnabled && liveFrameCount > 0 && (
          <Text style={styles.frameHint}>Frames analysed: {liveFrameCount}</Text>
        )}
        {cameraError && <Text style={styles.errorText}>{cameraError}</Text>}
      </View>

      {simulatorEnabled && !simActive && (
        <View style={styles.simulatorPanel}>
          <Text style={styles.simulatorTitle}>SIMULATOR CONTROLS (EMULATOR MODE)</Text>
          <View style={styles.simulatorButtons}>
            <TouchableOpacity
              style={[styles.simButton, styles.successButton]}
              activeOpacity={0.8}
              onPress={() => runSimulation('success')}
            >
              <Text style={[styles.simButtonText, styles.successText]}>John Smith Pass</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simButton, styles.dangerButton]}
              activeOpacity={0.8}
              onPress={() => runSimulation('spoof')}
            >
              <Text style={[styles.simButtonText, styles.dangerText]}>Spoof Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simButton, styles.primaryButton]}
              activeOpacity={0.8}
              onPress={() => runSimulation('unknown')}
            >
              <Text style={[styles.simButtonText, styles.primaryText]}>Unknown Face</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!simulatorEnabled && !simActive && (
        <View style={styles.liveModePanel}>
          <Text style={styles.liveModeTitle}>LIVE CAMERA MODE</Text>
          <Text style={styles.liveModeText}>
            {hasPermission
              ? 'Hold the device steady and keep your face inside the oval.'
              : 'Camera access is required for live biometric verification.'}
          </Text>

          {!hasPermission ? (
            <TouchableOpacity style={styles.liveButton} activeOpacity={0.8} onPress={requestPermission}>
              <Text style={styles.liveButtonText}>Grant Camera Access</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.liveButton,
                (!device || isScanningLive || !isCameraReady) && styles.disabledButton,
              ]}
              activeOpacity={0.8}
              disabled={!device || isScanningLive || !isCameraReady}
              onPress={startLiveScan}
            >
              <Text style={styles.liveButtonText}>
                {isScanningLive
                  ? 'Scanning Live Frames...'
                  : !isCameraReady
                  ? 'Initializing Camera...'
                  : 'Start Live Frame Scan'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {simActive && (
        <View style={styles.runningBadge}>
          <Text style={styles.runningText}>Running: {simType.toUpperCase()} SIMULATION</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0A',
    gap: 12,
  },
  cameraFeedText: {
    ...Typography.labelMd,
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 30, 30, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  instructionOverlay: {
    position: 'absolute',
    top: screenHeight * 0.12,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  instructionText: {
    ...Typography.titleMd,
    fontSize: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  instructionNeutral: {
    color: Colors.text,
  },
  instructionWarn: {
    color: Colors.warning,
  },
  instructionSuccess: {
    color: Colors.success,
  },
  instructionDanger: {
    color: Colors.danger,
  },
  loadingIndicator: {
    marginTop: 8,
  },
  frameHint: {
    ...Typography.labelMd,
    color: Colors.onSurfaceVariant,
    marginTop: 8,
  },
  errorText: {
    ...Typography.bodyMd,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: 8,
  },
  simulatorPanel: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 16,
    padding: 16,
    zIndex: 20,
  },
  simulatorTitle: {
    ...Typography.labelMd,
    color: Colors.primary,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  simulatorButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  simButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 10, 0.5)',
  },
  successButton: {
    borderColor: Colors.success,
  },
  dangerButton: {
    borderColor: Colors.danger,
  },
  primaryButton: {
    borderColor: Colors.primary,
  },
  simButtonText: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  successText: {
    color: Colors.success,
  },
  dangerText: {
    color: Colors.danger,
  },
  primaryText: {
    color: Colors.primary,
  },
  liveModePanel: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 16,
    padding: 16,
    zIndex: 20,
  },
  liveModeTitle: {
    ...Typography.labelMd,
    color: Colors.warning,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  liveModeText: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  liveButton: {
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  liveButtonText: {
    ...Typography.titleMd,
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.45,
  },
  runningBadge: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  runningText: {
    ...Typography.labelMd,
    color: Colors.warning,
    fontWeight: 'bold',
  },
});
