import { runBlazeFace, runFaceNet, runFullPipeline } from '../native/TFLiteBridge';
import { cosineSimilarity } from './cosine';
import { RecognitionResult, BoundingBox } from './types';
import { loadEmbeddingsToNative, findBestMatch } from '../native/VectorSearchBridge';
import { EmbeddingService as StoredEmbeddingService } from '../services/EmbeddingService';
import { evaluatePassiveLiveness, LivenessContext } from './livenessStateMachine';
import { parseLandmarks } from '../native/MediaPipeBridge';
import { Config } from '../constants/config';

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

let nativeCacheInitialized = false;

export function invalidateNativeCache() {
  nativeCacheInitialized = false;
}

export async function recognize(
  frameData: Uint8Array | number[],
  width: number,
  height: number,
  embeddingService: EmbeddingLookupService = StoredEmbeddingService,
  livenessPass: boolean = true
): Promise<RecognitionResult> {
  try {
    if (!nativeCacheInitialized) {
      const enrolledUsers = await embeddingService.getAllEmbeddings();
      if (enrolledUsers.length > 0) {
        const vectors = enrolledUsers.map(user => user.vector);
        const userIds = enrolledUsers.map(user => user.userId);
        await loadEmbeddingsToNative(vectors, userIds);
      }
      nativeCacheInitialized = true;
    }

    const inputData = Array.isArray(frameData) ? frameData : Array.from(frameData);
    const pipelineResult = await runFullPipeline(
      inputData,
      width,
      height,
      Config.ENABLE_CLAHE
    );

    if (!pipelineResult.faceDetected) {
      return { identity: null, name: null, confidence: 0, livenessPass };
    }

    const threshold = Config.COSINE_THRESHOLD || 0.6;
    if (pipelineResult.confidence >= threshold && pipelineResult.identity) {
      const enrolledUsers = await embeddingService.getAllEmbeddings();
      const matchedUser = enrolledUsers.find(user => user.userId === pipelineResult.identity);
      return {
        identity: pipelineResult.identity,
        name: matchedUser ? matchedUser.name : null,
        confidence: pipelineResult.confidence,
        livenessPass,
      };
    }

    return {
      identity: null,
      name: null,
      confidence: pipelineResult.confidence,
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
  embeddingService: EmbeddingLookupService = StoredEmbeddingService
): Promise<RecognitionResult & { livenessResult: any }> {
  try {
    if (!nativeCacheInitialized) {
      const enrolledUsers = await embeddingService.getAllEmbeddings();
      if (enrolledUsers.length > 0) {
        const vectors = enrolledUsers.map(user => user.vector);
        const userIds = enrolledUsers.map(user => user.userId);
        await loadEmbeddingsToNative(vectors, userIds);
      }
      nativeCacheInitialized = true;
    }

    const inputData = Array.isArray(frameData) ? frameData : Array.from(frameData);
    const pipelineResult = await runFullPipeline(
      inputData,
      width,
      height,
      Config.ENABLE_CLAHE
    );

    if (!pipelineResult.faceDetected) {
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

    const landmarks = parseLandmarks(pipelineResult.landmarks);
    const { result: livenessResult } = evaluatePassiveLiveness(
      landmarks,
      livenessContext
    );

    const threshold = Config.COSINE_THRESHOLD || 0.6;
    let identity: string | null = null;
    let name: string | null = null;

    if (pipelineResult.confidence >= threshold && pipelineResult.identity) {
      identity = pipelineResult.identity;
      const enrolledUsers = await embeddingService.getAllEmbeddings();
      const matchedUser = enrolledUsers.find(user => user.userId === identity);
      name = matchedUser ? matchedUser.name : null;
    }

    return {
      identity,
      name,
      confidence: pipelineResult.confidence,
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
