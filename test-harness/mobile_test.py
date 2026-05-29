#!/usr/bin/env python3
"""
DatalakeGuard Mobile Camera Test Server
========================================
Serves a mobile-friendly web UI that accesses your phone's camera,
sends frames to this server for TFLite inference, and displays
annotated results in real-time.

Usage:
  pip install -r requirements.txt
  python mobile_test.py

Then open http://<YOUR_PC_IP>:5000 on your phone (same WiFi network).

Requirements (additional):
  pip install flask
"""

import base64
import io
import json
import os
import socket
import time
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, render_template_string, request, jsonify
from PIL import Image

# Import model classes from test_model.py
from test_model import (
    BlazeFaceDetector,
    MobileFaceNetEmbedder,
    FaceMeshLandmarker,
    compute_laplacian_variance,
    cosine_similarity,
    align_face_2d,
    DETECTION_CONFIDENCE_THRESHOLD,
    COSINE_MATCH_THRESHOLD,
    LIVENESS_LAPLACIAN_THRESHOLD,
)

app = Flask(__name__)

# Global model instances (loaded once at startup)
detector = None
embedder = None
landmarker = None

# Store enrolled embeddings for live matching
enrolled_embeddings = {}

# ─── HTML Template ───────────────────────────────────────────────────────────
MOBILE_UI = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>DatalakeGuard — Mobile Test</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0a0a0f;
            --bg-card: #12121a;
            --bg-card-hover: #1a1a2e;
            --accent: #6c63ff;
            --accent-glow: rgba(108, 99, 255, 0.3);
            --success: #00e676;
            --danger: #ff5252;
            --warning: #ffc107;
            --text-primary: #e8e8f0;
            --text-secondary: #8888a0;
            --border: rgba(255,255,255,0.06);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
        }

        .header {
            padding: 16px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid var(--border);
            background: linear-gradient(180deg, rgba(108,99,255,0.08) 0%, transparent 100%);
        }

        .header .shield { font-size: 24px; }

        .header h1 {
            font-size: 18px;
            font-weight: 600;
            background: linear-gradient(135deg, #6c63ff, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .header .status {
            margin-left: auto;
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 500;
        }

        .status-ready { background: rgba(0,230,118,0.15); color: var(--success); }
        .status-processing { background: rgba(108,99,255,0.15); color: var(--accent); }
        .status-error { background: rgba(255,82,82,0.15); color: var(--danger); }

        .camera-container {
            position: relative;
            width: 100%;
            max-width: 500px;
            margin: 16px auto;
            border-radius: 16px;
            overflow: hidden;
            border: 2px solid var(--border);
            background: #000;
        }

        #video {
            width: 100%;
            display: block;
            transform: scaleX(-1);
        }

        #canvas { display: none; }

        .face-oval {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -55%);
            width: 60%;
            height: 45%;
            border: 2px dashed rgba(108,99,255,0.5);
            border-radius: 50%;
            pointer-events: none;
            transition: border-color 0.3s;
        }

        .face-oval.detected {
            border-color: var(--success);
            box-shadow: 0 0 20px rgba(0,230,118,0.2);
        }

        .face-oval.spoof {
            border-color: var(--danger);
            box-shadow: 0 0 20px rgba(255,82,82,0.2);
        }

        .controls {
            padding: 16px 20px;
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 12px;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn:active { transform: scale(0.96); }

        .btn-primary {
            background: linear-gradient(135deg, #6c63ff, #5a52d5);
            color: white;
            box-shadow: 0 4px 15px var(--accent-glow);
        }

        .btn-success {
            background: linear-gradient(135deg, #00e676, #00c853);
            color: #0a0a0f;
        }

        .btn-danger {
            background: linear-gradient(135deg, #ff5252, #d32f2f);
            color: white;
        }

        .btn-outline {
            background: transparent;
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .results-panel {
            margin: 0 16px 16px;
            background: var(--bg-card);
            border-radius: 16px;
            border: 1px solid var(--border);
            overflow: hidden;
        }

        .results-header {
            padding: 14px 16px;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border);
        }

        .metric-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1px;
            background: var(--border);
        }

        .metric {
            background: var(--bg-card);
            padding: 14px 16px;
        }

        .metric-label {
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
        }

        .metric-value {
            font-size: 20px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }

        .metric-value.live { color: var(--success); }
        .metric-value.spoof { color: var(--danger); }
        .metric-value.match { color: var(--success); }
        .metric-value.no-match { color: var(--warning); }

        .metric-sub {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .log-panel {
            margin: 0 16px 16px;
            background: var(--bg-card);
            border-radius: 16px;
            border: 1px solid var(--border);
            max-height: 200px;
            overflow-y: auto;
        }

        .log-entry {
            padding: 10px 16px;
            font-size: 12px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            border-bottom: 1px solid var(--border);
            color: var(--text-secondary);
        }

        .log-entry:last-child { border-bottom: none; }
        .log-entry .time { color: var(--accent); margin-right: 8px; }
        .log-entry.success { color: var(--success); }
        .log-entry.error { color: var(--danger); }

        .enrolled-list {
            margin: 0 16px 16px;
            background: var(--bg-card);
            border-radius: 16px;
            border: 1px solid var(--border);
        }

        .enrolled-item {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border);
        }

        .enrolled-item:last-child { border-bottom: none; }

        .enrolled-name {
            font-weight: 500;
            font-size: 14px;
        }

        .enrolled-badge {
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 6px;
            background: rgba(108,99,255,0.15);
            color: var(--accent);
        }

        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            padding: 14px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            transition: transform 0.3s ease;
            max-width: 90vw;
            text-align: center;
        }

        .toast.show { transform: translateX(-50%) translateY(0); }
        .toast.success { background: var(--success); color: #0a0a0f; }
        .toast.error { background: var(--danger); color: white; }

        .mode-tabs {
            display: flex;
            margin: 0 16px;
            background: var(--bg-card);
            border-radius: 12px;
            padding: 4px;
            border: 1px solid var(--border);
        }

        .mode-tab {
            flex: 1;
            padding: 10px;
            text-align: center;
            font-size: 13px;
            font-weight: 500;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            color: var(--text-secondary);
        }

        .mode-tab.active {
            background: var(--accent);
            color: white;
        }

        .enroll-input {
            width: 100%;
            padding: 12px 16px;
            background: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            margin-bottom: 12px;
        }

        .enroll-input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .section { padding: 12px 16px; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .processing { animation: pulse 1s infinite; }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <span class="shield">🛡️</span>
        <h1>DatalakeGuard Test</h1>
        <span id="statusBadge" class="status status-ready">Ready</span>
    </div>

    <div class="camera-container">
        <video id="video" autoplay playsinline muted></video>
        <canvas id="canvas"></canvas>
        <div id="faceOval" class="face-oval"></div>
    </div>

    <div class="mode-tabs">
        <div class="mode-tab active" onclick="setMode('detect')" id="tabDetect">🔍 Detect</div>
        <div class="mode-tab" onclick="setMode('enroll')" id="tabEnroll">📝 Enroll</div>
        <div class="mode-tab" onclick="setMode('recognize')" id="tabRecognize">✅ Recognize</div>
    </div>

    <div class="controls">
        <button class="btn btn-primary" id="btnCapture" onclick="captureAndProcess()">
            📸 Capture & Analyze
        </button>
        <button class="btn btn-outline" id="btnAuto" onclick="toggleAutoCapture()">
            ⚡ Auto
        </button>
        <button class="btn btn-outline" onclick="switchCamera()">
            🔄 Flip
        </button>
    </div>

    <!-- Enroll section (hidden by default) -->
    <div id="enrollSection" class="section" style="display:none;">
        <input type="text" class="enroll-input" id="enrollName" placeholder="Enter person's name...">
        <div id="enrollGuidance" style="font-size: 12px; color: var(--text-secondary); background: rgba(108,99,255,0.06); padding: 12px; border-radius: 10px; border: 1px solid var(--border); line-height: 1.5; margin-top: 8px;">
            💡 <strong>Multi-Angle Calibration:</strong> For maximum verification accuracy (&gt;95%), capture 3 different shots under the same name:
            <ul style="margin-left: 20px; margin-top: 6px;">
                <li>📸 <strong>Shot 1:</strong> Look straight at the camera</li>
                <li>📸 <strong>Shot 2:</strong> Turn face slightly left</li>
                <li>📸 <strong>Shot 3:</strong> Turn face slightly right</li>
            </ul>
            The system automatically registers these reference prototypes in its bank.
        </div>
    </div>

    <!-- Results Panel -->
    <div class="results-panel" id="resultsPanel" style="display:none;">
        <div class="results-header">Detection Results</div>
        <div class="metric-grid">
            <div class="metric">
                <div class="metric-label">Confidence</div>
                <div class="metric-value" id="metricConfidence">—</div>
            </div>
            <div class="metric">
                <div class="metric-label">Liveness</div>
                <div class="metric-value" id="metricLiveness">—</div>
                <div class="metric-sub" id="metricLaplacian"></div>
            </div>
            <div class="metric">
                <div class="metric-label">EAR (Blink)</div>
                <div class="metric-value" id="metricEAR">—</div>
                <div class="metric-sub" id="metricBlink"></div>
            </div>
            <div class="metric">
                <div class="metric-label">Inference</div>
                <div class="metric-value" id="metricTime">—</div>
                <div class="metric-sub">ms total</div>
            </div>
        </div>
        <!-- Match result (shown in recognize mode) -->
        <div id="matchResult" style="display:none; padding: 16px; text-align: center;">
            <div class="metric-label">MATCH RESULT</div>
            <div class="metric-value" id="metricMatch" style="font-size: 24px; margin-top: 8px;">—</div>
            <div class="metric-sub" id="metricSimilarity"></div>
        </div>
    </div>

    <!-- Enrolled People -->
    <div class="enrolled-list" id="enrolledList" style="display:none;">
        <div class="results-header">Enrolled Faces</div>
        <div id="enrolledItems"></div>
    </div>

    <!-- Log -->
    <div class="log-panel" id="logPanel">
        <div class="results-header">Activity Log</div>
        <div id="logEntries"></div>
    </div>

    <div class="toast" id="toast"></div>

    <script>
        let video = document.getElementById('video');
        let canvas = document.getElementById('canvas');
        let ctx = canvas.getContext('2d');
        let currentMode = 'detect';
        let autoCapture = false;
        let autoCaptureInterval = null;
        let facingMode = 'user'; // front camera
        let stream = null;

        // Start camera
        async function startCamera() {
            try {
                if (stream) {
                    stream.getTracks().forEach(t => t.stop());
                }
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false
                });
                video.srcObject = stream;
                addLog('Camera started (' + (facingMode === 'user' ? 'front' : 'rear') + ')');
            } catch (err) {
                addLog('Camera error: ' + err.message, 'error');
                showToast('Camera access denied', 'error');
            }
        }

        function switchCamera() {
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            startCamera();
        }

        function setMode(mode) {
            currentMode = mode;
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('tab' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');

            document.getElementById('enrollSection').style.display = mode === 'enroll' ? 'block' : 'none';
            document.getElementById('matchResult').style.display = mode === 'recognize' ? 'block' : 'none';

            // Update button text
            const btn = document.getElementById('btnCapture');
            if (mode === 'detect') btn.innerHTML = '📸 Capture & Analyze';
            else if (mode === 'enroll') btn.innerHTML = '📝 Capture & Enroll';
            else btn.innerHTML = '✅ Capture & Recognize';

            addLog('Mode: ' + mode);
            updateEnrolledList();
        }

        async function captureAndProcess() {
            if (!video.srcObject) {
                showToast('Camera not ready', 'error');
                return;
            }

            setStatus('processing');
            const btn = document.getElementById('btnCapture');
            btn.disabled = true;

            // Capture frame with client-side scaling and JPEG compression to save bandwidth (<50ms transit)
            const maxDim = 480;
            let targetWidth = video.videoWidth;
            let targetHeight = video.videoHeight;
            if (targetWidth > maxDim || targetHeight > maxDim) {
                if (targetWidth > targetHeight) {
                    targetHeight = Math.round((maxDim / targetWidth) * targetHeight);
                    targetWidth = maxDim;
                } else {
                    targetWidth = Math.round((maxDim / targetHeight) * targetWidth);
                    targetHeight = maxDim;
                }
            }
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.70);

            try {
                const endpoint = currentMode === 'enroll' ? '/enroll' :
                                 currentMode === 'recognize' ? '/recognize' : '/detect';

                const body = { image: dataUrl };
                if (currentMode === 'enroll') {
                    const name = document.getElementById('enrollName').value.trim();
                    if (!name) {
                        showToast('Enter a name first', 'error');
                        btn.disabled = false;
                        setStatus('ready');
                        return;
                    }
                    body.name = name;
                }

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                const data = await res.json();

                if (data.success) {
                    updateResults(data);
                    updateFaceOval(data);

                    if (currentMode === 'enroll') {
                        showToast('✅ Enrolled: ' + body.name, 'success');
                        document.getElementById('enrollName').value = '';
                        updateEnrolledList();
                    } else if (currentMode === 'recognize' && data.match) {
                        showToast('✅ Matched: ' + data.match.name + ' (' + (data.match.similarity * 100).toFixed(1) + '%)', 'success');
                    }

                    addLog(currentMode + ': confidence=' + data.confidence?.toFixed(3) +
                           ' liveness=' + (data.is_live ? 'LIVE' : 'SPOOF'), data.is_live ? 'success' : 'error');
                } else {
                    addLog('No face detected', 'error');
                    showToast('No face detected', 'error');
                    resetFaceOval();
                }

                setStatus('ready');
            } catch (err) {
                addLog('Error: ' + err.message, 'error');
                showToast('Server error', 'error');
                setStatus('error');
            }

            btn.disabled = false;
        }

        function toggleAutoCapture() {
            autoCapture = !autoCapture;
            const btn = document.getElementById('btnAuto');

            if (autoCapture) {
                btn.classList.remove('btn-outline');
                btn.classList.add('btn-success');
                btn.innerHTML = '⚡ Auto ON';
                autoCaptureInterval = setInterval(captureAndProcess, 1500);
                addLog('Auto-capture enabled (1.5s interval)');
            } else {
                btn.classList.remove('btn-success');
                btn.classList.add('btn-outline');
                btn.innerHTML = '⚡ Auto';
                clearInterval(autoCaptureInterval);
                addLog('Auto-capture disabled');
            }
        }

        function updateResults(data) {
            document.getElementById('resultsPanel').style.display = 'block';
            document.getElementById('metricConfidence').textContent = (data.confidence * 100).toFixed(1) + '%';
            
            const livenessEl = document.getElementById('metricLiveness');
            livenessEl.textContent = data.is_live ? 'LIVE' : 'SPOOF';
            livenessEl.className = 'metric-value ' + (data.is_live ? 'live' : 'spoof');
            document.getElementById('metricLaplacian').textContent = 'Laplacian: ' + data.laplacian?.toFixed(1);

            document.getElementById('metricEAR').textContent = data.ear >= 0 ? data.ear.toFixed(3) : 'N/A';
            document.getElementById('metricBlink').textContent = data.ear >= 0 ? (data.ear < 0.21 ? 'Blink!' : 'Open') : '';

            document.getElementById('metricTime').textContent = data.inference_ms?.toFixed(0) || '—';

            if (currentMode === 'recognize' && data.match) {
                const matchEl = document.getElementById('metricMatch');
                matchEl.textContent = data.match.name;
                matchEl.className = 'metric-value match';
                document.getElementById('metricSimilarity').textContent =
                    'Similarity: ' + (data.match.similarity * 100).toFixed(2) + '%';
            } else if (currentMode === 'recognize') {
                const matchEl = document.getElementById('metricMatch');
                matchEl.textContent = 'Unknown';
                matchEl.className = 'metric-value no-match';
                document.getElementById('metricSimilarity').textContent = 'No match found';
            }
        }

        function updateFaceOval(data) {
            const oval = document.getElementById('faceOval');
            oval.classList.remove('detected', 'spoof');
            if (data.success) {
                oval.classList.add(data.is_live ? 'detected' : 'spoof');
            }
        }

        function resetFaceOval() {
            document.getElementById('faceOval').classList.remove('detected', 'spoof');
        }

        async function updateEnrolledList() {
            try {
                const res = await fetch('/enrolled');
                const data = await res.json();
                const container = document.getElementById('enrolledItems');
                const list = document.getElementById('enrolledList');

                if (data.names && data.names.length > 0) {
                    list.style.display = 'block';
                    container.innerHTML = data.names.map(n =>
                        '<div class="enrolled-item">' +
                        '<span class="enrolled-name">' + n + '</span>' +
                        '<span class="enrolled-badge">Enrolled</span>' +
                        '</div>'
                    ).join('');
                } else {
                    list.style.display = 'none';
                }
            } catch (e) {}
        }

        function setStatus(status) {
            const badge = document.getElementById('statusBadge');
            badge.className = 'status status-' + status;
            badge.textContent = status === 'ready' ? 'Ready' :
                               status === 'processing' ? 'Processing...' : 'Error';
            if (status === 'processing') badge.classList.add('processing');
        }

        function addLog(msg, type = '') {
            const entries = document.getElementById('logEntries');
            const now = new Date().toLocaleTimeString('en-US', { hour12: false });
            const div = document.createElement('div');
            div.className = 'log-entry ' + type;
            div.innerHTML = '<span class="time">' + now + '</span>' + msg;
            entries.insertBefore(div, entries.firstChild);
            // Keep max 20 entries
            while (entries.children.length > 20) entries.removeChild(entries.lastChild);
        }

        function showToast(msg, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.className = 'toast ' + type + ' show';
            setTimeout(() => toast.classList.remove('show'), 2500);
        }

        // Init
        startCamera();
        addLog('DatalakeGuard Mobile Test loaded');
        addLog('Models: BlazeFace + MobileFaceNet + FaceMesh');
    </script>
</body>
</html>
"""


def decode_image(data_url: str) -> np.ndarray:
    """Decode base64 data URL to OpenCV image."""
    header, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)
    img = Image.open(io.BytesIO(img_bytes))
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def run_pipeline(image_bgr: np.ndarray):
    """Run full detection + embedding + liveness pipeline."""
    t0 = time.time()

    # 1. BlazeFace detection
    detections = detector.detect(image_bgr)
    if not detections:
        return None

    det = detections[0]
    x1, y1, x2, y2 = det['bbox']
    face_crop = image_bgr[y1:y2, x1:x2]

    if face_crop.size == 0:
        return None

    # 2. Liveness - Laplacian variance
    laplacian = compute_laplacian_variance(face_crop)
    is_live = laplacian > LIVENESS_LAPLACIAN_THRESHOLD

    # 3. FaceMesh EAR
    ear = -1.0
    try:
        landmarks = landmarker.get_landmarks(face_crop)
        ear = landmarker.compute_ear(landmarks)
    except Exception:
        pass

    # 4. MobileFaceNet embedding (with 2D affine eye alignment and CLAHE)
    if det.get('keypoints') and len(det['keypoints']) >= 2:
        kp = det['keypoints']
        eye1, eye2 = kp[0], kp[1]
        if eye1[0] < eye2[0]:
            eye_left, eye_right = eye1, eye2
        else:
            eye_left, eye_right = eye2, eye1
        face_aligned = align_face_2d(image_bgr, eye_left, eye_right)
    else:
        face_aligned = cv2.resize(face_crop, (112, 112))

    embedding = embedder.embed(face_aligned, run_clahe=True)

    inference_ms = (time.time() - t0) * 1000

    return {
        'success': True,
        'confidence': det['confidence'],
        'bbox': det['bbox'],
        'laplacian': laplacian,
        'is_live': is_live,
        'ear': ear,
        'embedding': embedding.tolist(),
        'inference_ms': inference_ms,
    }


@app.route('/')
def index():
    return render_template_string(MOBILE_UI)


@app.route('/detect', methods=['POST'])
def detect():
    data = request.json
    image = decode_image(data['image'])
    result = run_pipeline(image)
    if result is None:
        return jsonify({'success': False, 'error': 'No face detected'})
    # Don't send full embedding to client
    result.pop('embedding', None)
    return jsonify(result)


@app.route('/enroll', methods=['POST'])
def enroll():
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Name required'})

    image = decode_image(data['image'])
    result = run_pipeline(image)
    if result is None:
        return jsonify({'success': False, 'error': 'No face detected'})

    # Multi-prototype storage: store up to 3 reference embeddings per person
    new_emb = np.array(result['embedding'])
    if name not in enrolled_embeddings:
        enrolled_embeddings[name] = []
    
    # FIFO replace if we have 3 prototypes already
    if len(enrolled_embeddings[name]) >= 3:
        enrolled_embeddings[name].pop(0)
        
    enrolled_embeddings[name].append(new_emb)
    print(f"[+] Enrolled prototype for {name} (total reference prototypes={len(enrolled_embeddings[name])})")

    result.pop('embedding', None)
    return jsonify(result)


@app.route('/recognize', methods=['POST'])
def recognize():
    data = request.json
    image = decode_image(data['image'])
    result = run_pipeline(image)
    if result is None:
        return jsonify({'success': False, 'error': 'No face detected'})

    embedding = np.array(result['embedding'])
    result.pop('embedding', None)

    # Find best match against all prototypes of each enrolled person (Max similarity pooling)
    best_name = None
    best_sim = -1.0
    for name, stored_embs in enrolled_embeddings.items():
        if isinstance(stored_embs, list):
            sims = [cosine_similarity(embedding, stored_emb) for stored_emb in stored_embs]
            sim = max(sims) if sims else 0.0
        else:
            sim = cosine_similarity(embedding, stored_embs)
            
        if sim > best_sim:
            best_sim = sim
            best_name = name

    if best_name and best_sim > COSINE_MATCH_THRESHOLD:
        result['match'] = {'name': best_name, 'similarity': best_sim}
    else:
        result['match'] = None

    return jsonify(result)


@app.route('/enrolled', methods=['GET'])
def get_enrolled():
    return jsonify({'names': list(enrolled_embeddings.keys())})


def get_local_ip():
    """Get the machine's local IP for the phone to connect to."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


if __name__ == '__main__':
    print("=" * 60)
    print("  🛡️  DatalakeGuard Mobile Camera Test Server")
    print("=" * 60)

    # Load models
    detector = BlazeFaceDetector()
    embedder = MobileFaceNetEmbedder()
    landmarker = FaceMeshLandmarker()
    print("\n[✓] All 3 models loaded!\n")

    local_ip = get_local_ip()
    print("=" * 60)
    print(f"  📱 Open this URL on your phone:")
    print(f"")
    print(f"     http://{local_ip}:5000")
    print(f"")
    print(f"  Make sure phone and PC are on the same WiFi network.")
    print(f"  Press Ctrl+C to stop.")
    print("=" * 60)
    print()

    # Run with 0.0.0.0 so phone can connect
    app.run(host='0.0.0.0', port=5000, debug=False)
