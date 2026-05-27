import { runBlazeFace, runFaceNet } from '../native/TFLiteBridge';
import { cosineSimilarity, SIMILARITY_THRESHOLD } from './cosine';
import { RecognitionResult, BoundingBox } from './types';
import { loadEmbeddingsToNative, findBestMatch } from '../native/VectorSearchBridge';
import { EmbeddingService as StoredEmbeddingService } from '../services/EmbeddingService';

// Simple crop and resize using Nearest Neighbor interpolation for flat RGB arrays
export function cropAndResizeRGB(
  pixels: Uint8Array | number[],
  srcWidth: number,
  srcHeight: number,
  bbox: BoundingBox,
  targetWidth: number,
  targetHeight: number
): number[] {
  // Normalize bounds if they are normalized coordinates, otherwise use raw
  // Assuming bbox has relative coordinates [0, 1] as returned by some detectors.
  // If BlazeFace outputs normalized coordinates, we multiply by dimensions.
  // Otherwise, if they are raw pixels, we use them directly.
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

export async function recognize(
  frameData: Uint8Array | number[],
  width: number,
  height: number,
  embeddingService: EmbeddingLookupService = StoredEmbeddingService,
  livenessPass: boolean = true
): Promise<RecognitionResult> {
  try {
    // 1. Run BlazeFace to detect face bounding box
    const bboxResult = await runBlazeFace(Array.from(frameData));
    
    // We expect runBlazeFace to return: [x, y, w, h, confidence]
    if (bboxResult.length < 5) {
      return { identity: null, name: null, confidence: 0, livenessPass };
    }

    const bbox: BoundingBox = {
      x: bboxResult[0],
      y: bboxResult[1],
      width: bboxResult[2],
      height: bboxResult[3],
      confidence: bboxResult[4],
    };

    if (bbox.confidence < 0.5) {
      return { identity: null, name: null, confidence: 0, livenessPass };
    }

    // 2. Crop + Resize to 112x112 for MobileFaceNet
    const croppedFace = cropAndResizeRGB(frameData, width, height, bbox, 112, 112);

    // 3. Generate Embedding using runFaceNet
    const embedding = await runFaceNet(croppedFace);
    if (embedding.length === 0) {
      throw new Error(`Invalid embedding generated, got empty array`);
    }

    // 4. Compare with enrolled embeddings using native SIMD VectorSearch
    const enrolledUsers = await embeddingService.getAllEmbeddings();
    
    let bestMatchId: string | null = null;
    let bestMatchName: string | null = null;
    let maxSimilarity = -1.0;

    if (enrolledUsers.length > 0) {
      try {
        const vectors = enrolledUsers.map(user => user.vector);
        const userIds = enrolledUsers.map(user => user.userId);
        await loadEmbeddingsToNative(vectors, userIds);

        const match = await findBestMatch(embedding);
        if (match.userId) {
          bestMatchId = match.userId;
          maxSimilarity = match.similarity;
          const matchedUser = enrolledUsers.find(user => user.userId === bestMatchId);
          if (matchedUser) {
            bestMatchName = matchedUser.name;
          }
        }
      } catch (e) {
        console.warn('Native vector search failed, falling back to JS implementation:', e);
        // Fallback to JS loop
        for (const user of enrolledUsers) {
          const similarity = cosineSimilarity(embedding, user.vector);
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            bestMatchId = user.userId;
            bestMatchName = user.name;
          }
        }
      }
    }

    // 5. Match verification against threshold (0.6)
    if (maxSimilarity >= SIMILARITY_THRESHOLD) {
      return {
        identity: bestMatchId,
        name: bestMatchName,
        confidence: maxSimilarity,
        livenessPass,
      };
    }

    return {
      identity: null,
      name: null,
      confidence: maxSimilarity,
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
