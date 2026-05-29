package com.datalakeguard

import android.content.res.AssetFileDescriptor
import android.util.Log
import com.facebook.react.bridge.*
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class MediaPipeLandmarkModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var faceMeshInterpreter: Interpreter? = null

    override fun getName(): String {
        return "MediaPipeLandmark"
    }

    init {
        try {
            loadModel()
        } catch (e: Exception) {
            Log.e("MediaPipeLandmark", "Error loading facemesh model: ${e.message}")
        }
    }

    private fun loadModel() {
        val options = Interpreter.Options().apply {
            setNumThreads(4)
        }
        faceMeshInterpreter = Interpreter(loadModelFile("facemesh.tflite"), options)
        Log.e("MediaPipeLandmark", "FaceMesh model loaded successfully.")
        
        faceMeshInterpreter?.let { interpreter ->
            val inputShape = interpreter.getInputTensor(0).shape()
            val outputShape = interpreter.getOutputTensor(0).shape()
            Log.e("MediaPipeLandmark", "FaceMesh - Input Shape: ${inputShape.contentToString()}, Input Bytes: ${interpreter.getInputTensor(0).numBytes()}, Output Shape: ${outputShape.contentToString()}, Output Count: ${interpreter.outputTensorCount}")
            for (i in 0 until interpreter.outputTensorCount) {
                Log.e("MediaPipeLandmark", "  Output $i - Shape: ${interpreter.getOutputTensor(i).shape().contentToString()}, Type: ${interpreter.getOutputTensor(i).dataType()}, Bytes: ${interpreter.getOutputTensor(i).numBytes()}")
            }
        }
    }

    private fun loadModelFile(filename: String): MappedByteBuffer {
        val assetFileDescriptor: AssetFileDescriptor = reactContext.assets.openFd("models/$filename")
        val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        return fileChannel.map(
            FileChannel.MapMode.READ_ONLY,
            assetFileDescriptor.startOffset,
            assetFileDescriptor.declaredLength
        )
    }

    @ReactMethod
    fun runFaceMesh(imageData: ReadableArray, promise: Promise) {
        val interpreter = faceMeshInterpreter
        if (interpreter == null) {
            promise.reject("MODEL_ERROR", "FaceMesh model is not loaded")
            return
        }

        try {
            // FaceMesh input is 192x192x3 float32
            val inputSize = 192
            val size = imageData.size()
            if (size != inputSize * inputSize * 3) {
                promise.reject("INPUT_ERROR", "Expected array size ${inputSize * inputSize * 3}, got $size")
                return
            }

            val inputBuffer = ByteBuffer.allocateDirect(4 * inputSize * inputSize * 3).apply {
                order(ByteOrder.nativeOrder())
            }

            // Normalize to [0.0, 1.0]
            for (i in 0 until size) {
                val pixelVal = imageData.getDouble(i).toFloat()
                inputBuffer.putFloat(pixelVal / 255.0f)
            }
            inputBuffer.rewind()

            // Outputs:
            // Output 0: landmarks [1, 1, 1, 1404] (468 landmarks * 3) -> 1404 floats -> 5616 bytes
            // Output 1: confidence/presence [1, 1, 1, 1] -> 1 float -> 4 bytes
            val outputLandmarksBuffer = ByteBuffer.allocateDirect(1404 * 4).apply {
                order(ByteOrder.nativeOrder())
            }
            val outputPresenceBuffer = ByteBuffer.allocateDirect(1 * 4).apply {
                order(ByteOrder.nativeOrder())
            }

            val outputs = HashMap<Int, Any>()
            outputs[0] = outputLandmarksBuffer
            outputs[1] = outputPresenceBuffer

            interpreter.runForMultipleInputsOutputs(arrayOf(inputBuffer), outputs)

            outputLandmarksBuffer.rewind()
            outputPresenceBuffer.rewind()

            val presence = outputPresenceBuffer.getFloat()
            val result = WritableNativeArray()
            
            // For benchmarks we return the landmarks anyway, or if presence is high enough.
            // But let's follow the model presence score. If it's a benchmark with mock data (uniform pixels),
            // presence might be close to 0. So we return empty array, which is correct pipeline behavior.
            if (presence > 0.5f) {
                for (i in 0 until 1404) {
                    result.pushDouble(outputLandmarksBuffer.getFloat().toDouble())
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", "Error during FaceMesh inference: ${e.message}", e)
        }
    }
}
