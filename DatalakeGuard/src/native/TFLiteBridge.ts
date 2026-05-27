import { NativeModules } from 'react-native';

const { TFLiteInference } = NativeModules;

if (!TFLiteInference) {
  console.warn('NativeModule: TFLiteInference is null. Make sure it is registered in native code.');
}

export async function ping(): Promise<string> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.ping();
}

export async function runBlazeFace(imageData: number[]): Promise<number[]> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.runBlazeFace(imageData);
}

export async function runFaceNet(
  croppedFaceData: number[],
  enableCLAHE: boolean = true,
  clipLimit: number = 2.0,
  tileSize: number = 8
): Promise<number[]> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.runFaceNet(croppedFaceData, enableCLAHE, clipLimit, tileSize);
}

export interface FullPipelineResult {
  faceDetected: boolean;
  identity: string | null;
  confidence: number;
  landmarks: number[];
  box: number[];
}

export async function runFullPipeline(
  imageData: number[],
  srcWidth: number,
  srcHeight: number,
  enableCLAHE: boolean = true,
  clipLimit: number = 2.0,
  tileSize: number = 8
): Promise<FullPipelineResult> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.runFullPipeline(
    imageData,
    srcWidth,
    srcHeight,
    enableCLAHE,
    clipLimit,
    tileSize
  );
}
