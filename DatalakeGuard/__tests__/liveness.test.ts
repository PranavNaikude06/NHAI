import {
  calculateEAR,
  createLivenessContext,
  updateLivenessState,
  evaluatePassiveLiveness
} from '../src/ml/livenessStateMachine';
import { BoundingBox } from '../src/ml/types';

// Helper to create mock landmarks with customized eye height and nose position
function createMockLandmarks(eyeHeight: number, noseX: number): { x: number; y: number; z: number }[] {
  const landmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0.0 }));
  
  // Nose tip is index 1
  landmarks[1] = { x: noseX, y: 0.5, z: 0.0 };

  // Left eye indices: 33 (horizontal left), 160 (upper-inner), 158 (upper-outer), 133 (horizontal right), 153 (lower-outer), 144 (lower-inner)
  // Let's set the horizontal distance between 33 and 133 to 1.0 (so p1-p4 distance is 1.0)
  landmarks[33] = { x: 0.1, y: 0.5, z: 0.0 };
  landmarks[133] = { x: 1.1, y: 0.5, z: 0.0 }; // horizontal distance = 1.0

  // Vertical: p2-p6 and p3-p5. We set y coordinates to control eyeHeight (vertical distance)
  // For open eye, we want vertical height to be e.g. 0.3.
  landmarks[160] = { x: 0.4, y: 0.5 - eyeHeight / 2, z: 0.0 };
  landmarks[144] = { x: 0.4, y: 0.5 + eyeHeight / 2, z: 0.0 }; // vertical height = eyeHeight
  landmarks[158] = { x: 0.8, y: 0.5 - eyeHeight / 2, z: 0.0 };
  landmarks[153] = { x: 0.8, y: 0.5 + eyeHeight / 2, z: 0.0 }; // vertical height = eyeHeight

  // Right eye indices: 362, 385, 387, 263, 373, 380
  landmarks[362] = { x: 2.1, y: 0.5, z: 0.0 };
  landmarks[263] = { x: 3.1, y: 0.5, z: 0.0 }; // horizontal distance = 1.0
  landmarks[385] = { x: 2.4, y: 0.5 - eyeHeight / 2, z: 0.0 };
  landmarks[380] = { x: 2.4, y: 0.5 + eyeHeight / 2, z: 0.0 };
  landmarks[387] = { x: 2.8, y: 0.5 - eyeHeight / 2, z: 0.0 };
  landmarks[373] = { x: 2.8, y: 0.5 + eyeHeight / 2, z: 0.0 };

  return landmarks;
}

const mockBbox: BoundingBox = {
  x: 0.0,
  y: 0.0,
  width: 1.0,
  height: 1.0,
  confidence: 1.0
};

