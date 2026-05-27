import { runBlazeFace, runFaceNet } from '../native/TFLiteBridge';
import { runFaceMesh } from '../native/MediaPipeBridge';

const performance = (globalThis as any).performance || { now: () => Date.now() };

export interface BenchmarkStats {
  average: number;
  p95: number;
  min: number;
  max: number;
}

export interface BenchmarkReport {
  blazeFace: BenchmarkStats;
  faceMesh: BenchmarkStats;
  faceNet: BenchmarkStats;
  iterations: number;
}

function calculateStats(times: number[]): BenchmarkStats {
  if (times.length === 0) {
    return { average: 0, p95: 0, min: 0, max: 0 };
  }
  
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const average = sum / sorted.length;
  
  // P95 calculation
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  
  return {
    average,
    p95,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Runs a performance benchmark loop on the device.
 * Generates dummy pixel arrays to trigger TFLite model execution.
 */
export async function runDeviceBenchmark(iterations: number = 50): Promise<BenchmarkReport> {
  const blazeFaceTimes: number[] = [];
  const faceMeshTimes: number[] = [];
  const faceNetTimes: number[] = [];

  // 1. Prepare dummy inputs
  const dummyBlazeFaceInput = new Array(128 * 128 * 3).fill(127);
  const dummyFaceMeshInput = new Array(192 * 192 * 3).fill(127);
  const dummyFaceNetInput = new Array(112 * 112 * 3).fill(127);

  // Warmup run for models (just to compile/initialize GPU/CPU buffers)
  try {
    await runBlazeFace(dummyBlazeFaceInput);
    await runFaceMesh(dummyFaceMeshInput);
    await runFaceNet(dummyFaceNetInput);
  } catch (e) {
    console.warn('Benchmark warmup run failed, model loading might have errored:', e);
  }

  // 2. Run benchmark loops
  for (let i = 0; i < iterations; i++) {
    // BlazeFace
    try {
      const start = performance.now();
      await runBlazeFace(dummyBlazeFaceInput);
      blazeFaceTimes.push(performance.now() - start);
    } catch (e) {
      console.error(`BlazeFace benchmark run ${i} failed`, e);
    }

    // FaceMesh
    try {
      const start = performance.now();
      await runFaceMesh(dummyFaceMeshInput);
      faceMeshTimes.push(performance.now() - start);
    } catch (e) {
      console.error(`FaceMesh benchmark run ${i} failed`, e);
    }

    // FaceNet
    try {
      const start = performance.now();
      await runFaceNet(dummyFaceNetInput);
      faceNetTimes.push(performance.now() - start);
    } catch (e) {
      console.error(`FaceNet benchmark run ${i} failed`, e);
    }
  }

  return {
    blazeFace: calculateStats(blazeFaceTimes),
    faceMesh: calculateStats(faceMeshTimes),
    faceNet: calculateStats(faceNetTimes),
    iterations,
  };
}
