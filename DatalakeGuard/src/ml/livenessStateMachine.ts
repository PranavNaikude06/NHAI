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
