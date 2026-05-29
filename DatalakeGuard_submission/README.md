# DatalakeGuard

React Native mobile app for offline face enrollment, liveness-gated recognition, encrypted local storage, and batched cloud sync.

## Local Setup

Install dependencies from the app root:

```sh
npm install
```

`postinstall` runs `patch-package` to apply a Gradle compatibility fix for `react-native-sqlite-storage`.

Run checks:

```sh
npx tsc --noEmit
npm test -- --runInBand
npm run lint
```

Build Android:

```sh
cd android
.\gradlew.bat assembleDebug --console plain
```

For iOS, install pods after dependency changes:

```sh
cd ios
bundle exec pod install
```

## Person C Backend Integration

The backend modules are integrated directly into the main app:

- `src/db`: SQLite schema, initialization, and migration entry point.
- `src/services`: encrypted embeddings, auth logs, encryption, and sync services.
- `src/sync`: background sync wrapper.
- `src/constants/config.ts`: sync endpoint, API key placeholder, thresholds, and DB constants.
- `aws`: Lambda sync handler and AWS setup notes.

App startup in `App.tsx` now initializes SQLite, initializes the encryption key, and starts the connectivity listener:

```ts
await initDatabase();
await EncryptionService.initialize();
SyncService.startConnectivityListener('device-001');
```

## Datalake 3.0 Integration Guide

1. Enrollment screens call `EmbeddingService.enrollWorker(name, role, workerId, embedding)` after Person A generates the averaged face embedding.
2. Recognition calls `recognize(frameData, width, height)`; it now defaults to Person C's real `EmbeddingService` for enrolled embeddings.
3. Result screens call `AuthLogService.logAuthAttempt(...)`; `SyncService` batches unsynced logs when connectivity is available, and status screens can call `SyncService.getStatus()`.

## AWS Sync Setup

Offline app behavior works without AWS. For a sync demo, deploy the Lambda/API Gateway/S3 stack described in `aws/infrastructure.md`, then replace these placeholders in `src/constants/config.ts`:

```ts
AWS_SYNC_ENDPOINT: 'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/sync',
AWS_API_KEY: 'YOUR_KEY_HERE',
```

The Lambda handler is in `aws/lambda/sync-handler.js` and expects batched auth logs from `SyncService`.
