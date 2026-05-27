import os
import tensorflow as tf

models_dir = "DatalakeGuard/android/app/src/main/assets/models"
models = ["blazeface.tflite", "facemesh.tflite", "mobilefacenet.tflite"]

for model in models:
    path = os.path.join(models_dir, model)
    print(f"\n================ INSPECTING {model} ================")
    if not os.path.exists(path):
        print(f"File not found: {path}")
        continue
    try:
        interpreter = tf.lite.Interpreter(model_path=path)
        interpreter.allocate_tensors()
        
        print("Inputs:")
        for idx, details in enumerate(interpreter.get_input_details()):
            print(f"  Input {idx}: Name={details['name']}, Shape={details['shape']}, Type={details['dtype']}")
            
        print("Outputs:")
        for idx, details in enumerate(interpreter.get_output_details()):
            print(f"  Output {idx}: Name={details['name']}, Shape={details['shape']}, Type={details['dtype']}")
    except Exception as e:
        print(f"Error inspecting {model}: {e}")
