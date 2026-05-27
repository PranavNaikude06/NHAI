# DatalakeGuard: Offline Facial Recognition & Liveness Detection for Datalake 3.0

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React Native](https://img.shields.io/badge/React%20Native-0.73%2B-61dafb.svg)](https://reactnative.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003b57.svg)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**DatalakeGuard** is an offline-first, high-security facial recognition and liveness detection solution designed for field worker authentication. The system runs fully offline on mid-range mobile devices, storing encrypted facial embeddings and access logs in a local SQLite database, and synchronizing logs securely to AWS when network connectivity is restored.

---

## 🏗️ System Architecture

DatalakeGuard utilizes a decoupled architecture combining a React Native frontend, custom Native Modules (Kotlin for Android, Swift for iOS) for TensorFlow Lite and MediaPipe inference, and an AWS Serverless backend for log synchronization.

```
┌─────────────────────────────────────────────────┐
│                React Native App                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Camera  │  │Liveness  │  │ Auth Result   │  │
│  │  Screen  │→ │  Engine  │→ │   Screen      │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│       │              │                           │
│       ↓              ↓                           │
│  ┌─────────────────────────────────────────┐    │
│  │         Native Module Bridge             │    │
│  │  (TFLiteInferenceModule + MediaPipe)     │    │
│  └─────────────────────────────────────────┘    │
│       │                                          │
│       ↓                                          │
│  ┌──────────────────────────────────────────┐   │
│  │              SQLite Database              │   │
│  │   embeddings table │ auth_logs table      │   │
│  └──────────────────────────────────────────┘   │
│       │                                          │
│       ↓ (on connectivity)                        │
│  ┌──────────────────────────────────────────┐   │
│  │           Sync Engine                     │   │
│  │   NetInfo → API Gateway → S3 → Purge      │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 💡 Key Features & Innovation

### 1. Offline Facial Recognition Pipeline (TFLite)
*   **Face Detection**: Powered by **BlazeFace** (TFLite, ~400KB), executing at 30+ FPS directly on the mobile frame processor.
*   **Face Recognition**: Powered by **MobileFaceNet** (TFLite INT8 quantized, ~1.2MB), generating a compact 128-dimensional embedding in <1 second.
*   **Matching Metric**: Cosine Similarity calculation with a tunable threshold (default: `0.6`).
    $$\text{Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$
*   **Privacy-First**: No raw face images are stored. All captured faces are converted into embeddings, encrypted on-device, and the original frames are purged immediately.

### 2. Dual-Layer Liveness Detection (Anti-Spoofing)
To prevent presentation attacks (printed photos, phone screen video replays) without the heavy overhead of complex neural networks, DatalakeGuard uses a custom two-layer verification engine:
*   **Layer 1 (Active challenge)**: User must complete head movement challenges ("Turn head Left", "Turn head Right"). Tracked in real-time via the nose tip X-coordinate from **MediaPipe Face Mesh**.
*   **Layer 2 (Passive challenge)**: Continuous **Eye Aspect Ratio (EAR)** calculation to detect natural eye blinking. 
    $$\text{EAR} = \frac{\|p_2 - p_6\| + \|p_3 - p_5\|}{2 \cdot \|p_1 - p_4\|}$$
    If EAR does not drop below the blink threshold during the test, the attempt is flagged as a static photo spoof and rejected.

### 3. Encrypted On-Device Storage (SQLite)
*   All data is stored inside a local SQLite database (`datalake_guard.db`).
*   Embeddings are encrypted with **AES-256** using keys managed via Android Keystore / iOS Secure Enclave (`react-native-aes-crypto` + `react-native-keychain`).

---

## 📂 Repository Structure

```
.
├── DatalakeGuard/                  # Main React Native Application
│   ├── android/                    # Android Project with Kotlin Native Modules
│   │   └── app/src/main/java/.../  # MediaPipe & TFLite Bridges
│   ├── ios/                        # iOS Project with Swift/Obj-C Bridges
│   ├── src/
│   │   ├── constants/              # Global thresholds, config & API endpoints
│   │   ├── db/                     # SQLite database init, schemas, migrations
│   │   ├── ml/                     # Liveness state machine, cosine similarity
│   │   ├── native/                 # JS interface to Native Modules
│   │   └── services/               # Encryption, Sync, and Auth Log services
│   ├── __tests__/                  # Unit and Integration test suite
│   ├── App.tsx                     # App entry point & initialization
│   ├── jest.setup.js               # Jest mocks for native bridges
│   └── tsconfig.json               # TypeScript configuration (Jest + Node types)
├── person c/                       # Backend architecture blueprint & models metadata
├── download_models.py              # Script to pull models from CDN
└── inspect_models.py               # Model analysis utility
```

---

## 🗄️ SQLite Database Schema

Local data is structured into two core tables:

### 1. `embeddings` (Enrolled Users)
```sql
CREATE TABLE embeddings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT,
  embedding   BLOB NOT NULL,  -- AES-256 encrypted float[128] array
  enrolled_at INTEGER NOT NULL
);
```

### 2. `auth_logs` (Authentication History)
```sql
CREATE TABLE auth_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT,           -- NULL if unrecognized
  timestamp     INTEGER NOT NULL,
  confidence    REAL,           -- Cosine similarity score
  liveness_pass INTEGER NOT NULL, -- 0 or 1
  result        TEXT NOT NULL,  -- 'authenticated' | 'unknown' | 'spoof_rejected'
  location_lat  REAL,
  location_lng  REAL,
  synced        INTEGER DEFAULT 0
);
```

---

## 🔄 Cloud Sync & Purge Mechanics

1.  **Connectivity Detection**: The app monitors connection states via `react-native-netinfo`.
2.  **Batched Payload**: When a connection is detected, pending logs with `synced = 0` are batched into a JSON payload:
    ```json
    {
      "device_id": "device-uuid",
      "sync_timestamp": 1748700000,
      "auth_logs": [
        {
          "log_id": 42,
          "user_id": "EMP-001",
          "timestamp": 1748699000,
          "confidence": 0.87,
          "liveness_pass": true,
          "result": "authenticated",
          "location": { "lat": 19.076, "lng": 72.877 }
        }
      ]
    }
    ```
3.  **Transmission**: Payload is POSTed to the AWS API Gateway (Hardened with API Key header).
4.  **Lambda Processing**: An AWS Lambda handler processes the batch, writes the logs directly to an **S3 bucket**, and returns a successful response code.
5.  **Local Purge**: On a successful 200 HTTP response, the app marks the logs as synced and purges older logs to prevent local storage growth (DoS prevention).

---

## ⚙️ Local Development & Setup

### Prerequisites
*   Node.js >= 22.11.0
*   Android SDK & Android Studio (for Android build)
*   Xcode & CocoaPods (for iOS build)

### Step 1: Install Dependencies
From the `DatalakeGuard` directory:
```bash
cd DatalakeGuard
npm install
```
*Note: A post-install script automatically runs `patch-package` to apply compatibility fixes to `react-native-sqlite-storage`.*

### Step 2: Download Model Assets
Run the model download script to obtain the `.tflite` model files and place them in the assets directory:
```bash
python download_models.py
```
Ensure they are present under:
*   **Android**: `DatalakeGuard/android/app/src/main/assets/models/`
*   **iOS**: Managed through the Xcode Bundle assets.

### Step 3: Run Verification Checks
Run the complete compilation, static analysis, and test suites:
```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Run ESLint check
npm run lint

