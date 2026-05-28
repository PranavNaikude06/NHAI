import { runBlazeFace, runFaceNet } from '../native/TFLiteBridge';
import { RecognitionResult, BoundingBox } from './types';
import { loadEmbeddingsToNative } from '../native/VectorSearchBridge';
import { EmbeddingService as StoredEmbeddingService } from '../services/EmbeddingService';
import { evaluatePassiveLiveness, LivenessContext, computeLaplacianVariance } from './livenessStateMachine';
import { Config } from '../constants/config';
import { PrototypeService, classifyLighting, LightingBucket } from '../services/PrototypeService';

// Simple crop and resize using Nearest Neighbor interpolation for flat RGB arrays
export function cropAndResizeRGB(
  pixels: Uint8Array | number[],
  srcWidth: number,
  srcHeight: number,
  bbox: BoundingBox,
  targetWidth: number,
  targetHeight: number
): number[] {
  const isNormalized = bbox.x >= 0 && bbox.x <= 1.0 && bbox.width <= 1.0;
  
  const xStart = Math.max(0, Math.floor(isNormalized ? bbox.x * srcWidth : bbox.x));
  const yStart = Math.max(0, Math.floor(isNormalized ? bbox.y * srcHeight : bbox.y));
  const cropW = Math.max(1, Math.floor(isNormalized ? bbox.width * srcWidth : bbox.width));
  const cropH = Math.max(1, Math.floor(isNormalized ? bbox.height * srcHeight : bbox.height));

  const result = new Array(targetWidth * targetHeight * 3);

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(srcWidth - 1, xStart + Math.floor((x / targetWidth) * cropW));
      const srcY = Math.min(srcHeight - 1, yStart + Math.floor((y / targetHeight) * cropH));

      const srcIdx = (srcY * srcWidth + srcX) * 3;
      const destIdx = (y * targetWidth + x) * 3;

      result[destIdx] = pixels[srcIdx] !== undefined ? pixels[srcIdx] : 0;
      result[destIdx + 1] = pixels[srcIdx + 1] !== undefined ? pixels[srcIdx + 1] : 0;
      result[destIdx + 2] = pixels[srcIdx + 2] !== undefined ? pixels[srcIdx + 2] : 0;
    }
  }
  return result;
}

export type EmbeddingLookupService = Pick<typeof StoredEmbeddingService, 'getAllEmbeddings'>;

export interface RecognitionOptions {
  targetUserId?: string;
  locationLat?: number;
  locationLng?: number;
  hourOfDay?: number;
  workerAuthHours?: number[];
}

let nativeCacheInitialized = false;

export function invalidateNativeCache() {
  nativeCacheInitialized = false;
}

function bboxFromBlazeFace(result: number[]): BoundingBox | null {
  if (result.length < 5) return null;
  return {
    x: result[0],
    y: result[1],
    width: result[2],
    height: result[3],
    confidence: result[4],
  };
}

function landmarksFromBlazeFace(result: number[]): { x: number; y: number; z: number }[] {
  const landmarks: { x: number; y: number; z: number }[] = [];
  for (let i = 5; i + 1 < result.length; i += 2) {
    landmarks.push({ x: result[i], y: result[i + 1], z: 0 });
  }
  return landmarks;
}

function classifyPoseFromBlazeFace(result: number[]): 'left' | 'center' | 'right' {
  if (result.length < 11) return 'center';
  const rightEyeX = result[5];
  const leftEyeX = result[7];
  const noseTipX = result[9];
  const eyeMidX = (rightEyeX + leftEyeX) / 2;
  const bboxWidth = Math.abs(result[2]);
  const threshold = bboxWidth * 0.08;
  if (noseTipX < eyeMidX - threshold) return 'right';
  if (noseTipX > eyeMidX + threshold) return 'left';
  return 'center';
}

function l2NormalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector;
  return vector.map(val => val / norm);
}

async function initializeNativeCache(embeddingService: EmbeddingLookupService): Promise<void> {
  if (nativeCacheInitialized) return;
  const enrolledUsers = await embeddingService.getAllEmbeddings();
  if (enrolledUsers.length > 0) {
    const vectors = enrolledUsers.map(user => user.vector);
    const userIds = enrolledUsers.map(user => user.userId);
    await loadEmbeddingsToNative(vectors, userIds);
  }
  nativeCacheInitialized = true;
}

async function extractLiveFace(
  frameData: Uint8Array | number[],
  width: number,
  height: number
): Promise<{
  embedding: number[];
  bbox: BoundingBox;
  landmarks: { x: number; y: number; z: number }[];
  laplacian: number;
  lightingBucket: LightingBucket;
  poseDirection: 'left' | 'center' | 'right';
} | null> {
  const inputData = Array.isArray(frameData) ? frameData : Array.from(frameData);
  const blazeFaceResult = await runBlazeFace(inputData);
  const bbox = bboxFromBlazeFace(blazeFaceResult);
  if (!bbox || bbox.confidence < 0.5) return null;

  const facePixels = cropAndResizeRGB(frameData, width, height, bbox, 112, 112);
  const rawEmbedding = await runFaceNet(facePixels, Config.ENABLE_CLAHE);
  if (rawEmbedding.length === 0) return null;

  const laplacian = computeLaplacianVariance(frameData, width, height, bbox);
  const hour = new Date().getHours();
  return {
    embedding: l2NormalizeVector(rawEmbedding),
    bbox,
    landmarks: landmarksFromBlazeFace(blazeFaceResult),
    laplacian,
    lightingBucket: classifyLighting(hour, laplacian),
    poseDirection: classifyPoseFromBlazeFace(blazeFaceResult),
  };
}

