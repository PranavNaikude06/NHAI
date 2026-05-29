#!/usr/bin/env python3
"""
DatalakeGuard AI/ML Model Test Harness
=======================================
Standalone Python script to test BlazeFace + MobileFaceNet + FaceMesh
TFLite models on real face images without needing the full React Native app.

Usage:
  python test_model.py --image path/to/face.jpg          # Test single image
  python test_model.py --dir path/to/faces/               # Batch test folder
  python test_model.py --compare img1.jpg img2.jpg         # Compare two faces
  python test_model.py --camera                            # Live webcam test

Requirements:
  pip install -r requirements.txt
"""

import argparse
import os
import sys
import time
import numpy as np
import cv2
from pathlib import Path

# ─── Configuration ───────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent.parent / "models"
OUTPUT_DIR = Path(__file__).parent / "output"
BLAZEFACE_PATH = MODELS_DIR / "blazeface.tflite"
MOBILEFACENET_PATH = MODELS_DIR / "mobilefacenet.tflite"
FACEMESH_PATH = MODELS_DIR / "facemesh.tflite"

# BlazeFace input: 128x128 RGB
BLAZEFACE_INPUT_SIZE = 128
# MobileFaceNet input: 112x112 RGB
MOBILEFACENET_INPUT_SIZE = 112
# FaceMesh input: 192x192 RGB
FACEMESH_INPUT_SIZE = 192

# Detection threshold
DETECTION_CONFIDENCE_THRESHOLD = 0.65
# Cosine similarity threshold for same-person match
COSINE_MATCH_THRESHOLD = 0.55
# Liveness Laplacian variance threshold
LIVENESS_LAPLACIAN_THRESHOLD = 50.0

# ─── Color palette ───────────────────────────────────────────────────────────
GREEN = (0, 255, 0)
RED = (0, 0, 255)
CYAN = (255, 255, 0)
YELLOW = (0, 255, 255)
WHITE = (255, 255, 255)
MAGENTA = (255, 0, 255)


def load_tflite_model(model_path: Path):
    """Load a TFLite model and allocate tensors."""
    try:
        import tflite_runtime.interpreter as tflite
        interpreter = tflite.Interpreter(model_path=str(model_path))
    except ImportError:
        # Fallback to full TensorFlow if tflite_runtime not available
        import tensorflow as tf
        interpreter = tf.lite.Interpreter(model_path=str(model_path))

    interpreter.allocate_tensors()
    return interpreter


def get_io_details(interpreter):
    """Get input/output tensor details."""
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    return input_details, output_details


class BlazeFaceDetector:
    """BlazeFace face detection model wrapper."""

    def __init__(self):
        print(f"[*] Loading BlazeFace from {BLAZEFACE_PATH} ...")
        self.interpreter = load_tflite_model(BLAZEFACE_PATH)
        self.input_details, self.output_details = get_io_details(self.interpreter)
        print(f"    Input shape:  {self.input_details[0]['shape']}")
        print(f"    Outputs: {len(self.output_details)} tensors")

    def detect(self, image_bgr: np.ndarray):
        """
        Run BlazeFace detection on an image.
        Returns list of detections: [{bbox, keypoints, confidence}]
        """
        h, w = image_bgr.shape[:2]

        # Preprocess: resize to 128x128, normalize to [-1, 1]
        input_img = cv2.resize(image_bgr, (BLAZEFACE_INPUT_SIZE, BLAZEFACE_INPUT_SIZE))
        input_img = cv2.cvtColor(input_img, cv2.COLOR_BGR2RGB)
        input_img = (input_img.astype(np.float32) - 127.5) / 127.5
        input_img = np.expand_dims(input_img, axis=0)

        # Run inference
        self.interpreter.set_tensor(self.input_details[0]['index'], input_img)
        self.interpreter.invoke()

        # Parse outputs — BlazeFace has 2 outputs: boxes and scores
        # Output shapes vary by model variant; handle both
        raw_boxes = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
        raw_scores = self.interpreter.get_tensor(self.output_details[1]['index'])[0]

        detections = []
        # Apply sigmoid to scores if needed
        if raw_scores.max() > 1.0 or raw_scores.min() < 0.0:
            scores = 1.0 / (1.0 + np.exp(-raw_scores))
        else:
            scores = raw_scores

        for i in range(len(scores)):
            score = float(scores[i].max()) if scores[i].ndim > 0 else float(scores[i])
            if score < DETECTION_CONFIDENCE_THRESHOLD:
                continue

            box = raw_boxes[i]
            # BlazeFace outputs: [yc, xc, height, width, kp0_x, kp0_y, kp1_x, kp1_y, ...]
            # Coordinates are normalized to [0, 1]
            yc, xc, bh, bw = box[0], box[1], box[2], box[3]

            x1 = int((xc - bw / 2) * w)
            y1 = int((yc - bh / 2) * h)
            x2 = int((xc + bw / 2) * w)
            y2 = int((yc + bh / 2) * h)

            # Clamp to image bounds
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            # Extract 6 keypoints (if available in the box output)
            keypoints = []
            for k in range(6):
                kp_idx = 4 + k * 2
                if kp_idx + 1 < len(box):
                    kp_x = int(box[kp_idx] * w)
                    kp_y = int(box[kp_idx + 1] * h)
                    keypoints.append((kp_x, kp_y))

            detections.append({
                'bbox': (x1, y1, x2, y2),
                'keypoints': keypoints,
                'confidence': score,
            })

        # Sort by confidence, take top detection
        detections.sort(key=lambda d: d['confidence'], reverse=True)
        return detections


