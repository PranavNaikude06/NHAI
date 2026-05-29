import { EncryptionService } from '../src/services/EncryptionService';
import { EmbeddingService } from '../src/services/EmbeddingService';
import { AuthLogService } from '../src/services/AuthLogService';
import { SyncService } from '../src/services/SyncService';
import { initDatabase, getDatabase } from '../src/db/database';
import * as Keychain from 'react-native-keychain';
import Aes from 'react-native-aes-crypto';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Backend Services Integration Tests', () => {
  let dbInstance: any;

  beforeAll(async () => {
    // Get the database singleton instance that the services use
    dbInstance = await getDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset executeSql mock on the singleton database instance
    dbInstance.executeSql = jest.fn().mockResolvedValue([
      {
        rows: {
          length: 0,
          item: jest.fn(),
        },
      },
    ]);
  });

  describe('1. EncryptionService', () => {
    test('should initialize and fetch/create password key from Keychain', async () => {
      // Setup Keychain to return empty first, then return password after generation
      (Keychain.getGenericPassword as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce({ password: 'test-key-32-chars-long-encryption' });

      await EncryptionService.initialize();

      expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
        service: 'com.datalakeguard.embeddingkey',
      });
      expect(Aes.randomKey).toHaveBeenCalledWith(32);
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'embedding_key',
        '0'.repeat(32), // Mock randomKey returns this in jest.setup.js
        { service: 'com.datalakeguard.embeddingkey' }
      );
    });

    test('should encrypt and decrypt embeddings float arrays correctly', async () => {
      // Mock key is present
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'mocked-key-for-test-purposes-only',
      });

      await EncryptionService.initialize();

      const originalEmbedding = Array.from({ length: 192 }, (_, i) => i * 0.01);
      const encryptedStr = await EncryptionService.encryptEmbedding(originalEmbedding);

      // Verify structure is JSON string containing cipher and iv
      const parsed = JSON.parse(encryptedStr);
      expect(parsed).toHaveProperty('cipher');
      expect(parsed).toHaveProperty('iv');

      // Decrypt and verify matching original array
      const decrypted = await EncryptionService.decryptEmbedding(encryptedStr);
      expect(decrypted).toEqual(originalEmbedding);
    });
  });

  describe('2. Database & Schema Initialization', () => {
    test('should initialize database successfully', async () => {
      const db = await initDatabase();
      expect(db).toBe(dbInstance);
    });

    test('should return database singleton on getDatabase', async () => {
      const db1 = await getDatabase();
      const db2 = await getDatabase();
      expect(db1).toBe(db2);
    });
  });

  describe('3. EmbeddingService', () => {
    test('should encrypt and insert embedding to DB', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'mocked-key-for-test-purposes-only',
      });
      await EncryptionService.initialize();

      const mockEmbedding = Array.from({ length: 192 }, () => 0.1);
      await EmbeddingService.enrollWorker('Alice Smith', 'Field Worker', 'EMP-001', mockEmbedding);

      expect(dbInstance.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO embeddings'),
        expect.arrayContaining(['EMP-001', 'Alice Smith', 'Field Worker'])
      );
      // Embedding parameter must be a JSON string of { cipher, iv }
      const insertCall = dbInstance.executeSql.mock.calls.find((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      const lastCallArgs = insertCall[1];
      const encryptedParam = lastCallArgs[3];
      expect(JSON.parse(encryptedParam)).toHaveProperty('cipher');
    });

    test('should retrieve and decrypt embeddings from DB', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'mocked-key-for-test-purposes-only',
      });
      await EncryptionService.initialize();

      const mockEncryptedVal = await EncryptionService.encryptEmbedding(Array.from({ length: 192 }, () => 0.1));

      // Mock DB query return
      dbInstance.executeSql.mockResolvedValue([
        {
          rows: {
            length: 1,
            item: () => ({
              user_id: 'EMP-001',
              name: 'Alice Smith',
              role: 'Field Worker',
              embedding: mockEncryptedVal,
              enrolled_at: 123456789,
            }),
          },
        },
      ]);

      const results = await EmbeddingService.getAllEmbeddings();
      expect(results.length).toBe(1);
      expect(results[0].userId).toBe('EMP-001');
      expect(results[0].name).toBe('Alice Smith');
      expect(results[0].embedding).toEqual(Array.from({ length: 192 }, () => 0.1));
      expect(results[0].vector).toEqual(Array.from({ length: 192 }, () => 0.1));
    });
  });

  describe('4. AuthLogService', () => {
    test('should insert auth attempts with synced = 0', async () => {
      const mockLog = {
        userId: 'EMP-001',
        timestamp: 1622000000,
        confidence: 0.85,
        livenessPass: true,
        result: 'authenticated' as const,
        locationLat: 19.076,
        locationLng: 72.877,
      };

      await AuthLogService.logAuthAttempt(mockLog);

      expect(dbInstance.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth_logs'),
        [
          mockLog.userId,
          mockLog.timestamp,
          mockLog.confidence,
          null,
          1, // livenessPass as integer
          mockLog.result,
          mockLog.locationLat,
          mockLog.locationLng,
        ]
      );
    });

    test('should retrieve pending logs', async () => {
      dbInstance.executeSql.mockResolvedValue([
        {
          rows: {
            length: 1,
            item: () => ({
              id: 42,
              user_id: 'EMP-001',
              timestamp: 1622000000,
              confidence: 0.85,
              liveness_pass: 1,
              result: 'authenticated',
              location_lat: 19.076,
              location_lng: 72.877,
            }),
          },
        },
      ]);

      const pending = await AuthLogService.getPendingLogs();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe(42);
      expect(pending[0].livenessPass).toBe(true);
      expect(pending[0].synced).toBe(false);
    });

    test('should mark logs as synced', async () => {
      await AuthLogService.markLogsAsSynced([10, 11, 12]);
      expect(dbInstance.executeSql).toHaveBeenCalledWith(
        'UPDATE auth_logs SET synced = 1 WHERE id IN (?,?,?)',
        [10, 11, 12]
      );
    });
  });

  describe('5. SyncService', () => {
    test('should batch, upload pending logs, and mark them as synced on success', async () => {
      // Mock pending count = 2
      dbInstance.executeSql
        .mockResolvedValueOnce([
          {
            rows: {
              length: 2,
              item: (idx: number) =>
                [
                  {
                    id: 101,
                    user_id: 'EMP-001',
                    timestamp: 1622000000,
                    confidence: 0.85,
                    liveness_pass: 1,
                    result: 'authenticated',
                  },
                  {
                    id: 102,
                    user_id: 'EMP-002',
                    timestamp: 1622001000,
                    confidence: 0.9,
                    liveness_pass: 1,
                    result: 'authenticated',
                  },
                ][idx],
            },
          },
        ]) // getPendingLogs
        .mockResolvedValueOnce([
          {
            rows: {
              length: 1,
              item: () => ({ count: 2 }),
            },
          },
        ]); // getPendingCount on subsequent calls if any

      // Mock successful axios POST
      mockedAxios.post.mockResolvedValue({ data: { ok: true, received: 2 } });

      await SyncService.sync('test-device-uuid');

      // Verify API Gateway payload format
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          device_id: 'test-device-uuid',
          auth_logs: expect.arrayContaining([
            expect.objectContaining({ log_id: 101, user_id: 'EMP-001' }),
            expect.objectContaining({ log_id: 102, user_id: 'EMP-002' }),
          ]),
        }),
        expect.any(Object)
      );

      // Verify db marked logs as synced
      expect(dbInstance.executeSql).toHaveBeenCalledWith(
        'UPDATE auth_logs SET synced = 1 WHERE id IN (?,?)',
        [101, 102]
      );
    });
  });
});
