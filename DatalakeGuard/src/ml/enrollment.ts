import { runBlazeFace, runFaceNet } from '../native/TFLiteBridge';
import { cosineSimilarity } from './cosine';
import { BoundingBox } from './types';
import { cropAndResizeRGB } from './recognize';
import { computeLaplacianVariance } from './livenessStateMachine';

// Normalize a vector to unit length (L2 norm = 1.0)
export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector;
  return vector.map(val => val / norm);
}

export type PoseDirection = 'left' | 'center' | 'right';

/**
 * Classify a BlazeFace result into a pose bucket using nose tip vs eye midpoint.
 * bboxResult[0..3] = x,y,w,h. Keypoints start at index 5:
 *   KP0 (right eye): indices 5,6
 *   KP1 (left eye):  indices 7,8
 *   KP2 (nose):      indices 9,10
 */
export function classifyPose(bboxResult: number[]): PoseDirection {
  if (bboxResult.length < 11) return 'center';

  const rightEyeX = bboxResult[5];
  const leftEyeX  = bboxResult[7];
  const noseTipX  = bboxResult[9];
  const eyeMidX   = (rightEyeX + leftEyeX) / 2;
  const bboxWidth = Math.abs(bboxResult[2]);
  const threshold = bboxWidth * 0.08;

  if (noseTipX < eyeMidX - threshold) return 'right'; // face turned right, nose goes right
  if (noseTipX > eyeMidX + threshold) return 'left';
  return 'center';
}

export interface EnrollmentPrototype {
  embedding: number[];
  poseDirection: PoseDirection;
  qualityScore: number; // Laplacian variance
}

export interface EnrollmentResult {
  prototypes: EnrollmentPrototype[];
  intraUserThreshold: number; // per-user adaptive threshold
}

const MAX_PROTOTYPES_FROM_ENROLLMENT = 5;

/**
 * Generates pose-diversified prototype embeddings from enrollment frames.
 *
 * Rules (from accuracy_compounds_v3_hackathon7.md):
 *   - Must fill CENTER bucket first (minimum 2 frames)
 *   - Must fill at least 1 of LEFT or RIGHT bucket
 *   - Remaining slots filled with highest-quality frames from any bucket
 *
 * Returns up to MAX_PROTOTYPES_FROM_ENROLLMENT individual embeddings (not averaged),
 * each tagged with their pose direction and quality score.
 */
