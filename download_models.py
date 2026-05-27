import os
import urllib.request

models = {
    "blazeface.tflite": "https://github.com/patlevin/face-detection-tflite/raw/main/fdlite/data/face_detection_short_range.tflite",
    "facemesh.tflite": "https://github.com/patlevin/face-detection-tflite/raw/main/fdlite/data/face_landmark.tflite",
    "mobilefacenet.tflite": "https://github.com/syaringan357/Android-MobileFaceNet-MTCNN-FaceAntiSpoofing/raw/master/app/src/main/assets/MobileFaceNet.tflite"
}

os.makedirs("models_tmp", exist_ok=True)

for name, url in models.items():
    print(f"Downloading {name}...")
    dest = os.path.join("models_tmp", name)
    try:
        urllib.request.urlretrieve(url, dest)
        print(f"Saved to {dest}")
    except Exception as e:
        print(f"Error downloading {name}: {e}")

print("Download complete.")
