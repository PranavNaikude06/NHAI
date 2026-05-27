import { runBlazeFace, runFaceNet } from '../native/TFLiteBridge';
import { BoundingBox } from './types';
import { cropAndResizeRGB } from './recognize';

// Normalize a vector to unit length (L2 norm = 1.0)
function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector;
  return vector.map(val => val / norm);
}

/**
 * Generate enrollment embedding by averaging 5 frames.
 * If width & height are provided, will run face detection & cropping first.
 * Otherwise, assumes frames are already cropped 112x112 RGB arrays.
 */
export async function generateEnrollmentEmbedding(
  frames: Uint8Array[],
  width?: number,
  height?: number
): Promise<number[]> {
  if (frames.length === 0) {
    throw new Error('No frames provided for enrollment embedding');
  }

  const embeddingsCount = frames.length;
  const embeddings: number[][] = [];

  for (let i = 0; i < embeddingsCount; i++) {
    const frame = frames[i];
    let facePixels: number[];

    if (width !== undefined && height !== undefined) {
      // 1. Run BlazeFace to get face bounding box
      const bboxResult = await runBlazeFace(Array.from(frame));
      if (bboxResult.length < 5) {
        console.warn(`No face detected in enrollment frame ${i}`);
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
        console.warn(`Face detection confidence too low in enrollment frame ${i}: ${bbox.confidence}`);
        continue;
      }

      // 2. Crop & resize to 112x112
      facePixels = cropAndResizeRGB(frame, width, height, bbox, 112, 112);
    } else {
      // Assume frame is already a 112x112 RGB array
      if (frame.length !== 112 * 112 * 3) {
        throw new Error(`Frame ${i} size is ${frame.length}, expected 112x112x3 = 37632 elements`);
      }
      facePixels = Array.from(frame);
    }

    // 3. Generate embedding
    const emb = await runFaceNet(facePixels);
    if (emb.length > 0) {
      embeddings.push(emb);
    } else {
      console.warn(`Invalid embedding generated for frame ${i}, length: ${emb.length}`);
    }
  }

  if (embeddings.length === 0) {
    throw new Error('Failed to generate any valid face embeddings from the provided frames');
  }

  // 4. Average all embeddings element-wise
  const embLength = embeddings[0].length;
  const averaged = new Array(embLength).fill(0.0);
  for (let i = 0; i < embLength; i++) {
    let sum = 0.0;
    for (let j = 0; j < embeddings.length; j++) {
      sum += embeddings[j][i];
    }
    averaged[i] = sum / embeddings.length;
  }

  // 5. Return L2 normalized averaged embedding
  return l2Normalize(averaged);
}
