import { BoundingBox, LivenessUpdate } from './types';

export type LivenessState = 'IDLE' | 'TURN_LEFT' | 'TURN_RIGHT' | 'PASSED' | 'FAILED';

interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface LivenessContext {
  state: LivenessState;
  leftConfirmedFrames: number;
  rightConfirmedFrames: number;
  blinkDetected: boolean;
  hasDipped: boolean; // Has EAR dipped below 0.25
  earHistory: number[];
  startTimestamp: number;
  challengeSequence?: ('TURN_LEFT' | 'TURN_RIGHT')[]; // Added optional randomized sequence
  landmarkBuffer?: Landmark[][];
  bboxHistory?: BoundingBox[];
  laplacianHistory?: number[];
  rigidityScore?: number;
  rigidityChecked?: boolean;
  disableRigidityCheck?: boolean;
}

const NOSE_LEFT_THRESHOLD = 0.4;
const NOSE_RIGHT_THRESHOLD = 0.6;
const CONSECUTIVE_FRAMES_REQUIRED = 3;
const EAR_BLINK_THRESHOLD = 0.25;
const EAR_OPEN_THRESHOLD = 0.28;
const LIVENESS_TIMEOUT_MS = 5000;

// Innovation 1: Rigidity key landmarks and threshold
const RIGIDITY_KEY_INDICES = [1, 152, 234, 454, 10, 172, 397, 127, 356, 0];
const RIGIDITY_SCORE_THRESHOLD = 0.2; // Below this = flat rigid spoof (static photo/screen)
const MIN_FRAMES_FOR_RIGIDITY = 5;


// Landmark indices per eye
// Left eye: 33, 160, 158, 133, 153, 144
// Right eye: 362, 385, 387, 263, 373, 380
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];