class MobileFaceNetEmbedder:
    """MobileFaceNet face embedding model wrapper."""

    def __init__(self):
        print(f"[*] Loading MobileFaceNet from {MOBILEFACENET_PATH} ...")
        self.interpreter = load_tflite_model(MOBILEFACENET_PATH)
        self.input_details, self.output_details = get_io_details(self.interpreter)
        print(f"    Input shape:  {self.input_details[0]['shape']}")
        print(f"    Output shape: {self.output_details[0]['shape']}")

    def embed(self, face_crop_bgr: np.ndarray) -> np.ndarray:
        """
        Extract 128-dim embedding from a face crop.
        Returns normalized embedding vector.
        """
        # Preprocess: resize to 112x112, normalize to [-1, 1]
        face = cv2.resize(face_crop_bgr, (MOBILEFACENET_INPUT_SIZE, MOBILEFACENET_INPUT_SIZE))
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        face = (face.astype(np.float32) - 127.5) / 127.5
        face = np.expand_dims(face, axis=0)

        # Run inference
        self.interpreter.set_tensor(self.input_details[0]['index'], face)
        self.interpreter.invoke()

        embedding = self.interpreter.get_tensor(self.output_details[0]['index'])[0]

        # L2 normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding


class FaceMeshLandmarker:
    """FaceMesh 468-landmark model wrapper for enhanced liveness."""

    def __init__(self):
        print(f"[*] Loading FaceMesh from {FACEMESH_PATH} ...")
        self.interpreter = load_tflite_model(FACEMESH_PATH)
        self.input_details, self.output_details = get_io_details(self.interpreter)
        print(f"    Input shape:  {self.input_details[0]['shape']}")
        print(f"    Outputs: {len(self.output_details)} tensors")

    def get_landmarks(self, face_crop_bgr: np.ndarray) -> np.ndarray:
        """
        Extract 468 facial landmarks from a face crop.
        Returns array of shape (468, 3) with [x, y, z] normalized coordinates.
        """
        face = cv2.resize(face_crop_bgr, (FACEMESH_INPUT_SIZE, FACEMESH_INPUT_SIZE))
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        face = face.astype(np.float32) / 255.0
        face = np.expand_dims(face, axis=0)

        self.interpreter.set_tensor(self.input_details[0]['index'], face)
        self.interpreter.invoke()

        # First output is landmarks: (1, 468, 3)
        landmarks = self.interpreter.get_tensor(self.output_details[0]['index'])[0]

        # Reshape if flat
        if landmarks.ndim == 1:
            landmarks = landmarks.reshape(-1, 3)

        return landmarks

    def compute_ear(self, landmarks: np.ndarray) -> float:
        """
        Compute Eye Aspect Ratio from FaceMesh landmarks.
        Uses standard EAR formula with eye landmarks.
        
        Left eye indices:  [33, 160, 158, 133, 153, 144]
        Right eye indices: [362, 385, 387, 263, 373, 380]
        """
        def eye_aspect_ratio(eye_pts):
            # Vertical distances
            v1 = np.linalg.norm(eye_pts[1] - eye_pts[5])
            v2 = np.linalg.norm(eye_pts[2] - eye_pts[4])
            # Horizontal distance
            h = np.linalg.norm(eye_pts[0] - eye_pts[3])
            if h == 0:
                return 0.0
            return (v1 + v2) / (2.0 * h)

        left_eye_idx = [33, 160, 158, 133, 153, 144]
        right_eye_idx = [362, 385, 387, 263, 373, 380]

        try:
            left_pts = landmarks[left_eye_idx][:, :2]
            right_pts = landmarks[right_eye_idx][:, :2]
            left_ear = eye_aspect_ratio(left_pts)
            right_ear = eye_aspect_ratio(right_pts)
            return (left_ear + right_ear) / 2.0
        except (IndexError, ValueError):
            return -1.0


