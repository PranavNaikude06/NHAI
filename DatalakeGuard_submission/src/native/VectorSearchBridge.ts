import { NativeModules } from 'react-native';

const { VectorSearch } = NativeModules;

if (!VectorSearch) {
  console.warn('NativeModule: VectorSearch is null. Make sure it is registered in native code.');
}

export interface MatchResult {
  userId: string | null;
  similarity: number;
}

/**
 * Loads enrolled embeddings and their user IDs into the native vector cache.
 */
export async function loadEmbeddingsToNative(
  embeddings: number[][],
  userIds: string[]
): Promise<void> {
  if (!VectorSearch) {
    console.warn('VectorSearch native module not available');
    return;
  }
  return VectorSearch.loadEmbeddings(embeddings, userIds);
}

/**
 * Computes cosine similarity against all enrolled embeddings in native memory
 * and returns the best match with maximum similarity.
 */
export async function findBestMatch(
  queryEmbedding: number[]
): Promise<MatchResult> {
  if (!VectorSearch) {
    console.warn('VectorSearch native module not available');
    return { userId: null, similarity: 0.0 };
  }
  return VectorSearch.findBestMatch(queryEmbedding);
}

/**
 * Adds or updates a single enrollment embedding in the native vector cache.
 */
export async function addEmbeddingToCache(
  userId: string,
  embedding: number[]
): Promise<void> {
  if (!VectorSearch) {
    console.warn('VectorSearch native module not available');
    return;
  }
  return VectorSearch.addEmbedding(userId, embedding);
}