# Run Jest unit/integration tests
npm test
```

### Step 4: Run the App
```bash
# For Android
npm run android

# For iOS
cd ios && pod install && cd ..
npm run ios
```

---

## 📊 Technical Benchmarks (Target Performance)

| Metric | Target / Result | Details |
|---|---|---|
| **Recognition Latency** | < 1000ms | Average execution from camera frame to classification. |
| **Liveness Check Time** | < 3000ms | Dynamic challenge completion window. |
| **Accuracy (Enrolled)** | > 95% | On-device recognition accuracy. |
| **False Acceptance Rate** | < 10% | Maximum target for spoofing bypass rate. |
| **Total ML Footprint** | ~5.6 MB | Combined weight of BlazeFace, FaceMesh, & MobileFaceNet. |
| **Storage Weight / User**| ~512 Bytes | Raw storage overhead per worker embedding. |

---

## 🔒 Security Compliance
*   **Zero PII Leakage**: Raw images are processed in-memory and discarded. Only anonymized `user_id` and timestamps sync to the cloud.
*   **Cryptographic Verification**: Sync payloads are signed locally via HMAC-SHA256 with keys stored in the hardware keystore.
*   **API Security**: S3 endpoints are masked behind API Gateway with rate limits and request validation schemas configured in the AWS Lambda layers.