def compute_laplacian_variance(face_crop_bgr: np.ndarray) -> float:
    """
    Compute Laplacian variance for texture-based liveness.
    Real faces have high texture variance; prints/screens have low variance.
    """
    gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return float(laplacian.var())


def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    """Compute cosine similarity between two embeddings."""
    dot = np.dot(emb1, emb2)
    n1, n2 = np.linalg.norm(emb1), np.linalg.norm(emb2)
    if n1 == 0 or n2 == 0:
        return 0.0
    return float(dot / (n1 * n2))


def annotate_image(image: np.ndarray, detection: dict, embedding: np.ndarray,
                   laplacian: float, landmarks_ear: float = -1.0,
                   similarity: float = None, label: str = None) -> np.ndarray:
    """Draw detection box, keypoints, and metrics on the image."""
    result = image.copy()
    x1, y1, x2, y2 = detection['bbox']

    # Determine color based on liveness
    is_live = laplacian > LIVENESS_LAPLACIAN_THRESHOLD
    box_color = GREEN if is_live else RED

    # Draw bounding box
    cv2.rectangle(result, (x1, y1), (x2, y2), box_color, 2)

    # Draw keypoints
    for i, kp in enumerate(detection.get('keypoints', [])):
        cv2.circle(result, kp, 4, CYAN, -1)
        cv2.putText(result, str(i), (kp[0] + 5, kp[1] - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, CYAN, 1)

    # Info panel
    y_offset = y1 - 10
    texts = [
        f"Confidence: {detection['confidence']:.3f}",
        f"Laplacian: {laplacian:.1f} ({'LIVE' if is_live else 'SPOOF'})",
        f"Embedding dim: {len(embedding)}",
    ]
    if landmarks_ear >= 0:
        texts.append(f"EAR (blink): {landmarks_ear:.3f}")
    if similarity is not None:
        match = similarity > COSINE_MATCH_THRESHOLD
        texts.append(f"Similarity: {similarity:.4f} ({'MATCH' if match else 'NO MATCH'})")
    if label:
        texts.insert(0, label)

    for i, text in enumerate(reversed(texts)):
        y_pos = y_offset - i * 20
        if y_pos < 15:
            y_pos = y2 + 20 + (len(texts) - 1 - i) * 20
        cv2.putText(result, text, (x1, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1, cv2.LINE_AA)

    return result


def process_single_image(image_path: str, detector: BlazeFaceDetector,
                         embedder: MobileFaceNetEmbedder, landmarker: FaceMeshLandmarker):
    """Process a single image through the full pipeline."""
    print(f"\n{'='*60}")
    print(f"Processing: {image_path}")
    print(f"{'='*60}")

    image = cv2.imread(image_path)
    if image is None:
        print(f"[ERROR] Cannot read image: {image_path}")
        return None, None

    h, w = image.shape[:2]
    print(f"Image size: {w}x{h}")

    # Step 1: BlazeFace detection
    t0 = time.time()
    detections = detector.detect(image)
    t_detect = (time.time() - t0) * 1000
    print(f"\n[1] BlazeFace Detection: {len(detections)} face(s) found ({t_detect:.1f}ms)")

    if not detections:
        print("[!] No face detected in image.")
        return None, None

    det = detections[0]  # Take best detection
    x1, y1, x2, y2 = det['bbox']
    print(f"    BBox: ({x1}, {y1}) -> ({x2}, {y2})")
    print(f"    Confidence: {det['confidence']:.4f}")
    print(f"    Keypoints: {len(det.get('keypoints', []))}")

    # Step 2: Crop face
    face_crop = image[y1:y2, x1:x2]
    if face_crop.size == 0:
        print("[!] Empty face crop — detection may be out of bounds.")
        return None, None

    # Step 3: Liveness - Laplacian variance
    laplacian = compute_laplacian_variance(face_crop)
    is_live = laplacian > LIVENESS_LAPLACIAN_THRESHOLD
    print(f"\n[2] Passive Liveness:")
    print(f"    Laplacian variance: {laplacian:.2f}")
    print(f"    Threshold: {LIVENESS_LAPLACIAN_THRESHOLD}")
    print(f"    Verdict: {'✅ LIVE' if is_live else '❌ POTENTIAL SPOOF'}")

    # Step 4: FaceMesh landmarks + EAR
    t0 = time.time()
    landmarks_ear = -1.0
    try:
        landmarks = landmarker.get_landmarks(face_crop)
        landmarks_ear = landmarker.compute_ear(landmarks)
        t_mesh = (time.time() - t0) * 1000
        print(f"\n[3] FaceMesh (468 landmarks): ({t_mesh:.1f}ms)")
        print(f"    Landmarks shape: {landmarks.shape}")
        print(f"    Eye Aspect Ratio: {landmarks_ear:.4f}")
        blink_detected = landmarks_ear < 0.21
        print(f"    Blink detected: {'YES' if blink_detected else 'NO'} (threshold: 0.21)")
    except Exception as e:
        print(f"\n[3] FaceMesh: Skipped ({e})")

    # Step 5: MobileFaceNet embedding
    t0 = time.time()
    embedding = embedder.embed(face_crop)
    t_embed = (time.time() - t0) * 1000
    print(f"\n[4] MobileFaceNet Embedding: ({t_embed:.1f}ms)")
    print(f"    Dimension: {len(embedding)}")
    print(f"    L2 norm: {np.linalg.norm(embedding):.4f}")
    print(f"    First 8 values: [{', '.join(f'{v:.4f}' for v in embedding[:8])}...]")

    total_ms = t_detect + t_embed
    print(f"\n[*] Total pipeline: {total_ms:.1f}ms")

    # Annotate and save
    annotated = annotate_image(image, det, embedding, laplacian, landmarks_ear)
    output_path = OUTPUT_DIR / f"result_{Path(image_path).stem}.jpg"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), annotated)
    print(f"[*] Annotated result saved: {output_path}")

    return embedding, det


