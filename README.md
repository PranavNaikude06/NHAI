# 🛡️ DatalakeGuard — Offline Face Recognition AI/ML Engine

**High-performance, offline-first facial recognition and anti-spoofing AI model for React Native.**

| Metric | Value |
|--------|-------|
| Total Model Size | **~7.9 MB** |
| 20 MB Limit | ✅ Well under |
| Inference Speed | < 150ms (native) |
| Platform | Android (Kotlin) + iOS (Swift) |
| Framework | React Native compatible |
| Compliance | DPDP Act 2023 |

---

## 📦 What's in the SDK

```
models/
├── blazeface.tflite          # 229 KB  — Face detection (6 keypoints)
├── mobilefacenet.tflite      # 5.2 MB  — Face recognition (128-dim embeddings)
└── facemesh.tflite            # 2.4 MB  — 468-landmark mesh (liveness + EAR)

android/com/datalakeguard/     # Kotlin native modules
├── TFLiteInferenceModule.kt   # Core inference pipeline
├── TFLitePackage.kt           # React Native package registration
├── MediaPipeLandmarkModule.kt # FaceMesh 468-landmark module
├── VectorSearchEngine.kt      # Approximate nearest neighbor search
└── VectorSearchModule.kt      # RN bridge for vector search

ios/                           # iOS Swift native modules
├── TFLiteInferenceModule.swift
├── TFLiteInferenceModule.m    # Obj-C bridge
└── MediaPipeLandmarkModule.swift

ts-sdk/                        # TypeScript ML pipeline
├── ml/
│   ├── cosine.ts              # Cosine similarity
│   ├── enrollment.ts          # Multi-prototype enrollment
│   ├── livenessStateMachine.ts # Dual-layer liveness engine
│   ├── preprocessor.ts        # CLAHE preprocessing config
│   ├── recognize.ts           # Full recognition pipeline
│   └── types.ts               # TypeScript interfaces
└── native/
    ├── TFLiteBridge.ts        # RN bridge to TFLite native
    ├── MediaPipeBridge.ts     # RN bridge to FaceMesh native
    └── VectorSearchBridge.ts  # RN bridge to vector search

tests/                         # Unit tests
├── liveness.test.ts           # Liveness detection tests
└── security.test.ts           # Security & anti-spoofing tests

test-harness/                  # Python test utility
├── test_model.py              # CLI tool to test models on real faces
├── requirements.txt           # Python dependencies
├── sample_faces/              # Place test images here
└── output/                    # Annotated results saved here
```

---

## 🏗️ Architecture

```
Camera Frame / JPEG File
       │
       ▼
  BlazeFace (229 KB)
  ├── Bounding Box
  ├── 6 Facial Keypoints ──► Passive Liveness (rigidity, micro-movement)
  │
  ▼
  Face Crop (112×112)
       │
       ├──► MobileFaceNet (5.2 MB) ──► 128-dim Embedding ──► Cosine Match
       │
       └──► FaceMesh (2.4 MB) ──► 468 Landmarks ──► EAR Blink Detection
                                                  ──► Head Pose Estimation
```

### Dual-Layer Liveness Detection
1. **Active**: Head turn challenges, blink detection via Eye Aspect Ratio (FaceMesh 468 landmarks)
2. **Passive**: Laplacian texture variance (detects printed photos), rigidity score (detects screen replays)

### Accuracy Features
- **Multi-Prototype Bank**: Up to 5 diverse pose/lighting prototypes per user
- **Template Aging**: Slow moving average updates (α = 0.05) for high-confidence matches
- **Cohort EER Calibration**: Dynamic threshold optimization as users are enrolled
- **Negative Enrollment Check**: Prevents duplicate identity registration

---

## 🔌 React Native Integration

### 1. Copy models to your project
```bash
cp models/*.tflite your-app/android/app/src/main/assets/models/
```

### 2. Add Kotlin native modules
Copy `android/com/datalakeguard/*.kt` into your Android source directory.

### 3. Add TypeScript SDK
Copy `ts-sdk/` into your project's `src/` directory.

### 4. Use in your React Native code
```typescript
import { TFLiteBridge } from './native/TFLiteBridge';

// Run full pipeline on a captured frame
const result = await TFLiteBridge.runFullPipelineFromFile(imagePath);
// result = { bbox, keypoints, embedding, livenessScore, confidence }
```

---

## 🧪 Testing with Real Faces

### Setup
```bash
cd test-harness
pip install -r requirements.txt
```

### Test a single image
```bash
python test_model.py --image path/to/face.jpg
```

### Compare two faces
```bash
python test_model.py --compare person1.jpg person2.jpg
```

### Batch test a folder
```bash
python test_model.py --dir ./sample_faces/
```

### Live webcam test
```bash
python test_model.py --camera
```

---

## 📊 Model Specifications

| Model | Size | Input | Output | Speed |
|-------|------|-------|--------|-------|
| BlazeFace | 229 KB | 128×128 RGB | BBox + 6 keypoints | ~15ms |
| MobileFaceNet | 5.2 MB | 112×112 RGB | 128-dim embedding | ~45ms |
| FaceMesh | 2.4 MB | 192×192 RGB | 468 landmarks (x,y,z) | ~60ms |

---

## 📄 License

See [MODEL_CARD.md](MODEL_CARD.md) for full technical documentation, security compliance details, and performance benchmarks.
