// Cosine Similarity calculation for 128-dimensional embeddings

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding size mismatch: a has ${a.length}, b has ${b.length}`);
  }

  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0.0 || normB === 0.0) {
    return 0.0; // Avoid division by zero
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Tunable threshold from PRD (similarity > 0.6 is authenticated)
export const SIMILARITY_THRESHOLD = 0.6;
