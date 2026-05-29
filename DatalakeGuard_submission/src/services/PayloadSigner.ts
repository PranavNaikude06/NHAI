// src/services/PayloadSigner.ts

import Aes from 'react-native-aes-crypto';
import * as Keychain from 'react-native-keychain';
import { Config } from '../constants/config';

export class PayloadSigner {
  private static deviceSecret: string | null = null;

  static async initializeDeviceSecret(): Promise<void> {
    const stored = await Keychain.getGenericPassword({ service: Config.HMAC_KEY_SERVICE });
    if (stored) {
      this.deviceSecret = stored.password;
      return;
    }

    const newSecret = await Aes.randomKey(32);
    await Keychain.setGenericPassword('hmac_key', newSecret, { service: Config.HMAC_KEY_SERVICE });
    this.deviceSecret = newSecret;
  }

  static async getDeviceSecret(): Promise<string> {
    if (!this.deviceSecret) {
      await this.initializeDeviceSecret();
    }
    if (!this.deviceSecret) {
      throw new Error('Device HMAC secret is unavailable');
    }
    return this.deviceSecret;
  }

  static async sign(payload: object, secretKey: string): Promise<string> {
    const data = JSON.stringify(payload);
    return await Aes.hmac256(data, secretKey);
  }

  static async signWithDeviceSecret(payload: object): Promise<string> {
    return this.sign(payload, await this.getDeviceSecret());
  }
}
