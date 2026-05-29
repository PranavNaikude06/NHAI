// src/services/PrototypeService.ts
// Tasks 4, 5, 6 — Multi-Prototype Bank, Cohort Calibration, Lighting-Tagged Matching

import { getDatabase } from '../db/database';
import { EncryptionService } from './EncryptionService';
import { cosineSimilarity } from '../ml/cosine';
import { Config } from '../constants/config';
import { addEmbeddingToCache } from '../native/VectorSearchBridge';
import Aes from 'react-native-aes-crypto';
import { AuthLogService } from './AuthLogService';

export type LightingBucket = 'morning' | 'midday' | 'afternoon' | 'indoor' | 'unknown';
export type PoseDirection = 'left' | 'center' | 'right';
export type PrototypeSource = 'enrollment' | 'auth_update' | 'batch_photo';

export interface Prototype {
  id: number;
  userId: string;
  name: string;
  role: string;
  embedding: number[];
  enrolledAt: number;
  source: PrototypeSource;
  lightingBucket: LightingBucket;
  poseDirection: PoseDirection;
  provisionalTrustCount: number;
  thresholdOverride: number | null;
  embeddingHash: string;
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  name?: string;
  confidence?: number;
  reason?: 'LOW_CONFIDENCE' | 'AMBIGUOUS_MATCH' | 'LIVENESS_FAILED' | 'RATE_LIMITED' | 'TAMPER_DETECTED' | 'UNKNOWN_FACE';
}

export interface GhostTwinPair {
  userId1: string;
  userId2: string;
  maxSimilarity: number;
  severity: 'HIGH' | 'MEDIUM';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function classifyLighting(hourOfDay: number, laplacianVariance?: number): LightingBucket {
  if (laplacianVariance !== undefined && laplacianVariance < 40) return 'indoor';
  if (hourOfDay >= 6 && hourOfDay < 10) return 'morning';
  if (hourOfDay >= 10 && hourOfDay < 14) return 'midday';
  if (hourOfDay >= 14 && hourOfDay <= 19) return 'afternoon';
  return 'indoor';
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findLeastUniquePrototype(prototypes: Prototype[]): Prototype {
  let leastUnique = prototypes[0];
  let maxAvgSim = -1;
  for (const p of prototypes) {
    const others = prototypes.filter(o => o.id !== p.id);
    if (others.length === 0) break;
    const avgSim = others.reduce((s, o) => s + cosineSimilarity(p.embedding, o.embedding), 0) / others.length;
    if (avgSim > maxAvgSim) { maxAvgSim = avgSim; leastUnique = p; }
  }
  return leastUnique;
}

// ─── PrototypeService ─────────────────────────────────────────────────────────

export class PrototypeService {

  static async computeEmbeddingHash(embedding: number[], userId: string, enrolledAt: number): Promise<string> {
    try {
      const data = JSON.stringify(embedding) + userId + enrolledAt.toString();
      return await Aes.hmac256(data, 'datalakeguard-integrity-v1');
    } catch {
      return '';
    }
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  static async getAllPrototypes(): Promise<Map<string, Prototype[]>> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql('SELECT * FROM embeddings ORDER BY user_id, enrolled_at ASC', []);
      const map = new Map<string, Prototype[]>();
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        let embedding: number[];
        try {
          embedding = await EncryptionService.decryptEmbedding(row.embedding);
        } catch { continue; }

        // Tamper detection
        const expectedHash = await this.computeEmbeddingHash(embedding, row.user_id, row.enrolled_at);
        if (row.embedding_hash && row.embedding_hash !== '' && row.embedding_hash !== expectedHash) {
          console.error(`[PrototypeService] TAMPER DETECTED for user ${row.user_id}, id=${row.id}`);
          continue;
        }

        const proto: Prototype = {
          id: row.id, userId: row.user_id, name: row.name, role: row.role,
          embedding, enrolledAt: row.enrolled_at, source: row.source || 'enrollment',
          lightingBucket: row.lighting_bucket || 'unknown',
          poseDirection: row.pose_direction || 'center',
          provisionalTrustCount: row.provisional_trust_count || 0,
          thresholdOverride: row.threshold_override ?? null,
          embeddingHash: row.embedding_hash || '',
        };
        const arr = map.get(proto.userId) ?? [];
        arr.push(proto);
        map.set(proto.userId, arr);
      }
      return map;
    } catch (error) {
      console.error('[PrototypeService] getAllPrototypes failed:', error);
      return new Map();
    }
  }

