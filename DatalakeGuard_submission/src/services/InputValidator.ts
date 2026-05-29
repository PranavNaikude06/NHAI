// src/services/InputValidator.ts

export class InputValidator {
  static validateEnrollment(
    name: string,
    role: string,
    workerId: string,
    embedding: number[]
  ): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Name must be a non-empty string');
    }
    if (name.length > 100) {
      throw new Error('Name must not exceed 100 characters');
    }
    // Allow letters, spaces, and hyphens
    const nameRegex = /^[A-Za-z\s-]+$/;
    if (!nameRegex.test(name)) {
      throw new Error('Name contains invalid characters (letters, spaces, hyphens only)');
    }

    if (!role || typeof role !== 'string') {
      throw new Error('Role must be a non-empty string');
    }
    const allowedRoles = ['Field Worker', 'Supervisor', 'Admin'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Role must be one of: Field Worker, Supervisor, Admin');
    }

    if (!workerId || typeof workerId !== 'string') {
      throw new Error('Worker ID must be a non-empty string');
    }
    if (workerId.length > 20) {
      throw new Error('Worker ID must not exceed 20 characters');
    }
    const workerIdRegex = /^[A-Za-z0-9-]+$/;
    if (!workerIdRegex.test(workerId)) {
      throw new Error('Worker ID must be alphanumeric and hyphens only');
    }

    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array');
    }
    if (embedding.length !== 192) {
      throw new Error('Embedding must have exactly 192 elements');
    }
    for (let i = 0; i < embedding.length; i++) {
      const val = embedding[i];
      if (typeof val !== 'number' || isNaN(val)) {
        throw new Error(`Embedding at index ${i} is not a valid number`);
      }
      if (val < -10.0 || val > 10.0) {
        throw new Error(`Embedding value at index ${i} is out of safe range [-10, 10]`);
      }
    }
  }

  static validateAuthLog(log: {
    userId: string | null;
    timestamp: number;
    confidence: number;
    livenessScore?: number;
    livenessPass: boolean;
    result: string;
    locationLat?: number;
    locationLng?: number;
  }): void {
    if (log.userId !== null && log.userId !== undefined) {
      if (typeof log.userId !== 'string') {
        throw new Error('User ID must be a string or null');
      }
      if (log.userId.length > 20) {
        throw new Error('User ID must not exceed 20 characters');
      }
      const workerIdRegex = /^[A-Za-z0-9-]+$/;
      if (!workerIdRegex.test(log.userId)) {
        throw new Error('User ID must be alphanumeric and hyphens only');
      }
    }

    if (typeof log.timestamp !== 'number' || isNaN(log.timestamp) || log.timestamp <= 0) {
      throw new Error('Timestamp must be a valid positive number');
    }

    if (typeof log.confidence !== 'number' || isNaN(log.confidence)) {
      throw new Error('Confidence must be a number');
    }
    if (log.confidence < 0.0 || log.confidence > 1.0) {
      throw new Error('Confidence must be between 0.0 and 1.0');
    }

    if (log.livenessScore !== undefined && log.livenessScore !== null) {
      if (typeof log.livenessScore !== 'number' || isNaN(log.livenessScore)) {
        throw new Error('Liveness score must be a number');
      }
      if (log.livenessScore < 0.0 || log.livenessScore > 1.0) {
        throw new Error('Liveness score must be between 0.0 and 1.0');
      }
    }

    if (typeof log.livenessPass !== 'boolean') {
      throw new Error('LivenessPass must be a boolean');
    }

    if (typeof log.result !== 'string') {
      throw new Error('Result must be a string');
    }
    const allowedResults = ['authenticated', 'unknown', 'spoof_rejected'];
    if (!allowedResults.includes(log.result)) {
      throw new Error('Result must be one of: authenticated, unknown, spoof_rejected');
    }

    if (log.locationLat !== undefined && log.locationLat !== null) {
      if (typeof log.locationLat !== 'number' || isNaN(log.locationLat)) {
        throw new Error('Location latitude must be a number');
      }
      if (log.locationLat < -90.0 || log.locationLat > 90.0) {
        throw new Error('Location latitude must be between -90.0 and 90.0');
      }
    }

    if (log.locationLng !== undefined && log.locationLng !== null) {
      if (typeof log.locationLng !== 'number' || isNaN(log.locationLng)) {
        throw new Error('Location longitude must be a number');
      }
      if (log.locationLng < -180.0 || log.locationLng > 180.0) {
        throw new Error('Location longitude must be between -180.0 and 180.0');
      }
    }
  }
}
