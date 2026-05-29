// Interfaces for ML modules and contracts

export interface RecognitionResult {
  identity: string | null;   // user_id, or null if unknown
  name: string | null;
  confidence: number;        // 0–1
  livenessPass: boolean;
}

export interface LivenessUpdate {
  state: 'IDLE' | 'TURN_LEFT' | 'TURN_RIGHT' | 'PASSED' | 'FAILED';
  message: string;           // Human-readable instruction for UI
  earValue: number;
  rigidityScore?: number;
  spoofType?: 'photo' | 'none';
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface Embedding {
  userId: string;
  name: string;
  vector: number[];  // float[192]
}
