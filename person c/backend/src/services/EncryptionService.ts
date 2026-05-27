// src/services/EncryptionService.ts

import Aes from 'react-native-aes-crypto';
import * as Keychain from 'react-native-keychain';

const KEY_SERVICE = 'com.datalakeguard.embeddingkey';

export class EncryptionService {
  private static encryptionKey: string | null = null;

  // Called once at startup. Generates key if first run, loads from Keychain otherwise.
  static async initialize(): Promise<void> {
    try {
      const stored = await Keychain.getGenericPassword({ service: KEY_SERVICE });
      if (stored) {
        this.encryptionKey = stored.password;
      } else {
        const newKey = await Aes.randomKey(32); // 256-bit key
        await Keychain.setGenericPassword('embedding_key', newKey, { service: KEY_SERVICE });
        this.encryptionKey = newKey;
      }
    } catch (error) {
      console.error('[EncryptionService] Initialization failed:', error);
      throw error;
    }
  }

  static async encryptEmbedding(embedding: number[]): Promise<string> {
    if (!this.encryptionKey) throw new Error('EncryptionService not initialized');
    
    try {
      const plaintext = JSON.stringify(embedding);
      const iv = await Aes.randomKey(16);
      const cipher = await Aes.encrypt(plaintext, this.encryptionKey, iv, 'aes-256-cbc');
      return JSON.stringify({ cipher, iv }); // Store both together
    } catch (error) {
      console.error('[EncryptionService] Encryption failed:', error);
      throw error;
    }
  }

  static async decryptEmbedding(stored: string): Promise<number[]> {
    if (!this.encryptionKey) throw new Error('EncryptionService not initialized');
    
    try {
      const { cipher, iv } = JSON.parse(stored);
      const plaintext = await Aes.decrypt(cipher, this.encryptionKey, iv, 'aes-256-cbc');
      return JSON.parse(plaintext);
    } catch (error) {
      console.error('[EncryptionService] Decryption failed:', error);
      throw error;
    }
  }
}
