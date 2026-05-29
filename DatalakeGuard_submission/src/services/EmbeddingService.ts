// src/services/EmbeddingService.ts

import { getDatabase } from '../db/database';
import { EncryptionService } from './EncryptionService';
import { InputValidator } from './InputValidator';
import { Config } from '../constants/config';
import { addEmbeddingToCache } from '../native/VectorSearchBridge';
import { PrototypeService, LightingBucket } from './PrototypeService';
import { checkNegativeEnrollment, EnrollmentPrototype } from '../ml/enrollment';

export interface StoredWorker {
  userId: string;
  name: string;
  role: string;
  embedding: number[];   // Decrypted float[192]
  vector: number[];      // Alias used by Person A's recognition pipeline
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
      InputValidator.validateEnrollment(name, role, workerId, rawEmbedding);
      const db = await getDatabase();
      
      // Check if worker already exists
      const [existing] = await db.executeSql(
        'SELECT COUNT(*) as count FROM embeddings WHERE user_id = ?',
        [workerId]
      );
      const row = existing.rows.length > 0 ? existing.rows.item(0) : null;
      const isExisting = row && row.count > 0;
      
      if (!isExisting) {
        const count = await this.getEnrolledCount();
        if (count >= Config.MAX_ENROLLED_WORKERS) {
          throw new Error('Database limit reached: Maximum enrolled workers exceeded');
        }
      }

      // Negative enrollment check: prevent enrolling duplicate face (similarity > 0.80)
      const allPrototypesMap = await PrototypeService.getAllPrototypes();
      const existingPrototypesList: Array<{ userId: string; embedding: number[] }> = [];
      for (const [uid, protos] of allPrototypesMap.entries()) {
        for (const p of protos) {
          existingPrototypesList.push({ userId: uid, embedding: p.embedding });
        }
      }
      
      const conflict = checkNegativeEnrollment(rawEmbedding, existingPrototypesList, Config.DUPLICATE_ENROLL_THRESHOLD);
      if (conflict && conflict.conflictUserId !== workerId) {
        throw new Error(`Duplicate enrollment conflict: face matches existing user ${conflict.conflictUserId}`);
      }

      const encryptedBlob = await EncryptionService.encryptEmbedding(rawEmbedding);
      const enrolledAt = Date.now();
      const hash = await PrototypeService.computeEmbeddingHash(rawEmbedding, workerId, enrolledAt);

