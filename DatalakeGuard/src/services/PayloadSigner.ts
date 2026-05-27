// src/services/PayloadSigner.ts

import Aes from 'react-native-aes-crypto';

export class PayloadSigner {
  static async sign(payload: object, secretKey: string): Promise<string> {
    const data = JSON.stringify(payload);
    return await Aes.hmac256(data, secretKey);
  }
}
