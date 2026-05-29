/**
 * DatalakeGuard App Entry Point
 * Wires up navigation routes and initialises database backend.
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from './src/db/database';
import { EncryptionService } from './src/services/EncryptionService';
import { SyncService } from './src/services/SyncService';
import { PayloadSigner } from './src/services/PayloadSigner';
import { DeviceIdentityService } from './src/services/DeviceIdentityService';
import { AppNavigator } from './src/navigation/AppNavigator';

function App() {
  useEffect(() => {
    let mounted = true;

    const initializeBackend = async () => {
      try {
        console.log('[App] Initialising database & secure modules...');
        await initDatabase();
        await EncryptionService.initialize();
        await PayloadSigner.initializeDeviceSecret();
        const deviceId = await DeviceIdentityService.getDeviceId();
        if (mounted) {
          SyncService.startConnectivityListener(deviceId);
          console.log('[App] Secure modules and sync worker active.');
        }
      } catch (error) {
        console.error('[App] Backend initialization failed:', error);
      }
    };

    initializeBackend();

    return () => {
      mounted = false;
      SyncService.stopConnectivityListener();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

export default App;