export async function recognize(
  frameData: Uint8Array | number[],
  width: number,
  height: number,
  embeddingService: EmbeddingLookupService = StoredEmbeddingService,
  livenessPass: boolean = true,
  options: RecognitionOptions = {}
): Promise<RecognitionResult> {
  try {
    await initializeNativeCache(embeddingService);
    const liveFace = await extractLiveFace(frameData, width, height);
    if (!liveFace) {
      return { identity: null, name: null, confidence: 0, livenessPass };
    }

    const contextualAdjustment = PrototypeService.computeContextualAdjustment(
      options.locationLat,
      options.locationLng,
      options.hourOfDay,
      options.workerAuthHours
    );
    const authResult = await PrototypeService.authenticateWithPrototypeBank(
      liveFace.embedding,
      liveFace.lightingBucket,
      options.targetUserId,
      contextualAdjustment
    );

    if (authResult.success && authResult.userId) {
      await PrototypeService.applyTemplateAging(authResult.userId, liveFace.embedding, authResult.confidence ?? 0);
      await PrototypeService.maybeAddAuthPrototype(
        authResult.userId,
        authResult.name ?? '',
        'Field Worker',
        liveFace.embedding,
        authResult.confidence ?? 0,
        liveFace.lightingBucket,
        liveFace.poseDirection
      );
      await PrototypeService.promoteProvisionalIfReady(authResult.userId);
      return {
        identity: authResult.userId,
        name: authResult.name ?? null,
        confidence: authResult.confidence ?? 0,
        livenessPass,
      };
    }

    return {
      identity: null,
      name: null,
      confidence: authResult.confidence ?? 0,
      livenessPass,
    };
  } catch (error) {
    console.error('Recognition error in pipeline:', error);
    return {
      identity: null,
      name: null,
      confidence: 0,
      livenessPass: false,
    };
  }
}

export async function recognizeWithLiveness(
  frameData: Uint8Array | number[],
  width: number,
  height: number,
  livenessContext: LivenessContext,
  embeddingService: EmbeddingLookupService = StoredEmbeddingService,
  options: RecognitionOptions = {}
): Promise<RecognitionResult & { livenessResult: any }> {
  try {
    await initializeNativeCache(embeddingService);
    const liveFace = await extractLiveFace(frameData, width, height);
    if (!liveFace) {
      return {
        identity: null,
        name: null,
        confidence: 0,
        livenessPass: false,
        livenessResult: {
          passed: false,
          reason: 'insufficient_frames',
          rigidityScore: 1.0,
          blinkCount: 0,
          framesAnalyzed: 0
        }
      };
    }

    const { result: livenessResult } = evaluatePassiveLiveness(
      liveFace.landmarks,
      livenessContext,
      liveFace.bbox,
      liveFace.laplacian
    );

    let identity: string | null = null;
    let name: string | null = null;
    let confidence = 0;

    if (livenessResult.passed) {
      const contextualAdjustment = PrototypeService.computeContextualAdjustment(
        options.locationLat,
        options.locationLng,
        options.hourOfDay,
        options.workerAuthHours
      );
      const authResult = await PrototypeService.authenticateWithPrototypeBank(
        liveFace.embedding,
        liveFace.lightingBucket,
        options.targetUserId,
        contextualAdjustment
      );
      confidence = authResult.confidence ?? 0;
      if (authResult.success && authResult.userId) {
        identity = authResult.userId;
        name = authResult.name ?? null;
        await PrototypeService.applyTemplateAging(authResult.userId, liveFace.embedding, confidence);
        await PrototypeService.maybeAddAuthPrototype(
          authResult.userId,
          authResult.name ?? '',
          'Field Worker',
          liveFace.embedding,
          confidence,
          liveFace.lightingBucket,
          liveFace.poseDirection
        );
        await PrototypeService.promoteProvisionalIfReady(authResult.userId);
      }
    }

    return {
      identity,
      name,
      confidence,
      livenessPass: livenessResult.passed,
      livenessResult
    };
  } catch (error) {
    console.error('Recognition with liveness error in pipeline:', error);
    return {
      identity: null,
      name: null,
      confidence: 0,
      livenessPass: false,
      livenessResult: {
        passed: false,
        reason: 'insufficient_frames',
        rigidityScore: 1.0,
        blinkCount: 0,
        framesAnalyzed: 0
      }
    };
  }
}
