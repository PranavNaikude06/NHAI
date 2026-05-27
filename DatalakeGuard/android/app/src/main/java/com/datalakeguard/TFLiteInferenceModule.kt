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

class TFLiteInferenceModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var blazeFaceInterpreter: Interpreter? = null
    private var faceNetInterpreter: Interpreter? = null

    override fun getName(): String {
        return "TFLiteInference"
    }

    init {
        try {
            loadModels()
        } catch (e: Exception) {
            Log.e("TFLiteInference", "Error loading models in init: ${e.message}")
        }
    }

    private fun loadModels() {
        val options = Interpreter.Options().apply {
            setNumThreads(4)
        }
        
        blazeFaceInterpreter = Interpreter(loadModelFile("blazeface.tflite"), options)
        faceNetInterpreter = Interpreter(loadModelFile("mobilefacenet.tflite"), options)
        
        Log.d("TFLiteInference", "Models loaded successfully.")
        
        // Log tensor details for debugging
        blazeFaceInterpreter?.let { interpreter ->
            val inputShape = interpreter.getInputTensor(0).shape()
            val outputShape = interpreter.getOutputTensor(0).shape()
            Log.e("TFLiteInference", "BlazeFace - Input Shape: ${inputShape.contentToString()}, Input Bytes: ${interpreter.getInputTensor(0).numBytes()}, Output Shape: ${outputShape.contentToString()}")
        }
        
        faceNetInterpreter?.let { interpreter ->
            val inputShape = interpreter.getInputTensor(0).shape()
            val outputShape = interpreter.getOutputTensor(0).shape()
            Log.e("TFLiteInference", "FaceNet - Input Shape: ${inputShape.contentToString()}, Input Bytes: ${interpreter.getInputTensor(0).numBytes()}, Output Shape: ${outputShape.contentToString()}")
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
    fun ping(promise: Promise) {
        promise.resolve("bridge_ok")
    }

    @ReactMethod
    fun runBlazeFace(imageData: ReadableArray, promise: Promise) {
        val interpreter = blazeFaceInterpreter
        if (interpreter == null) {
            promise.reject("MODEL_ERROR", "BlazeFace model is not loaded")
            return
        }

        try {
            // BlazeFace input is typically 128x128x3 float32
            val inputSize = 128
            val inputBuffer = ByteBuffer.allocateDirect(4 * inputSize * inputSize * 3).apply {
                order(ByteOrder.nativeOrder())
            }

            // Populate buffer from imageData (should be 128*128*3 elements of RGB values [0, 255])
            val size = imageData.size()
            if (size != inputSize * inputSize * 3) {
                promise.reject("INPUT_ERROR", "Expected array size ${inputSize * inputSize * 3}, got $size")
                return
            }

            for (i in 0 until size) {
                val pixelVal = imageData.getDouble(i).toFloat()
                // Normalize to [0.0, 1.0]
                inputBuffer.putFloat(pixelVal / 255.0f)
            }
            inputBuffer.rewind()

            // Run inference
            // Short range model outputs:
            // Output 0: regressions [1, 896, 16]
            // Output 1: scores [1, 896, 1]
            val outputRegressions = Array(1) { Array(896) { FloatArray(16) } }
            val outputScores = Array(1) { Array(896) { FloatArray(1) } }

            val outputs = HashMap<Int, Any>()
            outputs[0] = outputRegressions
            outputs[1] = outputScores

            interpreter.runForMultipleInputsOutputs(arrayOf(inputBuffer), outputs)

            // Find best bounding box
            var maxScore = -1.0f
            var bestIdx = -1
            for (i in 0 until 896) {
                val score = outputScores[0][i][0]
                // Apply sigmoid since scores are raw logits in some models, or direct if already sigmoid
                // Let's assume sigmoid for raw logits or direct if between 0 and 1.
                // MediaPipe outputs are already sigmoid/probability in most configs.
                if (score > maxScore) {
                    maxScore = score
                    bestIdx = i
                }
            }

            val result = WritableNativeArray()
            if (bestIdx != -1 && maxScore > 0.5f) {
                val box = outputRegressions[0][bestIdx]
                // box contains: dx, dy, dw, dh, and keypoints
                // The box coordinates are normalized or relative.
                // Let's just output the regressions for the best box: [x, y, w, h, confidence]
                // For simplicity, we can pass back the box values or calculate actual pixels.
                // The PRD says it returns bounding box [x, y, w, h]
                // Let's return: x, y, w, h, and confidence
                result.pushDouble(box[0].toDouble())
                result.pushDouble(box[1].toDouble())
                result.pushDouble(box[2].toDouble())
                result.pushDouble(box[3].toDouble())
                result.pushDouble(maxScore.toDouble())
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", "Error during BlazeFace inference: ${e.message}", e)
        }
    }

    private fun applyCLAHE(
        rgbData: FloatArray,
        width: Int,
        height: Int,
        clipLimit: Float,
        tileGridW: Int,
        tileGridH: Int
    ): FloatArray {
        val numBins = 256
        val tileWidth = width / tileGridW
        val tileHeight = height / tileGridH
        val tilePixels = tileWidth * tileHeight

        // 1. Calculate Y (luminance) for the entire image
        val Y = FloatArray(width * height)
        for (i in 0 until width * height) {
            val r = rgbData[i * 3]
            val g = rgbData[i * 3 + 1]
            val b = rgbData[i * 3 + 2]
            Y[i] = 0.299f * r + 0.587f * g + 0.114f * b
        }

        // 2. Compute histogram for each tile
        val histograms = Array(tileGridH) { Array(tileGridW) { IntArray(numBins) } }
        for (ty in 0 until tileGridH) {
            for (tx in 0 until tileGridW) {
                val hist = histograms[ty][tx]
                for (y in ty * tileHeight until (ty + 1) * tileHeight) {
                    for (x in tx * tileWidth until (tx + 1) * tileWidth) {
                        val idx = y * width + x
                        val valInt = Y[idx].toInt().coerceIn(0, 255)
                        hist[valInt]++
                    }
                }

                // Apply clipping to each tile's histogram
                val limit = (clipLimit * tilePixels / numBins).toInt().coerceAtLeast(1)
                var clipped = 0
                for (b in 0 until numBins) {
                    if (hist[b] > limit) {
                        clipped += hist[b] - limit
                        hist[b] = limit
                    }
                }

                val redist = clipped / numBins
                val remainder = clipped % numBins
                for (b in 0 until numBins) {
                    hist[b] += redist
                }
                for (b in 0 until remainder) {
                    hist[b]++
                }

                // Compute CDF
                val cdf = FloatArray(numBins)
                var sum = 0
                for (b in 0 until numBins) {
                    sum += hist[b]
                    cdf[b] = sum.toFloat() / tilePixels
                }
                // Scale mapping to [0, 255]
                for (b in 0 until numBins) {
                    hist[b] = (cdf[b] * 255.0f).toInt().coerceIn(0, 255)
                }
            }
        }

        // 3. Bilinear interpolation of mapped luminance values
        val outputY = FloatArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val valInt = Y[y * width + x].toInt().coerceIn(0, 255)

                val fx = (x - tileWidth / 2.0f) / tileWidth
                val fy = (y - tileHeight / 2.0f) / tileHeight

                val tx0 = Math.floor(fx.toDouble()).toInt().coerceIn(0, tileGridW - 1)
                val ty0 = Math.floor(fy.toDouble()).toInt().coerceIn(0, tileGridH - 1)
                val tx1 = (tx0 + 1).coerceAtMost(tileGridW - 1)
                val ty1 = (ty0 + 1).coerceAtMost(tileGridH - 1)

                val wx = fx - tx0
                val wy = fy - ty0

                val mappedVal = if (tx0 == tx1 && ty0 == ty1) {
                    histograms[ty0][tx0][valInt].toFloat()
                } else if (tx0 == tx1) {
                    val valY0 = histograms[ty0][tx0][valInt]
                    val valY1 = histograms[ty1][tx0][valInt]
                    (1 - wy) * valY0 + wy * valY1
                } else if (ty0 == ty1) {
                    val valX0 = histograms[ty0][tx0][valInt]
                    val valX1 = histograms[ty0][tx1][valInt]
                    (1 - wx) * valX0 + wx * valX1
                } else {
                    val val00 = histograms[ty0][tx0][valInt]
                    val val01 = histograms[ty0][tx1][valInt]
                    val val10 = histograms[ty1][tx0][valInt]
                    val val11 = histograms[ty1][tx1][valInt]

                    (1 - wx) * (1 - wy) * val00 +
                            wx * (1 - wy) * val01 +
                            (1 - wx) * wy * val10 +
                            wx * wy * val11
                }
                outputY[y * width + x] = mappedVal
            }
        }

        // 4. Reconstruct color image preserving original ratio
        val outRGB = FloatArray(width * height * 3)
        for (i in 0 until width * height) {
            val oldY = Y[i]
            val newY = outputY[i]
            val ratio = if (oldY > 0.0f) newY / oldY else 0.0f

            outRGB[i * 3] = (rgbData[i * 3] * ratio).coerceIn(0.0f, 255.0f)
            outRGB[i * 3 + 1] = (rgbData[i * 3 + 1] * ratio).coerceIn(0.0f, 255.0f)
            outRGB[i * 3 + 2] = (rgbData[i * 3 + 2] * ratio).coerceIn(0.0f, 255.0f)
        }
        return outRGB
    }

    @ReactMethod
    fun runFaceNet(
        croppedImageData: ReadableArray,
        enableCLAHE: Boolean,
        clipLimit: Double,
        tileSize: Double,
        promise: Promise
    ) {
        val interpreter = faceNetInterpreter
        if (interpreter == null) {
            promise.reject("MODEL_ERROR", "MobileFaceNet model is not loaded")
            return
        }

        try {
            // MobileFaceNet input is [2, 112, 112, 3] float32
            val inputSize = 112
            val size = croppedImageData.size()
            if (size != inputSize * inputSize * 3) {
                promise.reject("INPUT_ERROR", "Expected array size ${inputSize * inputSize * 3}, got $size")
                return
            }

            // Extract to FloatArray
            val rawFloats = FloatArray(size)
            for (i in 0 until size) {
                rawFloats[i] = croppedImageData.getDouble(i).toFloat()
            }

            // Apply CLAHE if enabled
            val processedFloats = if (enableCLAHE) {
                applyCLAHE(rawFloats, inputSize, inputSize, clipLimit.toFloat(), tileSize.toInt(), tileSize.toInt())
            } else {
                rawFloats
            }

            // Allocate buffer for 2 batch items: 2 * 112 * 112 * 3 * 4 bytes = 301,056 bytes
            val inputBuffer = ByteBuffer.allocateDirect(2 * 4 * inputSize * inputSize * 3).apply {
                order(ByteOrder.nativeOrder())
            }

            // Duplicate the crop data for batch size of 2
            for (b in 0 until 2) {
                for (i in 0 until size) {
                    val pixelVal = processedFloats[i]
                    inputBuffer.putFloat((pixelVal - 127.5f) / 128.0f)
                }
            }
            inputBuffer.rewind()

            // Output tensor shape is [2, 192] float32 embedding -> 2 * 192 * 4 = 1536 bytes
            val outputBuffer = ByteBuffer.allocateDirect(2 * 192 * 4).apply {
                order(ByteOrder.nativeOrder())
            }
            interpreter.run(inputBuffer, outputBuffer)
            outputBuffer.rewind()

            val result = WritableNativeArray()
            // Extract the first embedding in the batch (192 floats)
            for (i in 0 until 192) {
                result.pushDouble(outputBuffer.getFloat().toDouble())
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", "Error during MobileFaceNet inference: ${e.message}", e)
        }
    }
}
