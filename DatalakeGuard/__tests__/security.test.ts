// Mock aws-sdk at the top level before importing sync-handler
jest.mock('aws-sdk', () => {
  const mockPutPromise = jest.fn();
  const mockPutObject = jest.fn().mockReturnValue({
    promise: mockPutPromise,
  });
  class MockS3 {
    putObject = mockPutObject;
  }
  
  (global as any).mockPutObject = mockPutObject;
  (global as any).mockPutPromise = mockPutPromise;

  return {
    S3: MockS3,
  };
}, { virtual: true });

import { InputValidator } from '../src/services/InputValidator';
import { EmbeddingService } from '../src/services/EmbeddingService';
import { AuthLogService } from '../src/services/AuthLogService';
import { PayloadSigner } from '../src/services/PayloadSigner';
import { PrototypeService } from '../src/services/PrototypeService';
import { EncryptionService } from '../src/services/EncryptionService';
import { getDatabase } from '../src/db/database';
import * as Keychain from 'react-native-keychain';
import { Config } from '../src/constants/config';
import { handler as lambdaHandler } from '../aws/lambda/sync-handler';
import Aes from 'react-native-aes-crypto';
import * as crypto from 'crypto';

describe('DatalakeGuard Security Hardening Tests', () => {
  let dbInstance: any;

  beforeAll(async () => {
    dbInstance = await getDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).mockPutObject.mockClear();
    (global as any).mockPutPromise.mockClear();
    (global as any).mockPutPromise.mockResolvedValue({});
    
    dbInstance.executeSql = jest.fn().mockResolvedValue([
      {
        rows: {
          length: 0,
          item: jest.fn(),
        },
      },
    ]);
  });

  describe('1. InputValidator', () => {
    const validEmbedding = Array.from({ length: 128 }, () => 1.5);

    test('should pass validation for correct enrollment data', () => {
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'Supervisor', 'EMP-1234', validEmbedding)
      ).not.toThrow();
    });

    test('should reject invalid names in enrollment', () => {
      // Script tag injection
      expect(() =>
        InputValidator.validateEnrollment('<script>alert("hack")</script>', 'Supervisor', 'EMP-1234', validEmbedding)
      ).toThrow();
      
      // SQL injection pattern
      expect(() =>
        InputValidator.validateEnrollment("Robert'; DROP TABLE embeddings;--", 'Supervisor', 'EMP-1234', validEmbedding)
      ).toThrow();

      // Too long name
      expect(() =>
        InputValidator.validateEnrollment('A'.repeat(101), 'Supervisor', 'EMP-1234', validEmbedding)
      ).toThrow();
    });

    test('should reject invalid roles in enrollment', () => {
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'HackerRole', 'EMP-1234', validEmbedding)
      ).toThrow();
    });

    test('should reject invalid workerId in enrollment', () => {
      // Special characters
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'Admin', 'EMP!123', validEmbedding)
      ).toThrow();

      // Too long
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'Admin', 'A'.repeat(21), validEmbedding)
      ).toThrow();
    });

    test('should reject invalid embedding array in enrollment', () => {
      // Too short
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'Admin', 'EMP-123', [1, 2, 3])
      ).toThrow();

      // Contains non-number
      const badEmbedding = [...validEmbedding];
      (badEmbedding as any)[10] = 'not-a-number';
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'Admin', 'EMP-123', badEmbedding)
      ).toThrow();

      // Out of bounds
      const outOfBoundsEmbedding = [...validEmbedding];
      outOfBoundsEmbedding[10] = 11.0;
      expect(() =>
        InputValidator.validateEnrollment('John Doe', 'Admin', 'EMP-123', outOfBoundsEmbedding)
      ).toThrow();
    });

    test('should pass validation for correct auth log data', () => {
      const validLog = {
        userId: 'EMP-123',
        timestamp: Date.now(),
        confidence: 0.95,
        livenessPass: true,
        result: 'authenticated' as const,
        locationLat: 12.9716,
        locationLng: 77.5946,
      };
      expect(() => InputValidator.validateAuthLog(validLog)).not.toThrow();
    });

    test('should reject invalid auth log data', () => {
      const baseLog = {
        userId: 'EMP-123',
        timestamp: Date.now(),
        confidence: 0.95,
        livenessPass: true,
        result: 'authenticated' as const,
      };

      // Invalid result
      expect(() => InputValidator.validateAuthLog({ ...baseLog, result: 'forged_result' as any })).toThrow();

      // Confidence out of bounds
      expect(() => InputValidator.validateAuthLog({ ...baseLog, confidence: 1.1 })).toThrow();

      // Latitude out of bounds
      expect(() => InputValidator.validateAuthLog({ ...baseLog, locationLat: 91.0 })).toThrow();
    });
  });

  describe('2. DB Size Limits (Local DoS Prevention)', () => {
    test('should reject new worker enrollment if MAX_ENROLLED_WORKERS is exceeded', async () => {
      // Mock db checks
      dbInstance.executeSql
        .mockResolvedValueOnce([
          {
            rows: {
              length: 1,
              item: () => ({ count: 0 }), // Worker does not exist yet
            },
          },
        ]) // inside exists check
        .mockResolvedValueOnce([
          {
            rows: {
              length: 1,
              item: () => ({ count: Config.MAX_ENROLLED_WORKERS }), // Db already full
            },
          },
        ]); // inside getEnrolledCount()

      const badEmbedding = Array.from({ length: 128 }, () => 1.0);
      await expect(
        EmbeddingService.enrollWorker('Limit Test', 'Admin', 'EMP-FULL', badEmbedding)
      ).rejects.toThrow('Database limit reached: Maximum enrolled workers exceeded');
    });

    test('should reject new auth log if MAX_UNSYNCED_LOGS is exceeded even after purge', async () => {
      dbInstance.executeSql
        .mockResolvedValueOnce([
          {
            rows: {
              length: 1,
              item: () => ({ count: Config.MAX_UNSYNCED_LOGS }), // Limit hit
            },
          },
        ]) // first getPendingCount
        .mockResolvedValueOnce([
          {
            rows: {
              length: 0,
              item: () => ({}), // Purge execution
            },
          },
        ]) // purgeSyncedLogs
        .mockResolvedValueOnce([
          {
            rows: {
              length: 1,
              item: () => ({ count: Config.MAX_UNSYNCED_LOGS }), // Still full after purge
            },
          },
        ]); // second getPendingCount

      const mockLog = {
        userId: 'EMP-123',
        timestamp: Date.now(),
        confidence: 0.95,
        livenessPass: true,
        result: 'authenticated' as const,
      };

      await expect(AuthLogService.logAuthAttempt(mockLog)).rejects.toThrow(
        'Database limit reached: Maximum unsynced logs exceeded'
      );
    });
  });

  describe('3. PayloadSigner', () => {
    test('should call native AES hmac256 and return consistent signature', async () => {
      const payload = { device_id: 'test-device', auth_logs: [] };
      const secret = 'test-secret';
      
      const sig = await PayloadSigner.sign(payload, secret);
      expect(Aes.hmac256).toHaveBeenCalledWith(JSON.stringify(payload), secret);
      expect(sig).toBe(`mocked_hmac_${secret}`);
    });
  });

  describe('4. AWS Lambda Hardening', () => {
    const secretKey = 'YOUR_KEY_HERE';
    const samplePayload = {
      device_id: 'device-123',
      sync_timestamp: Date.now(),
      auth_logs: [
        {
          log_id: 1,
          user_id: 'EMP-001',
          timestamp: Date.now(),
          confidence: 0.92,
          liveness_pass: true,
          result: 'authenticated',
        },
      ],
    };

    // Calculate a valid mock signature using standard Node crypto
    const calcSignature = (bodyObj: any, key: string) => {
      return crypto
        .createHmac('sha256', key)
        .update(JSON.stringify(bodyObj))
        .digest('hex');
    };

    beforeAll(() => {
      process.env.S3_BUCKET_NAME = 'mock-s3-bucket';
    });

    test('should reject requests with missing payload signature', async () => {
      const event = {
        headers: {
          'x-api-key': secretKey,
        },
        body: JSON.stringify(samplePayload),
      };

      const result = await lambdaHandler(event as any);
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('Unauthorized: Invalid payload signature');
    });

    test('should reject requests with invalid payload signature', async () => {
      const event = {
        headers: {
          'x-api-key': secretKey,
          'x-signature': 'wrong-signature',
        },
        body: JSON.stringify(samplePayload),
      };

      const result = await lambdaHandler(event as any);
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('Unauthorized: Invalid payload signature');
    });

    test('should validate basic payload structure with correct signature', async () => {
      const signature = calcSignature(samplePayload, secretKey);
      const event = {
        headers: {
          'x-api-key': secretKey,
          'x-signature': signature,
        },
        body: JSON.stringify(samplePayload),
      };

      const result = await lambdaHandler(event as any);
      expect(result.statusCode).toBe(200);
      const parsedBody = JSON.parse(result.body);
      expect(parsedBody.ok).toBe(true);
      expect(parsedBody.received).toBe(1);
    });

    test('should reject payload with too many log items', async () => {
      const oversizedPayload = {
        device_id: 'device-123',
        sync_timestamp: Date.now(),
        auth_logs: Array.from({ length: 501 }, (_, i) => ({
          log_id: i,
          user_id: 'EMP-001',
          timestamp: Date.now(),
          confidence: 0.9,
          liveness_pass: true,
          result: 'authenticated',
        })),
      };

      const signature = calcSignature(oversizedPayload, secretKey);
      const event = {
        headers: {
          'x-api-key': secretKey,
          'x-signature': signature,
        },
        body: JSON.stringify(oversizedPayload),
      };

      const result = await lambdaHandler(event as any);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Batch too large, max 500 logs');
    });

    test('should protect against path traversal in device_id', async () => {
      const maliciousPayload = {
        device_id: '../../malicious-path',
        sync_timestamp: Date.now(),
        auth_logs: [],
      };

      const signature = calcSignature(maliciousPayload, secretKey);
      const event = {
        headers: {
          'x-api-key': secretKey,
          'x-signature': signature,
        },
        body: JSON.stringify(maliciousPayload),
      };

      const result = await lambdaHandler(event as any);
      expect(result.statusCode).toBe(200);
      
      expect((global as any).mockPutObject).toHaveBeenCalled();
      const s3CallArg = (global as any).mockPutObject.mock.calls[0][0];
      // Should replace ../ with _ and only allow valid characters
      expect(s3CallArg.Key).toContain('logs/______malicious-path/');
    });

    test('should mask internal error messages in case of server exception', async () => {
      const signature = calcSignature(samplePayload, secretKey);
      const event = {
        headers: {
          'x-api-key': secretKey,
          'x-signature': signature,
        },
        body: JSON.stringify(samplePayload),
      };

      // Mock S3 failure to trigger Lambda catch block
      (global as any).mockPutPromise.mockRejectedValueOnce(new Error('S3 Connection Lost! Deep AWS Internals!'));

      const result = await lambdaHandler(event as any);
      expect(result.statusCode).toBe(500);
      const parsedBody = JSON.parse(result.body);
      expect(parsedBody.error).toBe('Internal server error');
      // Verify detailed message is masked
      expect(parsedBody.details).toBeUndefined();
    });
  });

  describe('5. Hackathon 7.0 Upgrades Verification', () => {
    const dummyEmbedding = Array.from({ length: 128 }, () => 0.1);

    test('should prevent auth if locked out by rate limiting', async () => {
      // Mock db to return 3 failures
      dbInstance.executeSql.mockResolvedValueOnce([
        {
          rows: {
            length: 3,
            item: (idx: number) => [
              { result: 'unknown', timestamp: Date.now() - 5000 },
              { result: 'spoof_rejected', timestamp: Date.now() - 10000 },
              { result: 'unknown', timestamp: Date.now() - 15000 }
            ][idx]
          }
        }
      ]);

      const res = await PrototypeService.authenticateWithPrototypeBank(dummyEmbedding, 'indoor');
      expect(res.success).toBe(false);
      expect(res.reason).toBe('RATE_LIMITED');
    });

    test('should skip/fail authentication if database row is tampered (hash mismatch)', async () => {
      // Setup Keychain for EncryptionService decryption
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'mocked-key-for-test-purposes-only',
      });
      await EncryptionService.initialize();

      const encryptedBlob = await EncryptionService.encryptEmbedding(dummyEmbedding);

      // Mock DB return for getAllPrototypes
      dbInstance.executeSql.mockResolvedValueOnce([
        {
          rows: {
            length: 1,
            item: () => ({
              id: 1,
              user_id: 'EMP-TAMP',
              name: 'Tamper Boy',
              role: 'Field Worker',
              embedding: encryptedBlob,
              enrolled_at: 12345678,
              embedding_hash: 'bad-hash' // mismatched integrity hash
            })
          }
        }
      ]);

      const res = await PrototypeService.getAllPrototypes();
      expect(res.size).toBe(0); // skipped due to tamper check
    });

    test('should ingest batch CSV enrollment and assign provisional trust', async () => {
      // Setup Keychain for EncryptionService
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'mocked-key-for-test-purposes-only',
      });
      await EncryptionService.initialize();

      // Empty DB for existing embeddings during duplicate checking
      dbInstance.executeSql.mockResolvedValue([
        {
          rows: {
            length: 0,
            item: () => ({})
          }
        }
      ]);

      const csvContent = 
        `userId,name,role,embedding\n` +
        `EMP-CSV1,Batch Alice,Field Worker,"[${Array(128).fill(0.15).join(' ')}]"\n` +
        `EMP-CSV2,Batch Bob,Supervisor,"[${Array(128).fill(-0.05).join(' ')}]"`;

      const result = await EmbeddingService.ingestBatchCSV(csvContent);
      expect(result.enrolled).toBe(2);
      expect(result.failed).toBe(0);

      // Verify provisional INSERT was called
      expect(dbInstance.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO embeddings'),
        expect.arrayContaining(['EMP-CSV1', 'Batch Alice', 'Field Worker', 'batch_photo'])
      );
    });

    test('should skip batch CSV row if it violates negative enrollment duplicate check', async () => {
      // Setup Keychain for EncryptionService
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'mocked-key-for-test-purposes-only',
      });
      await EncryptionService.initialize();

      const encryptedBlob = await EncryptionService.encryptEmbedding(dummyEmbedding);

      // Mock database to return existing worker with same face
      dbInstance.executeSql.mockResolvedValueOnce([
        {
          rows: {
            length: 1,
            item: () => ({
              id: 99,
              user_id: 'EMP-EXISTING',
              name: 'Existing Guy',
              role: 'Field Worker',
              embedding: encryptedBlob,
              enrolled_at: 12345678,
              embedding_hash: ''
            })
          }
        }
      ]);

      // CSV contains exact same embedding vector -> matches existing user at 1.0 similarity (> 0.80)
      const csvContent = 
        `userId,name,role,embedding\n` +
        `EMP-CSV3,Duplicate Guy,Field Worker,"[${Array(128).fill(0.1).join(' ')}]"`;

      const result = await EmbeddingService.ingestBatchCSV(csvContent);
      expect(result.enrolled).toBe(0);
      expect(result.failed).toBe(1);
    });

    test('should adjust threshold dynamically based on Contextual Confidence Engine', () => {
      // 1. Lenient onsite: -0.03 adjustment
      const adjOnsite = PrototypeService.computeContextualAdjustment(19.076, 72.877, 12);
      expect(adjOnsite).toBeCloseTo(-0.03);

      // 2. Suspicious offsite: +0.08 adjustment
      const adjOffSite = PrototypeService.computeContextualAdjustment(20.0, 75.0, 12);
      expect(adjOffSite).toBeCloseTo(0.08);

      // 3. Off-shift time adjustment: +0.06 adjustment
      const adjOffShift = PrototypeService.computeContextualAdjustment(undefined, undefined, 23);
      expect(adjOffShift).toBeCloseTo(0.06);

      // 4. Combined location & off-shift time: 0.08 + 0.06 = 0.14
      const adjCombined = PrototypeService.computeContextualAdjustment(20.0, 75.0, 23);
      expect(adjCombined).toBeCloseTo(0.14);
    });
  });
});
