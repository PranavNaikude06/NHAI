import Aes from 'react-native-aes-crypto';
import * as Keychain from 'react-native-keychain';
import { Config } from '../constants/config';

export class DeviceIdentityService {
  private static deviceId: string | null = null;

  static async getDeviceId(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }

    const stored = await Keychain.getGenericPassword({ service: Config.DEVICE_ID_SERVICE });
    if (stored) {
      this.deviceId = stored.password;
      return stored.password;
    }

    const suffix = await Aes.randomKey(8);
    const generated = `dg-${suffix.slice(0, 16).toLowerCase()}`;
    await Keychain.setGenericPassword('device_id', generated, { service: Config.DEVICE_ID_SERVICE });
    this.deviceId = generated;
    return generated;
  }
}
