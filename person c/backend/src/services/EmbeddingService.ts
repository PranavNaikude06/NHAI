// src/services/EmbeddingService.ts

import { getDatabase } from '../db/database';
import { EncryptionService } from './EncryptionService';

export interface StoredWorker {
  userId: string;
  name: string;
  role: string;
  embedding: number[];   // Decrypted float[128]
  enrolledAt: number;
}

export class EmbeddingService {

  // Called by Person B's EnrollCameraScreen after Person A generates the embedding
  static async enrollWorker(
    name: string,
    role: string,
    workerId: string,
    rawEmbedding: number[]
  ): Promise<void> {
    try {
      const encryptedBlob = await EncryptionService.encryptEmbedding(rawEmbedding);
      const db = await getDatabase();
      await db.executeSql(
        `INSERT OR REPLACE INTO embeddings (user_id, name, role, embedding, enrolled_at)
         VALUES (?, ?, ?, ?, ?)`,
        [workerId, name, role, encryptedBlob, Date.now()]
      );
    } catch (error) {
      console.error('[EmbeddingService] Error enrolling worker:', error);
      throw error;
    }
  }

  // Called by Person A's cosine similarity lookup on every recognition attempt
  static async getAllEmbeddings(): Promise<StoredWorker[]> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql('SELECT * FROM embeddings', []);
      const workers: StoredWorker[] = [];
      
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        const embedding = await EncryptionService.decryptEmbedding(row.embedding);
        workers.push({
          userId: row.user_id,
          name: row.name,
          role: row.role,
          embedding,
          enrolledAt: row.enrolled_at,
        });
      }
      return workers;
    } catch (error) {
      console.error('[EmbeddingService] Error fetching embeddings:', error);
      throw error;
    }
  }

  static async getEnrolledCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql('SELECT COUNT(*) as count FROM embeddings', []);
      return result.rows.item(0).count;
    } catch (error) {
      console.error('[EmbeddingService] Error getting enrolled count:', error);
      return 0;
    }
  }

  static async deleteWorker(userId: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.executeSql('DELETE FROM embeddings WHERE user_id = ?', [userId]);
    } catch (error) {
      console.error('[EmbeddingService] Error deleting worker:', error);
      throw error;
    }
  }
}
