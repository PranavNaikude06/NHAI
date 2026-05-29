import { NativeModules } from 'react-native';

const { MediaPipeLandmark } = NativeModules;

if (!MediaPipeLandmark) {
  console.warn('NativeModule: MediaPipeLandmark is null. Make sure it is registered in native code.');
}

export async function runFaceMesh(imageData: number[]): Promise<number[]> {
  if (!MediaPipeLandmark) {
    return Promise.reject('MediaPipeLandmark module is not available');
  }
  return MediaPipeLandmark.runFaceMesh(imageData);
}

// Helper to convert flat array to structured landmarks [{x,y,z}]
export function parseLandmarks(flat: number[]): { x: number; y: number; z: number }[] {
  const landmarks: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    landmarks.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2] });
  }
  return landmarks;
}
