import os
import shutil

src_dir = "models_tmp"
dest_dir = "DatalakeGuard/android/app/src/main/assets/models"

os.makedirs(dest_dir, exist_ok=True)

models = ["blazeface.tflite", "facemesh.tflite", "mobilefacenet.tflite"]

for model in models:
    src_path = os.path.join(src_dir, model)
    dest_path = os.path.join(dest_dir, model)
    if os.path.exists(src_path):
        shutil.copy2(src_path, dest_path)
        print(f"Copied {model} to {dest_path}")
    else:
        print(f"Source file {src_path} does not exist!")

print("Models move completed.")