def compare_faces(img1_path: str, img2_path: str, detector: BlazeFaceDetector,
                  embedder: MobileFaceNetEmbedder, landmarker: FaceMeshLandmarker):
    """Compare two face images and report similarity."""
    print(f"\n{'='*60}")
    print(f"COMPARING FACES")
    print(f"  Image 1: {img1_path}")
    print(f"  Image 2: {img2_path}")
    print(f"{'='*60}")

    emb1, det1 = process_single_image(img1_path, detector, embedder, landmarker)
    emb2, det2 = process_single_image(img2_path, detector, embedder, landmarker)

    if emb1 is None or emb2 is None:
        print("\n[ERROR] Could not extract embeddings from one or both images.")
        return

    sim = cosine_similarity(emb1, emb2)
    match = sim > COSINE_MATCH_THRESHOLD

    print(f"\n{'='*60}")
    print(f"COMPARISON RESULT")
    print(f"{'='*60}")
    print(f"  Cosine Similarity: {sim:.6f}")
    print(f"  Match Threshold:   {COSINE_MATCH_THRESHOLD}")
    print(f"  Verdict:           {'✅ SAME PERSON' if match else '❌ DIFFERENT PEOPLE'}")
    print(f"{'='*60}")

    # Create side-by-side annotated image
    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path)
    if img1 is not None and img2 is not None and det1 is not None and det2 is not None:
        lap1 = compute_laplacian_variance(img1[det1['bbox'][1]:det1['bbox'][3], det1['bbox'][0]:det1['bbox'][2]])
        lap2 = compute_laplacian_variance(img2[det2['bbox'][1]:det2['bbox'][3], det2['bbox'][0]:det2['bbox'][2]])
        ann1 = annotate_image(img1, det1, emb1, lap1, similarity=sim, label="Image 1")
        ann2 = annotate_image(img2, det2, emb2, lap2, similarity=sim, label="Image 2")

        # Resize to same height for side-by-side
        target_h = max(ann1.shape[0], ann2.shape[0])
        ann1 = cv2.resize(ann1, (int(ann1.shape[1] * target_h / ann1.shape[0]), target_h))
        ann2 = cv2.resize(ann2, (int(ann2.shape[1] * target_h / ann2.shape[0]), target_h))
        combined = np.hstack([ann1, ann2])

        output_path = OUTPUT_DIR / "comparison_result.jpg"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), combined)
        print(f"[*] Side-by-side comparison saved: {output_path}")


