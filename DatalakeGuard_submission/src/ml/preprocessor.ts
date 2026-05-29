// Preprocessing configuration for DatalakeGuard facial recognition pipeline

export interface PreprocessConfig {
  enableCLAHE: boolean;      // Toggle CLAHE normalization
  clipLimit: number;          // CLAHE aggressiveness (default: 2.0)
  tileSize: number;           // Grid tile size (default: 8)
}

export const DEFAULT_PREPROCESS: PreprocessConfig = {
  enableCLAHE: true,
  clipLimit: 2.0,
  tileSize: 8,
};