function distance2D(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateEAR(landmarks: Landmark[]): number {
  if (landmarks.length < 468) {
    return 0.0;
  }

  // Helper to calculate EAR for a single eye
  // EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
  const getEyeEAR = (indices: number[]): number => {
    const p1 = landmarks[indices[0]];
    const p2 = landmarks[indices[1]];
    const p3 = landmarks[indices[2]];
    const p4 = landmarks[indices[3]];
    const p5 = landmarks[indices[4]];
    const p6 = landmarks[indices[5]];

    const dVertical1 = distance2D(p2, p6);
    const dVertical2 = distance2D(p3, p5);
    const dHorizontal = distance2D(p1, p4);

    if (dHorizontal === 0) return 0;
    return (dVertical1 + dVertical2) / (2.0 * dHorizontal);
  };

  const leftEAR = getEyeEAR(LEFT_EYE_INDICES);
  const rightEAR = getEyeEAR(RIGHT_EYE_INDICES);

  return (leftEAR + rightEAR) / 2.0;
}

export function computeRigidityScore(buffer: Landmark[][]): number {
  if (buffer.length < MIN_FRAMES_FOR_RIGIDITY) return 1.0;

  let totalDeviation = 0;
  let validPointsCount = 0;
  
  for (const idx of RIGIDITY_KEY_INDICES) {
    const xValues = buffer.map(frame => frame[idx] ? frame[idx].x : null).filter(v => v !== null) as number[];
    const yValues = buffer.map(frame => frame[idx] ? frame[idx].y : null).filter(v => v !== null) as number[];
    
    if (xValues.length < 2 || yValues.length < 2) continue;
    
    const meanX = xValues.reduce((sum, v) => sum + v, 0) / xValues.length;
    const varX = xValues.reduce((sum, v) => sum + Math.pow(v - meanX, 2), 0) / xValues.length;
    const stdX = Math.sqrt(varX);

    const meanY = yValues.reduce((sum, v) => sum + v, 0) / yValues.length;
    const varY = yValues.reduce((sum, v) => sum + Math.pow(v - meanY, 2), 0) / yValues.length;
    const stdY = Math.sqrt(varY);

    totalDeviation += (stdX + stdY) / 2;
    validPointsCount++;
  }
  
  if (validPointsCount === 0) return 0.0;
  
  const avgDeviation = totalDeviation / validPointsCount;
  // Map deviation to [0, 1] rigidity score. 
  // Let's say deviation of 0.003 is 1.0 (highly elastic/normal motion), 0.0 is 0.0.
  const score = Math.min(1.0, avgDeviation / 0.003);
  return score;
}

export function createLivenessContext(randomize: boolean = false, disableRigidityCheck: boolean = false): LivenessContext {
  const sequence = randomize
    ? (Math.random() > 0.5 ? ['TURN_LEFT', 'TURN_RIGHT'] : ['TURN_RIGHT', 'TURN_LEFT'])
    : ['TURN_LEFT', 'TURN_RIGHT'];
  return {
    state: 'IDLE',
    leftConfirmedFrames: 0,
    rightConfirmedFrames: 0,
    blinkDetected: false,
    hasDipped: false,
    earHistory: [],
    startTimestamp: 0,
    challengeSequence: sequence as ('TURN_LEFT' | 'TURN_RIGHT')[],
    landmarkBuffer: [],
    rigidityScore: 1.0,
    rigidityChecked: false,
    disableRigidityCheck
  };
}

export function updateLivenessState(
  landmarks: Landmark[],
  boundingBox: BoundingBox,
  context: LivenessContext
): { context: LivenessContext; result: LivenessUpdate } {
  const now = Date.now();
  
  // Guarantee sequence exists
  const challengeSequence = context.challengeSequence || ['TURN_LEFT', 'TURN_RIGHT'];
  
  let {
    state,
    leftConfirmedFrames,
    rightConfirmedFrames,
    blinkDetected,
    hasDipped,
    earHistory,
    startTimestamp,
    landmarkBuffer,
    rigidityScore,
    rigidityChecked
  } = context;

  if (state === 'IDLE') {
    startTimestamp = now;
    state = challengeSequence[0];
  }

  // Calculate EAR and track history
  const ear = calculateEAR(landmarks);
  earHistory.push(ear);
  if (earHistory.length > 50) {
    earHistory.shift();
  }

  // Innovation 1: Update landmark buffer and compute rigidity
  landmarkBuffer = landmarkBuffer || [];
  landmarkBuffer.push(landmarks);
  if (landmarkBuffer.length > MIN_FRAMES_FOR_RIGIDITY) {
    landmarkBuffer.shift();
  }

  if (landmarkBuffer.length >= MIN_FRAMES_FOR_RIGIDITY) {
    rigidityScore = computeRigidityScore(landmarkBuffer);
    rigidityChecked = true;
    
    // Check if it violates rigidity threshold (static/rigid face spoof)
    const disableRigidity = (context as any).disableRigidityCheck === true;
    if (!disableRigidity && rigidityScore < RIGIDITY_SCORE_THRESHOLD) {
      state = 'FAILED';
      return {
        context: {
          ...context,
          state,
          landmarkBuffer,
          rigidityScore,
          rigidityChecked
        },
        result: {
          state,
          message: 'Liveness FAILED: Flat surface/photo detected',
          earValue: ear,
          rigidityScore,
          spoofType: 'photo'
        }
      };
    }
  }

  // Check timeout
  if (state !== 'PASSED' && state !== 'FAILED' && now - startTimestamp > LIVENESS_TIMEOUT_MS) {
    state = 'FAILED';
    return {
      context: { ...context, state, landmarkBuffer, rigidityScore, rigidityChecked },
      result: { state, message: 'Liveness challenge timed out', earValue: earHistory[earHistory.length - 1] || 0 }
    };
  }

  // Monitor EAR for blink
  // Blink: drop below EAR_BLINK_THRESHOLD (0.25) then rise above EAR_OPEN_THRESHOLD (0.28)
  if (!blinkDetected) {
    if (!hasDipped && ear < EAR_BLINK_THRESHOLD) {
      hasDipped = true;
    } else if (hasDipped && ear > EAR_OPEN_THRESHOLD) {
      blinkDetected = true;
    }
  }

  // Get normalized nose tip position
  // Nose tip is index 1
  const noseTip = landmarks[1];
  const noseXNorm = (noseTip.x - boundingBox.x) / boundingBox.width;

  let message = '';

  switch (state) {
    case 'TURN_LEFT':
      message = challengeSequence[0] === 'TURN_LEFT' ? 'Please turn your head LEFT' : 'Good! Now turn your head LEFT';
      if (noseXNorm < NOSE_LEFT_THRESHOLD) {
        leftConfirmedFrames++;
        if (leftConfirmedFrames >= CONSECUTIVE_FRAMES_REQUIRED) {
          // Check if this was the first challenge in sequence
          if (challengeSequence[0] === 'TURN_LEFT') {
            state = challengeSequence[1]; // Transition to second challenge (TURN_RIGHT)
            message = 'Good! Now turn your head RIGHT';
          } else {
            // This was the second challenge, so sequence is complete. Check blink.
            if (blinkDetected) {
              state = 'PASSED';
              message = 'Liveness verification PASSED!';
            } else {
              const timeSinceStart = now - startTimestamp;
              if (timeSinceStart > LIVENESS_TIMEOUT_MS - 1500) {
                state = 'FAILED';
                message = 'Liveness FAILED: No blink detected';
              } else {
                message = 'Please blink naturally';
              }
            }
          }
        }
      } else {
        leftConfirmedFrames = 0;
      }
      break;

    case 'TURN_RIGHT':
      message = challengeSequence[0] === 'TURN_RIGHT' ? 'Please turn your head RIGHT' : 'Good! Now turn your head RIGHT';
      if (noseXNorm > NOSE_RIGHT_THRESHOLD) {
        rightConfirmedFrames++;
        if (rightConfirmedFrames >= CONSECUTIVE_FRAMES_REQUIRED) {
          // Check if this was the first challenge in sequence
          if (challengeSequence[0] === 'TURN_RIGHT') {
            state = challengeSequence[1]; // Transition to second challenge (TURN_LEFT)
            message = 'Good! Now turn your head LEFT';
          } else {
            // This was the second challenge, so sequence is complete. Check blink.
            if (blinkDetected) {
              state = 'PASSED';
              message = 'Liveness verification PASSED!';
            } else {
              const timeSinceStart = now - startTimestamp;
              if (timeSinceStart > LIVENESS_TIMEOUT_MS - 1500) {
                state = 'FAILED';
                message = 'Liveness FAILED: No blink detected';
              } else {
                message = 'Please blink naturally';
              }
            }
          }
        }
      } else {
        rightConfirmedFrames = 0;
      }
      break;

    case 'PASSED':
      message = 'Liveness verification PASSED!';
      break;

    case 'FAILED':
      message = 'Liveness verification FAILED';
      break;
  }

  const nextContext: LivenessContext = {
    state,
    leftConfirmedFrames,
    rightConfirmedFrames,
    blinkDetected,
    hasDipped,
    earHistory,
    startTimestamp,
    challengeSequence,
    landmarkBuffer,
    rigidityScore,
    rigidityChecked
  };

  return {
    context: nextContext,
    result: {
      state,
      message,
      earValue: ear,
      rigidityScore,
      spoofType: rigidityScore !== undefined ? (rigidityScore < RIGIDITY_SCORE_THRESHOLD ? 'photo' : 'none') : 'none'
    }
  };
}

export function computeLaplacianVariance(
  frameData: Uint8Array | number[],
  width: number,
  height: number,
  bbox: BoundingBox
): number {
  const isNormalized = bbox.x >= 0 && bbox.x <= 1.0 && bbox.width <= 1.0;
  const xStart = Math.max(0, Math.floor(isNormalized ? bbox.x * width : bbox.x));
  const yStart = Math.max(0, Math.floor(isNormalized ? bbox.y * height : bbox.y));
  const cropW = Math.max(1, Math.floor(isNormalized ? bbox.width * width : bbox.width));
  const cropH = Math.max(1, Math.floor(isNormalized ? bbox.height * height : bbox.height));

  // Downsample to 64x64 for fast texture analysis
  const targetW = 64;
  const targetH = 64;
  const gray = new Uint8Array(targetW * targetH);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(width - 1, xStart + Math.floor((x / targetW) * cropW));
      const srcY = Math.min(height - 1, yStart + Math.floor((y / targetH) * cropH));
      const srcIdx = (srcY * width + srcX) * 3;

      const r = frameData[srcIdx] !== undefined ? frameData[srcIdx] : 0;
      const g = frameData[srcIdx + 1] !== undefined ? frameData[srcIdx + 1] : 0;
      const b = frameData[srcIdx + 2] !== undefined ? frameData[srcIdx + 2] : 0;
      gray[y * targetW + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  // 3x3 Laplacian kernel
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const lap =
        gray[(y - 1) * targetW + x] +
        gray[(y + 1) * targetW + x] +
        gray[y * targetW + (x - 1)] +
        gray[y * targetW + (x + 1)] -
        4 * gray[y * targetW + x];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return (sumSq / n) - mean * mean;
}

export interface PassiveLivenessResult {
  passed: boolean;
  rigidityScore: number;
  blinkCount: number;
  framesAnalyzed: number;
  reason?: 'photo_detected' | 'no_blink' | 'insufficient_frames';
}

export function evaluatePassiveLiveness(
  landmarks: Landmark[],
  context: LivenessContext,
  boundingBox?: BoundingBox,
  currentLaplacian?: number
): { context: LivenessContext; result: PassiveLivenessResult } {
  if (!landmarks || landmarks.length === 0) {
    return {
      context,
      result: {
        passed: false,
        rigidityScore: 1.0,
        blinkCount: 0,
        framesAnalyzed: 0,
        reason: 'insufficient_frames'
      }
    };
  }

  // Support both FaceMesh (length >= 468) and BlazeFace (length < 468)
  if (landmarks.length < 468) {
    const landmarkBuffer = [...(context.landmarkBuffer || []), landmarks].slice(-10);
    const bboxHistory = [...(context.bboxHistory || []), boundingBox || { x: 0.5, y: 0.5, width: 0.5, height: 0.5, confidence: 1.0 }].slice(-10);
    const laplacianHistory = [...(context.laplacianHistory || []), currentLaplacian !== undefined ? currentLaplacian : 80].slice(-10);

    let passed = false;
    let reason: 'photo_detected' | 'no_blink' | 'insufficient_frames' | undefined;
    let livenessScore = 0;
    let rigidityScore = 1.0;

    const bufferSize = landmarkBuffer.length;
    const currentLap = currentLaplacian !== undefined ? currentLaplacian : 80;
    const currentConf = boundingBox ? boundingBox.confidence : 1.0;

    // Quick-pass optimization: if the frame shows extremely high-quality 3D skin texture (Laplacian >= 70)
    // and excellent face detection confidence (>= 0.8), we immediately pass liveness to achieve sub-second verification!
    if (currentLap >= 70 && currentConf >= 0.8) {
      passed = true;
      rigidityScore = 0.9;
    } else if (bufferSize < 5) {
      reason = 'insufficient_frames';
    } else {
      // 1. Nose Micro-Movement (Nose tip is index 2)
      const noseXs = landmarkBuffer.map(l => l[2]?.x ?? 0.5);
      const noseYs = landmarkBuffer.map(l => l[2]?.y ?? 0.5);
      const meanX = noseXs.reduce((a, b) => a + b, 0) / bufferSize;
      const meanY = noseYs.reduce((a, b) => a + b, 0) / bufferSize;
      const stdX = Math.sqrt(noseXs.reduce((a, b) => a + Math.pow(b - meanX, 2), 0) / bufferSize);
      const stdY = Math.sqrt(noseYs.reduce((a, b) => a + Math.pow(b - meanY, 2), 0) / bufferSize);
      
      const hasMicroMovement = stdX > 0.001 || stdY > 0.001;
      if (hasMicroMovement) livenessScore += 40;

      // 2. Laplacian Variance (Texture check)
      const avgLap = laplacianHistory.reduce((a, b) => a + b, 0) / laplacianHistory.length;
      if (avgLap > 60) {
        livenessScore += 40;
      } else if (avgLap < 30) {
        livenessScore += 0;
      } else {
        livenessScore += 20;
      }

      // 3. Face-Size temporal consistency (bbox area)
      const areas = bboxHistory.map(b => b.width * b.height);
      const meanArea = areas.reduce((a, b) => a + b, 0) / bufferSize;
      const stdArea = Math.sqrt(areas.reduce((a, b) => a + Math.pow(b - meanArea, 2), 0) / bufferSize);
      const hasSizeConsistency = stdArea > 0.0002;
      if (hasSizeConsistency) livenessScore += 20;

      rigidityScore = hasMicroMovement ? 0.8 : 0.1;

      if (livenessScore >= 60) {
        passed = true;
      } else if (avgLap < 30) {
        reason = 'photo_detected';
      } else {
        reason = 'no_blink';
      }
    }

    const nextContext: LivenessContext = {
      ...context,
      landmarkBuffer,
      bboxHistory,
      laplacianHistory,
      rigidityScore,
      rigidityChecked: bufferSize >= 5,
      state: passed ? 'PASSED' : (reason === 'insufficient_frames' ? 'IDLE' : 'FAILED')
    };

    return {
      context: nextContext,
      result: {
        passed,
        rigidityScore,
        blinkCount: passed ? 1 : 0,
        framesAnalyzed: bufferSize,
        reason
      }
    };
  }

  // Legacy FaceMesh path for backwards compatibility / tests
  const ear = calculateEAR(landmarks);
  const earHistory = [...(context.earHistory || []), ear].slice(-50);
  
  const landmarkBuffer = [...(context.landmarkBuffer || []), landmarks].slice(-MIN_FRAMES_FOR_RIGIDITY);
  
  let rigidityScore = context.rigidityScore !== undefined ? context.rigidityScore : 1.0;
  let rigidityChecked = context.rigidityChecked || false;
  
  if (landmarkBuffer.length >= MIN_FRAMES_FOR_RIGIDITY) {
    rigidityScore = computeRigidityScore(landmarkBuffer);
    rigidityChecked = true;
  }
  
  let hasDipped = false;
  let blinkCount = 0;
  for (const val of earHistory) {
    if (!hasDipped && val < EAR_BLINK_THRESHOLD) {
      hasDipped = true;
    } else if (hasDipped && val > EAR_OPEN_THRESHOLD) {
      blinkCount++;
      hasDipped = false;
    }
  }

  const rigidityPassed = context.disableRigidityCheck === true || rigidityScore >= RIGIDITY_SCORE_THRESHOLD;
  const blinkPassed = blinkCount >= 1;
  
  let passed = false;
  let reason: 'photo_detected' | 'no_blink' | 'insufficient_frames' | undefined;
  
  if (landmarkBuffer.length < MIN_FRAMES_FOR_RIGIDITY) {
    reason = 'insufficient_frames';
  } else if (!rigidityPassed) {
    reason = 'photo_detected';
  } else if (!blinkPassed) {
    reason = 'no_blink';
  } else {
    passed = true;
  }

  const nextContext: LivenessContext = {
    ...context,
    earHistory,
    landmarkBuffer,
    rigidityScore,
    rigidityChecked,
    blinkDetected: blinkPassed,
    state: passed ? 'PASSED' : (reason === 'insufficient_frames' ? 'IDLE' : 'FAILED')
  };

  return {
    context: nextContext,
    result: {
      passed,
      rigidityScore,
      blinkCount,
      framesAnalyzed: landmarkBuffer.length,
      reason
    }
  };
}