describe('Liveness State Machine Tests', () => {
  
  test('EAR calculations return expected aspect ratios', () => {
    // With vertical eye height = 0.3 and horizontal width = 1.0:
    // Vertical distance 1 = 0.3, Vertical distance 2 = 0.3.
    // EAR = (0.3 + 0.3) / (2 * 1.0) = 0.6 / 2.0 = 0.3
    const openEyeLandmarks = createMockLandmarks(0.3, 0.5);
    const earOpen = calculateEAR(openEyeLandmarks);
    expect(earOpen).toBeCloseTo(0.3);

    // With vertical eye height = 0.15 and horizontal width = 1.0:
    // EAR = (0.15 + 0.15) / 2.0 = 0.15
    const closedEyeLandmarks = createMockLandmarks(0.15, 0.5);
    const earClosed = calculateEAR(closedEyeLandmarks);
    expect(earClosed).toBeCloseTo(0.15);
  });

  test('Liveness updates transition correctly from TURN_LEFT to TURN_RIGHT to PASSED', () => {
    let context = createLivenessContext(false, true);
    
    // 1. Initial State -> should begin with TURN_LEFT instruction
    let landmarks = createMockLandmarks(0.3, 0.5); // Center nose
    let step = updateLivenessState(landmarks, mockBbox, context);
    context = step.context;
    expect(context.state).toBe('TURN_LEFT');
    expect(step.result.message).toContain('turn your head LEFT');

    // 2. Feed left nose position to trigger transition to TURN_RIGHT
    landmarks = createMockLandmarks(0.3, 0.3); // Nose X < 0.4
    // We need CONSECUTIVE_FRAMES_REQUIRED (3) frames to trigger transition
    for (let i = 0; i < 3; i++) {
      step = updateLivenessState(landmarks, mockBbox, context);
      context = step.context;
    }
    expect(context.state).toBe('TURN_RIGHT');
    expect(step.result.message).toContain('turn your head RIGHT');

    // 3. Blink: eyes dip to 0.15 (below 0.25)
    landmarks = createMockLandmarks(0.15, 0.5);
    step = updateLivenessState(landmarks, mockBbox, context);
    context = step.context;
    expect(context.hasDipped).toBe(true);
    expect(context.blinkDetected).toBe(false);

    // 4. Blink completion: eyes open to 0.3 (above 0.28)
    landmarks = createMockLandmarks(0.3, 0.5);
    step = updateLivenessState(landmarks, mockBbox, context);
    context = step.context;
    expect(context.blinkDetected).toBe(true);

    // 5. Feed right nose position to trigger success
    landmarks = createMockLandmarks(0.3, 0.7); // Nose X > 0.6
    // We need 3 frames to transition to PASSED
    for (let i = 0; i < 3; i++) {
      step = updateLivenessState(landmarks, mockBbox, context);
      context = step.context;
    }
    expect(context.state).toBe('PASSED');
    expect(step.result.message).toContain('PASSED');
  });

  test('Liveness fails if no blink is detected', () => {
    let context = createLivenessContext(false, true);
    
    // TURN_LEFT
    let landmarks = createMockLandmarks(0.3, 0.3);
    for (let i = 0; i < 3; i++) {
      context = updateLivenessState(landmarks, mockBbox, context).context;
    }
    expect(context.state).toBe('TURN_RIGHT');

    // Keep eyes open (no dip/blink), turn head right
    landmarks = createMockLandmarks(0.3, 0.7);
    
    // Keep feeding frames to reach close to timeout
    // The state machine allows some delay. Let's mock a late check that hits timeout or fails due to lack of blink
    // Let's force a timeout by mocking a time difference
    context.startTimestamp = Date.now() - 6000; // Force timeout (>5000ms)
    
    const step = updateLivenessState(landmarks, mockBbox, context);
    expect(step.context.state).toBe('FAILED');
    expect(step.result.message).toContain('timed out');
  });

  test('Liveness fails due to rigidity if static frames are presented', () => {
    let context = createLivenessContext(false, false); // Rigidity check enabled
    
    // Feed 5 identical frames of landmarks
    let step;
    const landmarks = createMockLandmarks(0.3, 0.5);
    for (let i = 0; i < 5; i++) {
      step = updateLivenessState(landmarks, mockBbox, context);
      context = step.context;
    }
    expect(context.state).toBe('FAILED');
    expect(step?.result.message).toContain('Flat surface/photo detected');
    expect(step?.result.spoofType).toBe('photo');
  });

  test('Liveness tolerates natural micro-motion variance', () => {
    let context = createLivenessContext(false, false); // Rigidity check enabled
    
    // Feed 5 frames with simulated micro-motions (noise) on key landmarks
    let step;
    for (let i = 0; i < 5; i++) {
      const landmarks = createMockLandmarks(0.3, 0.5);
      // Add artificial jitter (> 0.003) to key landmarks
      const RIGIDITY_KEY_INDICES = [1, 152, 234, 454, 10, 172, 397, 127, 356, 0];
      for (const idx of RIGIDITY_KEY_INDICES) {
        landmarks[idx].x += (Math.sin(i + idx) * 0.01);
        landmarks[idx].y += (Math.cos(i + idx) * 0.01);
      }
      step = updateLivenessState(landmarks, mockBbox, context);
      context = step.context;
    }
    
    // It should not fail due to rigidity, state should stay TURN_LEFT (normal flow)
    expect(context.state).not.toBe('FAILED');
    expect(step?.result.spoofType).toBe('none');
  });

  describe('evaluatePassiveLiveness Tests', () => {
    test('should reject static frames as a photo spoof', () => {
      let context = createLivenessContext(false, false);
      const staticLandmarks = createMockLandmarks(0.3, 0.5);
      
      let step;
      for (let i = 0; i < 5; i++) {
        step = evaluatePassiveLiveness(staticLandmarks, context);
        context = step.context;
      }
      
      expect(step?.result.passed).toBe(false);
      expect(step?.result.reason).toBe('photo_detected');
      expect(context.state).toBe('FAILED');
    });

    test('should return insufficient_frames if buffer is too small', () => {
      let context = createLivenessContext(false, false);
      const landmarks = createMockLandmarks(0.3, 0.5);
      
      const step = evaluatePassiveLiveness(landmarks, context);
      expect(step.result.passed).toBe(false);
      expect(step.result.reason).toBe('insufficient_frames');
    });

    test('should reject if normal movement is present but no blink is detected', () => {
      let context = createLivenessContext(false, false);
      
      let step;
      for (let i = 0; i < 5; i++) {
        const landmarks = createMockLandmarks(0.3, 0.5);
        // Add micro-motion to key landmarks
        const RIGIDITY_KEY_INDICES = [1, 152, 234, 454, 10, 172, 397, 127, 356, 0];
        for (const idx of RIGIDITY_KEY_INDICES) {
          landmarks[idx].x += (Math.sin(i + idx) * 0.01);
          landmarks[idx].y += (Math.cos(i + idx) * 0.01);
        }
        step = evaluatePassiveLiveness(landmarks, context);
        context = step.context;
      }
      
      expect(step?.result.passed).toBe(false);
      expect(step?.result.reason).toBe('no_blink');
      expect(context.state).toBe('FAILED');
    });

    test('should pass if normal movement and at least one blink are detected', () => {
      let context = createLivenessContext(false, false);
      
      let step;
      // Feed 5 frames, simulating open-close-open EAR pattern for a blink, and micro-motions
      const eyeHeights = [0.3, 0.15, 0.3, 0.3, 0.3];
      for (let i = 0; i < 5; i++) {
        const landmarks = createMockLandmarks(eyeHeights[i], 0.5);
        // Add micro-motion to key landmarks
        const RIGIDITY_KEY_INDICES = [1, 152, 234, 454, 10, 172, 397, 127, 356, 0];
        for (const idx of RIGIDITY_KEY_INDICES) {
          landmarks[idx].x += (Math.sin(i + idx) * 0.01);
          landmarks[idx].y += (Math.cos(i + idx) * 0.01);
        }
        step = evaluatePassiveLiveness(landmarks, context);
        context = step.context;
      }
      
      expect(step?.result.passed).toBe(true);
      expect(step?.result.reason).toBeUndefined();
      expect(context.state).toBe('PASSED');
    });
  });
});