def batch_process(dir_path: str, detector: BlazeFaceDetector,
                  embedder: MobileFaceNetEmbedder, landmarker: FaceMeshLandmarker):
    """Process all images in a directory."""
    extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    images = [f for f in Path(dir_path).iterdir()
              if f.suffix.lower() in extensions]

    print(f"\nFound {len(images)} images in {dir_path}")

    embeddings = {}
    for img_path in sorted(images):
        emb, _ = process_single_image(str(img_path), detector, embedder, landmarker)
        if emb is not None:
            embeddings[img_path.name] = emb

    # Print pairwise similarity matrix if > 1 face
    if len(embeddings) > 1:
        names = list(embeddings.keys())
        print(f"\n{'='*60}")
        print("PAIRWISE SIMILARITY MATRIX")
        print(f"{'='*60}")

        # Header
        max_name_len = max(len(n) for n in names)
        header = " " * (max_name_len + 2)
        for n in names:
            header += f"{n[:8]:>10}"
        print(header)

        for i, n1 in enumerate(names):
            row = f"{n1:<{max_name_len}}  "
            for j, n2 in enumerate(names):
                sim = cosine_similarity(embeddings[n1], embeddings[n2])
                marker = " ✓" if sim > COSINE_MATCH_THRESHOLD and i != j else ""
                row += f"{sim:>8.4f}{marker:>2}"
            print(row)


def webcam_test(detector: BlazeFaceDetector, embedder: MobileFaceNetEmbedder,
                landmarker: FaceMeshLandmarker):
    """Live webcam face detection and embedding test."""
    print("\n[*] Starting webcam test (press 'q' to quit, 's' to save snapshot)...")
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        return

    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        display = frame.copy()

        # Run detection every frame
        detections = detector.detect(frame)

        if detections:
            det = detections[0]
            x1, y1, x2, y2 = det['bbox']
            face_crop = frame[y1:y2, x1:x2]

            if face_crop.size > 0:
                laplacian = compute_laplacian_variance(face_crop)
                embedding = embedder.embed(face_crop)

                # FaceMesh EAR
                ear = -1.0
                try:
                    landmarks = landmarker.get_landmarks(face_crop)
                    ear = landmarker.compute_ear(landmarks)
                except Exception:
                    pass

                display = annotate_image(display, det, embedding, laplacian, ear)

        # FPS counter
        cv2.putText(display, f"Frame: {frame_count}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, YELLOW, 2)

        cv2.imshow("DatalakeGuard Model Test - Press Q to quit", display)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            snap_path = OUTPUT_DIR / f"webcam_snap_{frame_count}.jpg"
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(snap_path), display)
            print(f"[*] Snapshot saved: {snap_path}")

    cap.release()
    cv2.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(
        description="DatalakeGuard AI/ML Model Test Harness",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_model.py --image photo.jpg
  python test_model.py --dir ./sample_faces/
  python test_model.py --compare person1.jpg person2.jpg
  python test_model.py --camera
        """
    )
    parser.add_argument('--image', type=str, help='Path to a single face image')
    parser.add_argument('--dir', type=str, help='Path to directory of face images')
    parser.add_argument('--compare', nargs=2, metavar=('IMG1', 'IMG2'),
                        help='Compare two face images')
    parser.add_argument('--camera', action='store_true', help='Live webcam test')

    args = parser.parse_args()

    if not any([args.image, args.dir, args.compare, args.camera]):
        parser.print_help()
        sys.exit(1)

    # Verify models exist
    for model_path in [BLAZEFACE_PATH, MOBILEFACENET_PATH, FACEMESH_PATH]:
        if not model_path.exists():
            print(f"[ERROR] Model not found: {model_path}")
            print(f"        Expected at: {model_path.resolve()}")
            sys.exit(1)

    print("=" * 60)
    print("  DatalakeGuard AI/ML Model Test Harness")
    print("  Models: BlazeFace + MobileFaceNet + FaceMesh")
    print("=" * 60)

    # Load models
    detector = BlazeFaceDetector()
    embedder = MobileFaceNetEmbedder()
    landmarker = FaceMeshLandmarker()
    print("\n[✓] All 3 models loaded successfully!\n")

    # Route to appropriate mode
    if args.image:
        process_single_image(args.image, detector, embedder, landmarker)
    elif args.dir:
        batch_process(args.dir, detector, embedder, landmarker)
    elif args.compare:
        compare_faces(args.compare[0], args.compare[1], detector, embedder, landmarker)
    elif args.camera:
        webcam_test(detector, embedder, landmarker)


if __name__ == "__main__":
    main()
