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
  laplacian?: number;
}

export interface ModelDiagnostic {
  name: string;
  filename: string;
  sizeBytes: number;
  status: 'loaded' | 'missing';
}

export async function getModelDiagnostics(): Promise<ModelDiagnostic[]> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.getModelDiagnostics();
}

/**
 * Run the full BlazeFace → FaceNet → VectorSearch pipeline from a JPEG file.
 * The file is decoded natively in Kotlin with BitmapFactory (handles EXIF
 * rotation, JPEG decompression, etc.), avoiding the JS pixel-buffer issue.
 *
 * @param fileUri  Absolute path or file:// URI to the captured JPEG.
 * @param enableCLAHE  Whether to apply CLAHE contrast enhancement.
 * @param clipLimit  CLAHE clip limit (default 2.0).
 * @param tileSize  CLAHE tile grid size (default 8).
 */
export async function runFullPipeline(
  fileUri: string,
  enableCLAHE: boolean = true,
  clipLimit: number = 2.0,
  tileSize: number = 8
): Promise<FullPipelineResult> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.runFullPipelineFromFile(
    fileUri,
    enableCLAHE,
    clipLimit,
    tileSize
  );
}

/**
 * Legacy overload: run the pipeline from a pre-decoded RGB pixel array.
 * Prefer runFullPipeline(fileUri) for live camera captures.
 */
export async function runFullPipelineFromPixels(
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

export interface DecodedRgbResult {
  width: number;
  height: number;
  pixels: number[];
}

/**
 * Decode a JPEG file natively, rescales it so that the maximum dimension is maxSize,
 * and returns the uncompressed RGB pixel array.
 */
export async function decodeJpegToRgb(
  fileUri: string,
  maxSize: number
): Promise<DecodedRgbResult> {
  if (!TFLiteInference) {
    return Promise.reject('TFLiteInference module is not available');
  }
  return TFLiteInference.decodeJpegToRgb(fileUri, maxSize);
}