export async function generatePoseDiversifiedPrototypes(
  frames: Uint8Array[],
  width: number,
  height: number
): Promise<EnrollmentResult> {
  if (frames.length === 0) {
    throw new Error('No frames provided for enrollment');
  }

  interface FrameResult {
    embedding: number[];
    pose: PoseDirection;
    quality: number;
  }
  const candidates: FrameResult[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const frameArr = Array.from(frame);
    const bboxResult = await runBlazeFace(frameArr);

    if (bboxResult.length < 5) {
      console.warn(`[Enrollment] No face detected in frame ${i}`);
      continue;
    }

    const bbox: BoundingBox = {
      x: bboxResult[0],
      y: bboxResult[1],
      width: bboxResult[2],
      height: bboxResult[3],
      confidence: bboxResult[4],
    };

    if (bbox.confidence < 0.5) {
      console.warn(`[Enrollment] Low detection confidence in frame ${i}: ${bbox.confidence}`);
      continue;
    }

    // Quality gate: Laplacian variance must be > 40 (reject blurry frames)
    const quality = computeLaplacianVariance(frame, width, height, bbox);
    if (quality < 40) {
      console.warn(`[Enrollment] Frame ${i} rejected for poor quality (Laplacian=${quality.toFixed(1)})`);
      continue;
    }

    const facePixels = cropAndResizeRGB(frame, width, height, bbox, 112, 112);
    const emb = await runFaceNet(facePixels);

    if (emb.length === 0) {
      console.warn(`[Enrollment] Empty embedding from frame ${i}`);
      continue;
    }

    const pose = classifyPose(bboxResult);
    candidates.push({ embedding: l2Normalize(emb), pose, quality });
  }

  if (candidates.length === 0) {
    throw new Error('[Enrollment] No valid frames found. Ensure good lighting and a clear face view.');
  }

  // Sort within each bucket by quality (descending)
  const centers = candidates.filter(c => c.pose === 'center').sort((a, b) => b.quality - a.quality);
  const lefts   = candidates.filter(c => c.pose === 'left').sort((a, b) => b.quality - a.quality);
  const rights  = candidates.filter(c => c.pose === 'right').sort((a, b) => b.quality - a.quality);

  const selected: FrameResult[] = [];

  // Rule 1: At least 2 CENTER frames
  selected.push(...centers.slice(0, 2));

  // Rule 2: At least 1 LEFT or RIGHT frame
  if (lefts.length > 0) selected.push(lefts[0]);
  else if (rights.length > 0) selected.push(rights[0]);

  if (rights.length > 0 && lefts.length > 0) selected.push(rights[0]);

  // Rule 3: Fill remaining slots with highest-quality frames from any bucket
  const remaining = [...centers.slice(2), ...lefts.slice(1), ...rights.slice(1)]
    .sort((a, b) => b.quality - a.quality);

  for (const r of remaining) {
    if (selected.length >= MAX_PROTOTYPES_FROM_ENROLLMENT) break;
    selected.push(r);
  }

  if (selected.length === 0) {
    throw new Error('[Enrollment] Insufficient quality frames to create enrollment prototypes.');
  }

  // Compute intra-user threshold: mean pairwise similarity - 0.15
  const pairwiseSims: number[] = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      pairwiseSims.push(cosineSimilarity(selected[i].embedding, selected[j].embedding));
    }
  }
  const meanIntra = pairwiseSims.length > 0
    ? pairwiseSims.reduce((a, b) => a + b, 0) / pairwiseSims.length
    : 0.75;
  const intraUserThreshold = Math.max(0.50, Math.min(0.85, meanIntra - 0.15));

  const prototypes: EnrollmentPrototype[] = selected.map(s => ({
    embedding: s.embedding,
    poseDirection: s.pose,
    qualityScore: s.quality,
  }));

  return { prototypes, intraUserThreshold };
}

/**
 * Checks if a new embedding already exists in the enrolled user base.
 * Returns the conflicting userId and similarity if found, or null if clear.
 */
export function checkNegativeEnrollment(
  newEmbedding: number[],
  existingPrototypes: Array<{ userId: string; embedding: number[] }>,
  threshold = 0.80
): { conflictUserId: string; similarity: number } | null {
  for (const proto of existingPrototypes) {
    const sim = cosineSimilarity(newEmbedding, proto.embedding);
    if (sim > threshold) {
      return { conflictUserId: proto.userId, similarity: sim };
    }
  }
  return null;
}

/**
 * Legacy single-embedding generator (kept for backward-compatibility with tests).
 * Averages all valid frames into one L2-normalised embedding.
 */
export async function generateEnrollmentEmbedding(
  frames: Uint8Array[],
  width?: number,
  height?: number
): Promise<number[]> {
  if (frames.length === 0) {
    throw new Error('No frames provided for enrollment embedding');
  }

  const embeddings: number[][] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    let facePixels: number[];

    if (width !== undefined && height !== undefined) {
      const bboxResult = await runBlazeFace(Array.from(frame));
      if (bboxResult.length < 5) {
        console.warn(`No face detected in enrollment frame ${i}`);
        continue;
      }
      const bbox: BoundingBox = {
        x: bboxResult[0], y: bboxResult[1],
        width: bboxResult[2], height: bboxResult[3],
        confidence: bboxResult[4],
      };
      if (bbox.confidence < 0.5) continue;
      facePixels = cropAndResizeRGB(frame, width, height, bbox, 112, 112);
    } else {
      if (frame.length !== 112 * 112 * 3) {
        throw new Error(`Frame ${i} size is ${frame.length}, expected 37632`);
      }
      facePixels = Array.from(frame);
    }

    const emb = await runFaceNet(facePixels);
    if (emb.length > 0) embeddings.push(emb);
  }

  if (embeddings.length === 0) {
    throw new Error('Failed to generate any valid face embeddings');
  }

  const embLength = embeddings[0].length;
  const averaged = new Array(embLength).fill(0.0);
  for (let i = 0; i < embLength; i++) {
    averaged[i] = embeddings.reduce((s, e) => s + e[i], 0) / embeddings.length;
  }
  return l2Normalize(averaged);
}