  static async getPrototypesForUser(userId: string): Promise<Prototype[]> {
    try {
      const db = await getDatabase();
      const [result] = await db.executeSql(
        'SELECT * FROM embeddings WHERE user_id = ? ORDER BY enrolled_at ASC', [userId]
      );
      const protos: Prototype[] = [];
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        let embedding: number[];
        try { embedding = await EncryptionService.decryptEmbedding(row.embedding); } catch { continue; }
        protos.push({
          id: row.id, userId: row.user_id, name: row.name, role: row.role,
          embedding, enrolledAt: row.enrolled_at, source: row.source || 'enrollment',
          lightingBucket: row.lighting_bucket || 'unknown',
          poseDirection: row.pose_direction || 'center',
          provisionalTrustCount: row.provisional_trust_count || 0,
          thresholdOverride: row.threshold_override ?? null,
          embeddingHash: row.embedding_hash || '',
        });
      }
      return protos;
    } catch (error) {
      console.error('[PrototypeService] getPrototypesForUser failed:', error);
      return [];
    }
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  static async addPrototype(
    userId: string, name: string, role: string,
    embedding: number[], source: PrototypeSource,
    lightingBucket: LightingBucket = 'unknown',
    poseDirection: PoseDirection = 'center',
    thresholdOverride?: number
  ): Promise<void> {
    const db = await getDatabase();
    const enrolledAt = Date.now();
    const encryptedBlob = await EncryptionService.encryptEmbedding(embedding);
    const hash = await this.computeEmbeddingHash(embedding, userId, enrolledAt);
    await db.executeSql(
      `INSERT INTO embeddings
       (user_id, name, role, embedding, enrolled_at, source, lighting_bucket, pose_direction, provisional_trust_count, threshold_override, embedding_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, role, encryptedBlob, enrolledAt, source,
       lightingBucket, poseDirection, 0, thresholdOverride ?? null, hash]
    );
    try { await addEmbeddingToCache(userId, embedding); } catch { /* non-fatal */ }
  }

  static async maybeAddAuthPrototype(
    userId: string, name: string, role: string,
    newEmbedding: number[], similarity: number,
    lightingBucket: LightingBucket, poseDirection: PoseDirection
  ): Promise<void> {
    if (similarity < Config.AUTH_UPDATE_MIN_SIMILARITY) return;

    const existing = await this.getPrototypesForUser(userId);

    // Skip if too similar to any existing prototype (adds no diversity)
    const maxSimToExisting = existing.length > 0
      ? Math.max(...existing.map(p => cosineSimilarity(newEmbedding, p.embedding)))
      : 0;
    if (maxSimToExisting > Config.PROTOTYPE_DIVERSITY_MIN) return;

    if (existing.length < Config.MAX_PROTOTYPES) {
      await this.addPrototype(userId, name, role, newEmbedding, 'auth_update', lightingBucket, poseDirection);
    } else {
      // Replace least unique prototype
      const least = findLeastUniquePrototype(existing);
      const db = await getDatabase();
      const enrolledAt = Date.now();
      const encryptedBlob = await EncryptionService.encryptEmbedding(newEmbedding);
      const hash = await this.computeEmbeddingHash(newEmbedding, userId, enrolledAt);
      await db.executeSql(
        `UPDATE embeddings SET embedding=?, enrolled_at=?, source='auth_update',
         lighting_bucket=?, pose_direction=?, embedding_hash=? WHERE id=?`,
        [encryptedBlob, enrolledAt, lightingBucket, poseDirection, hash, least.id]
      );
      try { await addEmbeddingToCache(userId, newEmbedding); } catch { /* non-fatal */ }
    }
  }

  // Exponential moving-average template aging on best-matching prototype
  static async applyTemplateAging(
    userId: string, liveEmbedding: number[], similarity: number
  ): Promise<void> {
    if (similarity < Config.HIGH_CONFIDENCE_UPDATE) return;
    const protos = await this.getPrototypesForUser(userId);
    if (protos.length === 0) return;
    // Find best matching prototype
    let best = protos[0]; let bestSim = cosineSimilarity(liveEmbedding, protos[0].embedding);
    for (const p of protos.slice(1)) {
      const s = cosineSimilarity(liveEmbedding, p.embedding);
      if (s > bestSim) { bestSim = s; best = p; }
    }
    const ALPHA = 0.05;
    const updated = best.embedding.map((v, i) => (1 - ALPHA) * v + ALPHA * liveEmbedding[i]);
    const mag = Math.sqrt(updated.reduce((s, v) => s + v * v, 0));
    const normalised = updated.map(v => v / mag);
    const db = await getDatabase();
    const newAt = Date.now();
    const encryptedBlob = await EncryptionService.encryptEmbedding(normalised);
    const hash = await this.computeEmbeddingHash(normalised, userId, newAt);
    await db.executeSql(
      'UPDATE embeddings SET embedding=?, enrolled_at=?, embedding_hash=? WHERE id=?',
      [encryptedBlob, newAt, hash, best.id]
    );
    try { await addEmbeddingToCache(userId, normalised); } catch { /* non-fatal */ }
  }

  static async updateThreshold(userId: string, threshold: number): Promise<void> {
    const db = await getDatabase();
    await db.executeSql(
      'UPDATE embeddings SET threshold_override=? WHERE user_id=?', [threshold, userId]
    );
  }

  static async promoteProvisionalIfReady(userId: string): Promise<void> {
    const db = await getDatabase();
    const [r] = await db.executeSql(
      'SELECT id, provisional_trust_count FROM embeddings WHERE user_id=? AND source=? LIMIT 1',
      [userId, 'batch_photo']
    );
    if (r.rows.length === 0) return;
    const row = r.rows.item(0);
    const newCount = (row.provisional_trust_count || 0) + 1;
    await db.executeSql(
      'UPDATE embeddings SET provisional_trust_count=? WHERE id=?', [newCount, row.id]
    );
    if (newCount >= Config.PROVISIONAL_PROMOTE_COUNT) {
      await db.executeSql(
        `UPDATE embeddings SET source='enrollment', threshold_override=NULL WHERE id=?`, [row.id]
      );
      console.log(`[PrototypeService] Promoted provisional user ${userId} to full enrollment`);
    }
  }

  static async promoteProvisonalIfReady(userId: string): Promise<void> {
    await this.promoteProvisionalIfReady(userId);
  }

  static async checkRateLimit(): Promise<boolean> {
    return AuthLogService.isRateLimited();
  }

  // ── Multi-Prototype Authentication (Task 4) ─────────────────────────────────

  static async authenticateWithPrototypeBank(
    liveEmbedding: number[],
    currentLighting: LightingBucket,
    targetUserId?: string,  // 1:1 verification mode
    contextualAdjustment = 0
  ): Promise<AuthResult> {
    const isLocked = await this.checkRateLimit();
    if (isLocked) {
      return { success: false, reason: 'RATE_LIMITED' };
    }

    const allPrototypes = await this.getAllPrototypes();
    if (allPrototypes.size === 0) return { success: false, reason: 'UNKNOWN_FACE' };

    const usersToCheck = targetUserId
      ? (allPrototypes.has(targetUserId) ? [[targetUserId, allPrototypes.get(targetUserId)!]] : [])
      : [...allPrototypes.entries()];

    const userScores = new Map<string, { score: number; name: string; protos: Prototype[] }>();

    for (const [uid, protos] of usersToCheck as [string, Prototype[]][]) {
      if (protos.length === 0) continue;

      // Sort: lighting-matched prototypes first (top 5 preferred)
      const sorted = [...protos].sort((a, b) => {
        const aMatch = a.lightingBucket === currentLighting ? 1 : 0;
        const bMatch = b.lightingBucket === currentLighting ? 1 : 0;
        return bMatch - aMatch;
      });
      const compSet = sorted.slice(0, 5);

      const similarities = compSet.map(p => cosineSimilarity(liveEmbedding, p.embedding));
      const maxSim = Math.max(...similarities);
      const meanSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;
      const score = 0.7 * maxSim + 0.3 * meanSim;

      userScores.set(uid, { score, name: protos[0].name, protos });
    }

    if (userScores.size === 0) return { success: false, reason: 'UNKNOWN_FACE' };

    const sorted = [...userScores.entries()].sort((a, b) => b[1].score - a[1].score);
    const [bestUserId, bestData] = sorted[0];
    const secondScore = sorted.length > 1 ? sorted[1][1].score : 0;
    const securityMargin = bestData.score - secondScore;

    // Determine threshold for this user
    const userThreshold = bestData.protos[0].thresholdOverride
      ?? (Config.COSINE_THRESHOLD + contextualAdjustment);
    const isProvisional = bestData.protos[0].source === 'batch_photo'
      && bestData.protos[0].provisionalTrustCount < Config.PROVISIONAL_PROMOTE_COUNT;
    const effectiveThreshold = isProvisional
      ? Math.min(Config.PROVISIONAL_THRESHOLD, userThreshold)
      : userThreshold;

    const marginRequired = isProvisional
      ? Config.SECURITY_MARGIN * 0.8
      : Config.SECURITY_MARGIN;

    if (bestData.score >= effectiveThreshold && (targetUserId || securityMargin >= marginRequired)) {
      return { success: true, userId: bestUserId, name: bestData.name, confidence: bestData.score };
    }

    return {
      success: false,
      confidence: bestData.score,
      reason: bestData.score < effectiveThreshold ? 'LOW_CONFIDENCE' : 'AMBIGUOUS_MATCH',
    };
  }

  // ── Cohort Threshold Calibration (Task 5) ────────────────────────────────────

  static async recomputeAllThresholds(): Promise<void> {
    const allUsers = await this.getAllPrototypes();
    if (allUsers.size < 2) return;

    for (const [userId, userPrototypes] of allUsers) {
      const genuineSims: number[] = [];
      for (let i = 0; i < userPrototypes.length; i++) {
        for (let j = i + 1; j < userPrototypes.length; j++) {
          genuineSims.push(cosineSimilarity(userPrototypes[i].embedding, userPrototypes[j].embedding));
        }
      }

      const impostorSims: number[] = [];
      for (const [otherId, otherPrototypes] of allUsers) {
        if (otherId === userId) continue;
        for (const myProto of userPrototypes) {
          for (const theirProto of otherPrototypes) {
            impostorSims.push(cosineSimilarity(myProto.embedding, theirProto.embedding));
          }
        }
      }

      if (genuineSims.length === 0 || impostorSims.length === 0) continue;

      const eerThreshold = this._findEERThreshold(genuineSims, impostorSims);
      const calibrated = Math.max(0.50, Math.min(0.95, eerThreshold + 0.03));
      await this.updateThreshold(userId, calibrated);
    }
    console.log('[PrototypeService] Cohort threshold recalibration complete.');
  }

  private static _findEERThreshold(genuine: number[], impostor: number[]): number {
    let bestThreshold = 0.65;
    let bestGap = Infinity;
    for (let t = 50; t <= 95; t++) {
      const threshold = t / 100;
      const far = impostor.filter(s => s >= threshold).length / impostor.length;
      const frr = genuine.filter(s => s < threshold).length / genuine.length;
      const gap = Math.abs(far - frr);
      if (gap < bestGap) { bestGap = gap; bestThreshold = threshold; }
    }
    return bestThreshold;
  }

  // ── Ghost Twin Detection ─────────────────────────────────────────────────────

  static async detectGhostTwins(): Promise<GhostTwinPair[]> {
    const allUsers = await this.getAllPrototypes();
    const pairs: GhostTwinPair[] = [];
    const userIds = [...allUsers.keys()];

    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const protos_i = allUsers.get(userIds[i])!;
        const protos_j = allUsers.get(userIds[j])!;
        let maxCross = 0;
        for (const pi of protos_i) {
          for (const pj of protos_j) {
            maxCross = Math.max(maxCross, cosineSimilarity(pi.embedding, pj.embedding));
          }
        }
        if (maxCross > Config.GHOST_TWIN_THRESHOLD) {
          pairs.push({
            userId1: userIds[i], userId2: userIds[j],
            maxSimilarity: maxCross,
            severity: maxCross > 0.85 ? 'HIGH' : 'MEDIUM',
          });
        }
      }
    }
    return pairs.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
  }

  // ── Contextual Confidence Adjustment (Task 7) ────────────────────────────────

  static computeContextualAdjustment(
    locationLat?: number, locationLng?: number,
    hourOfDay?: number,
    workerAuthHours?: number[]
  ): number {
    let adjustment = 0;
    const hour = hourOfDay ?? new Date().getHours();

    // GPS: within worksite radius?
    if (locationLat !== undefined && locationLng !== undefined) {
      const dist = haversineDistance(
        locationLat, locationLng,
        Config.WORKSITE_LAT, Config.WORKSITE_LNG
      );
      if (dist < Config.WORKSITE_RADIUS_METERS) {
        adjustment -= 0.03; // lenient on-site
      } else if (dist > Config.WORKSITE_RADIUS_METERS * 3) {
        adjustment += 0.08; // suspicious far from site
      }
    }

    // Time: within shift hours?
    if (hour < Config.SHIFT_START_HOUR || hour > Config.SHIFT_END_HOUR) {
      adjustment += 0.06;
    }

    // Worker's historical pattern deviation
    if (workerAuthHours && workerAuthHours.length >= 10) {
      const meanHour = workerAuthHours.reduce((a, b) => a + b, 0) / workerAuthHours.length;
      const hourDrift = Math.abs(hour - meanHour);
      if (hourDrift > 4) adjustment += 0.05;
    }

    return adjustment;
  }

  // ── System Health Signal ─────────────────────────────────────────────────────

  static async computeSystemHealthAlert(recentLogs: Array<{ result: string }>): Promise<string | null> {
    if (recentLogs.length < 10) return null;
    const successRate = recentLogs.filter(l => l.result === 'authenticated').length / recentLogs.length;
    // If success rate drops more than 40% below expected (historical) 80%, warn
    if (successRate < 0.48) {
      return `⚠ System condition alert: Success rate dropped to ${(successRate * 100).toFixed(0)}% in last 30 minutes. Check camera lens and lighting.`;
    }
    return null;
  }
}
