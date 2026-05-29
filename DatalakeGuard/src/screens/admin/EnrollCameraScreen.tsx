// src/screens/admin/EnrollCameraScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
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
import { FaceOvalGuide } from '../../components/FaceOvalGuide';
import { EmbeddingService } from '../../services/EmbeddingService';
import { generatePoseDiversifiedPrototypes } from '../../ml/enrollment';
import { decodeJpegToRgb } from '../../native/TFLiteBridge';

const { height: screenHeight } = Dimensions.get('window');
const ENROLLMENT_FRAME_COUNT = 5;
const ENROLLMENT_FRAME_TARGET_SIZE = 320;

type RgbFrame = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

async function extractRgbFrameFromPhoto(photo: Photo, maxSize: number = ENROLLMENT_FRAME_TARGET_SIZE): Promise<RgbFrame> {
  const tempPath = await photo.saveToTemporaryFileAsync();
  const fileUri = tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`;
  const nativeResult = await decodeJpegToRgb(fileUri, maxSize);
  return {
    width: nativeResult.width,
    height: nativeResult.height,
    pixels: new Uint8Array(nativeResult.pixels),
  };
}

export const EnrollCameraScreen = ({ route, navigation }: any) => {
  const { name, role, workerId } = route.params || { name: '', role: 'Field Worker', workerId: '' };
  const isFocused = useIsFocused();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = frontDevice ?? backDevice;
  const photoOutputOptions = useMemo(() => ({
    targetResolution: { width: 480, height: 640 },
    qualityPrioritization: 'quality' as const,
    quality: 0.85,
  }), []);
  const photoOutput = usePhotoOutput(photoOutputOptions);
  const outputs = useMemo(() => [photoOutput], [photoOutput]);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const framesRef = useRef<Uint8Array[]>([]);
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(error => {
        console.error('[EnrollCamera] Camera permission request failed:', error);
      });
    }
  }, [hasPermission, requestPermission]);

  const triggerFlash = useCallback(() => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [flashAnim]);

  const resetEnrollment = useCallback(() => {
    framesRef.current = [];
    setFrameIndex(0);
    setFrameSize(null);
  }, []);

  const saveEnrollment = useCallback(async (frames: Uint8Array[], width: number, height: number) => {
    setIsSaving(true);
    try {
      const enrollment = await generatePoseDiversifiedPrototypes(frames, width, height);
      await EmbeddingService.enrollWorkerPrototypes(
        name,
        role,
        workerId,
        enrollment.prototypes,
        enrollment.intraUserThreshold
      );

      Alert.alert(
        'Enrollment Complete',
        `Worker "${name}" has been registered successfully with ID: ${workerId}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('AdminDashboard'),
          },
        ]
      );
    } catch (error: any) {
      console.error('[EnrollCamera] Enrollment failed:', error);
      resetEnrollment();
      Alert.alert('Enrollment Error', error.message || 'Failed to save worker biometric record.');
    } finally {
      setIsSaving(false);
    }
  }, [name, navigation, resetEnrollment, role, workerId]);

  const handleCaptureFrame = useCallback(async () => {
    if (isCapturing || isSaving || !isCameraReady) return;

    if (!hasPermission) {
      await requestPermission();
      return;
    }

    if (!device) {
      setCameraError('No camera device found.');
      return;
    }

    setIsCapturing(true);
    setCameraError(null);

    let photo: Photo | null = null;
    try {
      photo = await photoOutput.capturePhoto(
        {
          flashMode: 'off',
          enableShutterSound: false,
        },
        {}
      );
      const frame = await extractRgbFrameFromPhoto(photo);

      if (frameSize && (frame.width !== frameSize.width || frame.height !== frameSize.height)) {
        throw new Error('Camera frame size changed during enrollment. Please retry.');
      }

      triggerFlash();
      const nextFrames = [...framesRef.current, frame.pixels];
      framesRef.current = nextFrames;
      setFrameSize({ width: frame.width, height: frame.height });
      setFrameIndex(nextFrames.length);

      if (nextFrames.length >= ENROLLMENT_FRAME_COUNT) {
        await saveEnrollment(nextFrames, frame.width, frame.height);
      }
    } catch (error: any) {
      console.error('[EnrollCamera] Frame capture failed:', error);
      setCameraError(error?.message || 'Could not capture enrollment frame.');
    } finally {
      photo?.dispose();
      setIsCapturing(false);
    }
  }, [
    device,
    frameSize,
    hasPermission,
    isCameraReady,
    isCapturing,
    isSaving,
    photoOutput,
    requestPermission,
    saveEnrollment,
    triggerFlash,
  ]);

  const opacity = flashAnim;
  const cameraActive = isFocused && hasPermission && !!device && !isSaving;
  const captureDisabled = isCapturing || isSaving || !device || !isCameraReady;

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
            console.error('[EnrollCamera] Camera runtime error:', error);
            setCameraError(error.message);
            setIsCameraReady(false);
          }}
        />
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.35">
            <Path
              d="M12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm3 11H9v-2h6v2zm-3-4c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7-11h-3.17L17 3H7L5.17 5H2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z"
              fill={Colors.text}
            />
          </Svg>
          <Text style={styles.cameraText}>
            {!hasPermission ? 'Camera Permission Required' : 'No Camera Device Found'}
          </Text>
        </View>
      )}

      <FaceOvalGuide status={frameIndex > 0 ? 'face_detected' : 'no_face'} />

      <Animated.View style={[styles.flashOverlay, { opacity }]} pointerEvents="none" />

      <TouchableOpacity
        style={styles.backButton}
        activeOpacity={0.7}
        onPress={() => navigation.goBack()}
        disabled={isSaving}
      >
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            fill={Colors.text}
          />
        </Svg>
      </TouchableOpacity>

      <View style={styles.hudOverlay}>
        <Text style={styles.hudTitle}>ENROLLING PROFILE</Text>
        <Text style={styles.hudDetails}>
          Name: {name} | ID: {workerId}
        </Text>
        <Text style={styles.frameCounter}>
          Captured Frames: {frameIndex} / {ENROLLMENT_FRAME_COUNT}
        </Text>

        {isSaving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.savingText}>Processing and encrypting vectors...</Text>
          </View>
        ) : (
          <Text style={styles.instructionText}>
            Align face inside the oval and capture multiple angles.
          </Text>
        )}
        {cameraError && <Text style={styles.errorText}>{cameraError}</Text>}
      </View>

      {!isSaving && (
        <TouchableOpacity
          style={[styles.captureButton, captureDisabled && styles.captureButtonDisabled]}
          activeOpacity={0.8}
          onPress={handleCaptureFrame}
          disabled={captureDisabled}
        >
          {isCapturing ? (
            <ActivityIndicator color={Colors.background} size="small" />
          ) : !isCameraReady ? (
            <ActivityIndicator color={Colors.background} size="small" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>
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
  cameraText: {
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
  hudOverlay: {
    position: 'absolute',
    top: screenHeight * 0.16,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    gap: 6,
  },
  hudTitle: {
    ...Typography.labelMd,
    color: Colors.primary,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  hudDetails: {
    ...Typography.bodyMd,
    color: Colors.text,
  },
  frameCounter: {
    ...Typography.headlineLgMobile,
    color: Colors.warning,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  instructionText: {
    ...Typography.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  savingText: {
    ...Typography.bodyMd,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  errorText: {
    ...Typography.bodyMd,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: 6,
  },
  captureButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  captureButtonDisabled: {
    opacity: 0.45,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    zIndex: 15,
  },
});

export default EnrollCameraScreen;