      await db.executeSql('DELETE FROM embeddings WHERE user_id = ? AND source = ?', [workerId, 'enrollment']);
      await db.executeSql(
        `INSERT OR REPLACE INTO embeddings (user_id, name, role, embedding, enrolled_at, source, lighting_bucket, pose_direction, provisional_trust_count, threshold_override, embedding_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [workerId, name, role, encryptedBlob, enrolledAt, 'enrollment', 'unknown', 'center', 0, null, hash]
      );
      try {
        await addEmbeddingToCache(workerId, rawEmbedding);
      } catch (e) {
        console.warn('[EmbeddingService] Failed to sync new embedding to native cache:', e);
      }
    } catch (error) {
      console.error('[EmbeddingService] Enrollment failed');
      throw error;
    }
  }

  static async enrollWorkerPrototypes(
    name: string,
    role: string,
    workerId: string,
    prototypes: EnrollmentPrototype[],
    thresholdOverride?: number,
    lightingBucket: LightingBucket = 'unknown'
  ): Promise<void> {
    if (prototypes.length === 0) {
      throw new Error('No enrollment prototypes supplied');
    }

    try {
      for (const prototype of prototypes) {
        InputValidator.validateEnrollment(name, role, workerId, prototype.embedding);
      }

      const db = await getDatabase();
      const [existing] = await db.executeSql(
        'SELECT COUNT(*) as count FROM embeddings WHERE user_id = ?',
        [workerId]
      );
      const row = existing.rows.length > 0 ? existing.rows.item(0) : null;
      const isExisting = row && row.count > 0;

      if (!isExisting) {
        const count = await this.getEnrolledCount();
        if (count >= Config.MAX_ENROLLED_WORKERS) {
          throw new Error('Database limit reached: Maximum enrolled workers exceeded');
        }
      }

      const allPrototypesMap = await PrototypeService.getAllPrototypes();
      const existingPrototypesList: Array<{ userId: string; embedding: number[] }> = [];
      for (const [uid, protos] of allPrototypesMap.entries()) {
        for (const p of protos) {
          existingPrototypesList.push({ userId: uid, embedding: p.embedding });
        }
      }

      for (const prototype of prototypes) {
        const conflict = checkNegativeEnrollment(
          prototype.embedding,
          existingPrototypesList,
          Config.DUPLICATE_ENROLL_THRESHOLD
        );
        if (conflict && conflict.conflictUserId !== workerId) {
          throw new Error(`Duplicate enrollment conflict: face matches existing user ${conflict.conflictUserId}`);
        }
      }

      await db.executeSql('DELETE FROM embeddings WHERE user_id = ? AND source = ?', [workerId, 'enrollment']);

      for (const prototype of prototypes.slice(0, Config.MAX_PROTOTYPES)) {
        await PrototypeService.addPrototype(
          workerId,
          name,
          role,
          prototype.embedding,
          'enrollment',
          lightingBucket,
          prototype.poseDirection,
          thresholdOverride
        );
      }
    } catch (error) {
      console.error('[EmbeddingService] Multi-prototype enrollment failed');
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
        
        // Tamper detection
        const expectedHash = await PrototypeService.computeEmbeddingHash(embedding, row.user_id, row.enrolled_at);
        if (row.embedding_hash && row.embedding_hash !== '' && row.embedding_hash !== expectedHash) {
          console.error(`[EmbeddingService] TAMPER DETECTED for user ${row.user_id}`);
          continue; // Skip tampered record
        }

        workers.push({
          userId: row.user_id,
          name: row.name,
          role: row.role,
          embedding,
          vector: embedding,
          enrolledAt: row.enrolled_at,
        });
      }
      return workers;
    } catch (error) {
      console.error('[EmbeddingService] Fetching embeddings failed');
      throw error;
    }
  }

  static async getEnrolledCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql('SELECT COUNT(DISTINCT user_id) as count FROM embeddings', []);
      return result.rows.item(0).count;
    } catch (error) {
      console.error('[EmbeddingService] Getting enrolled count failed:', error);
      return 0;
    }
  }

  static async deleteWorker(userId: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.executeSql('DELETE FROM embeddings WHERE user_id = ?', [userId]);
    } catch (error) {
      console.error('[EmbeddingService] Deleting worker failed');
      throw error;
    }
  }

  // Task 9: Batch Enrollment Ingestion (CSV / provisional trust logic)
  static async ingestBatchCSV(csvContent: string): Promise<{ enrolled: number; failed: number }> {
    let enrolled = 0;
    let failed = 0;
    
    const lines = csvContent.split(/\r?\n/);
    if (lines.length <= 1) return { enrolled, failed };
    
    // Parse header
    const header = lines[0].toLowerCase().split(',');
    const userIdIdx = header.indexOf('userid');
    const nameIdx = header.indexOf('name');
    const roleIdx = header.indexOf('role');
    const embeddingIdx = header.indexOf('embedding');
    
    if (userIdIdx === -1 || nameIdx === -1 || embeddingIdx === -1) {
      throw new Error('Invalid CSV format: Missing required columns (userId, name, embedding)');
    }
    
    const db = await getDatabase();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Robust CSV line parser that handles quoted strings containing commas or spaces
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const char = line[charIdx];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      
      if (parts.length < Math.max(userIdIdx, nameIdx, embeddingIdx) + 1) {
        failed++;
        continue;
      }
      
      const workerId = parts[userIdIdx];
      const name = parts[nameIdx];
      const role = roleIdx !== -1 ? parts[roleIdx] : 'Field Worker';
      try {
        const embeddingStr = parts[embeddingIdx];
        let cleanEmbStr = embeddingStr.trim();
        if (cleanEmbStr.startsWith('[') && cleanEmbStr.endsWith(']')) {
          cleanEmbStr = cleanEmbStr.slice(1, -1).trim();
        }
        const embedding = cleanEmbStr.split(/[,\s;:]+/).map(v => parseFloat(v));
        
        if (embedding.length !== 192 || embedding.some(isNaN)) {
          console.warn(`[EmbeddingService] Row ${i} skipped: embedding length !== 192`);
          failed++;
          continue;
        }
        
        // Input validation
        InputValidator.validateEnrollment(name, role, workerId, embedding);
        
        // Negative enrollment check
        const allPrototypesMap = await PrototypeService.getAllPrototypes();
        const existingPrototypesList: Array<{ userId: string; embedding: number[] }> = [];
        for (const [uid, protos] of allPrototypesMap.entries()) {
          for (const p of protos) {
            existingPrototypesList.push({ userId: uid, embedding: p.embedding });
          }
        }
        
        const conflict = checkNegativeEnrollment(embedding, existingPrototypesList, Config.DUPLICATE_ENROLL_THRESHOLD);
        if (conflict && conflict.conflictUserId !== workerId) {
          console.warn(`[EmbeddingService] Row ${i} skipped due to negative duplicate conflict with user ${conflict.conflictUserId}`);
          failed++;
          continue;
        }
        
        // Add as provisional prototype
        const encryptedBlob = await EncryptionService.encryptEmbedding(embedding);
        const enrolledAt = Date.now();
        const hash = await PrototypeService.computeEmbeddingHash(embedding, workerId, enrolledAt);
        
        await db.executeSql(
          `INSERT OR REPLACE INTO embeddings (user_id, name, role, embedding, enrolled_at, source, lighting_bucket, pose_direction, provisional_trust_count, threshold_override, embedding_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [workerId, name, role, encryptedBlob, enrolledAt, 'batch_photo', 'unknown', 'center', 0, Config.PROVISIONAL_THRESHOLD, hash]
        );
        
        try {
          await addEmbeddingToCache(workerId, embedding);
        } catch {}
        
        enrolled++;
      } catch (err) {
        console.error(`[EmbeddingService] Failed to parse/enroll row ${i}:`, err);
        failed++;
      }
    }
    
    return { enrolled, failed };
  }
}
