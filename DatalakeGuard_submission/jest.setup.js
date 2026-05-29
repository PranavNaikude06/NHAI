/* global jest, require */

const { NativeModules } = require('react-native');

NativeModules.TFLiteInference = {
  ping: jest.fn(async () => 'bridge_ok'),
  runBlazeFace: jest.fn(async () => []),
  runFaceNet: jest.fn(async () => []),
  runFullPipeline: jest.fn(async () => ({
    faceDetected: false,
    identity: null,
    confidence: 0,
    landmarks: [],
    box: [],
  })),
  getModelDiagnostics: jest.fn(async () => [
    {
      name: 'BlazeFace (Detection)',
      filename: 'blazeface.tflite',
      sizeBytes: 409600,
      status: 'loaded',
    },
  ]),
};

NativeModules.MediaPipeLandmark = {
  runFaceMesh: jest.fn(async () => []),
};

NativeModules.VectorSearch = {
  loadEmbeddings: jest.fn(async () => undefined),
  findBestMatch: jest.fn(async () => ({ userId: null, similarity: 0 })),
  addEmbedding: jest.fn(async () => undefined),
};

jest.mock('react-native-aes-crypto', () => ({
  randomKey: jest.fn(async length => '0'.repeat(length)),
  encrypt: jest.fn(async plaintext => `encrypted:${plaintext}`),
  decrypt: jest.fn(async cipher => cipher.replace(/^encrypted:/, '')),
  hmac256: jest.fn(async (data, key) => `mocked_hmac_${key}`),
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
}));

jest.mock('react-native-sqlite-storage', () => ({
  enablePromise: jest.fn(),
  openDatabase: jest.fn(async () => ({
    executeSql: jest.fn(async () => [
      {
        rows: {
          length: 0,
          item: jest.fn(),
        },
      },
    ]),
  })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useIsFocused: jest.fn(() => true),
  };
});

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Camera: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
    useCameraDevice: jest.fn(() => ({ id: 'test-camera', position: 'front' })),
    useCameraPermission: jest.fn(() => ({
      hasPermission: true,
      requestPermission: jest.fn(async () => true),
    })),
    usePhotoOutput: jest.fn(() => ({
      capturePhoto: jest.fn(async () => ({
        width: 2,
        height: 2,
        hasPixelBuffer: true,
        getPixelBuffer: () => new Uint8Array([
          0, 0, 0, 255,
          0, 0, 0, 255,
          0, 0, 0, 255,
          0, 0, 0, 255,
        ]).buffer,
        dispose: jest.fn(),
      })),
    })),
  };
});
