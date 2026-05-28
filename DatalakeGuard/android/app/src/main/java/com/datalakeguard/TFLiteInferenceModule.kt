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
import java.util.concurrent.Executors
import java.util.concurrent.Callable
import java.util.concurrent.Future

class TFLiteInferenceModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var blazeFaceInterpreter: Interpreter? = null
    private var faceNetInterpreter: Interpreter? = null
    private var faceMeshInterpreter: Interpreter? = null
    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String {
        return "TFLiteInference"
    }

    override fun invalidate() {
        super.invalidate()
        executor.shutdown()
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
        
        Log.d("TFLiteInference", "Models loaded successfully (FaceMesh dropped).")
        
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
                result.pushDouble(box[0].toDouble())
                result.pushDouble(box[1].toDouble())
                result.pushDouble(box[2].toDouble())
                result.pushDouble(box[3].toDouble())
                result.pushDouble(maxScore.toDouble())
                for (j in 4 until 16) {
                    result.pushDouble(box[j].toDouble())
                }
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
        val totalTiles = tileGridW * tileGridH

        // 1. Calculate Y (luminance) for the entire image
        val Y = FloatArray(width * height)
        for (i in 0 until width * height) {
            Y[i] = 0.299f * rgbData[i * 3] + 0.587f * rgbData[i * 3 + 1] + 0.114f * rgbData[i * 3 + 2]
        }

        // Flat histograms array to avoid extensive allocations
        val histograms = IntArray(totalTiles * numBins)

        // 2. Compute histogram for each tile
        for (ty in 0 until tileGridH) {
            val yStart = ty * tileHeight
            val yEnd = yStart + tileHeight
            val tyOffset = ty * tileGridW * numBins
            
            for (tx in 0 until tileGridW) {
                val xStart = tx * tileWidth
                val xEnd = xStart + tileWidth
                val histOffset = tyOffset + tx * numBins
                
                for (y in yStart until yEnd) {
                    val rowOffset = y * width
                    for (x in xStart until xEnd) {
                        val idx = rowOffset + x
                        val valInt = Y[idx].toInt().coerceIn(0, 255)
                        histograms[histOffset + valInt]++
                    }
                }

                // Apply clipping to each tile's histogram
                val limit = (clipLimit * tilePixels / numBins).toInt().coerceAtLeast(1)
                var clipped = 0
                for (b in 0 until numBins) {
                    val hVal = histograms[histOffset + b]
                    if (hVal > limit) {
                        clipped += hVal - limit
                        histograms[histOffset + b] = limit
                    }
                }

                val redist = clipped / numBins
                val remainder = clipped % numBins
                for (b in 0 until numBins) {
                    histograms[histOffset + b] += redist
                }
                for (b in 0 until remainder) {
                    histograms[histOffset + b]++
                }

                // Compute CDF in-place scaling to [0, 255]
                var sum = 0
                for (b in 0 until numBins) {
                    sum += histograms[histOffset + b]
                    histograms[histOffset + b] = ((sum.toFloat() / tilePixels) * 255.0f).toInt().coerceIn(0, 255)
                }
            }
        }

        // 3. Bilinear interpolation of mapped luminance values
        val outputY = FloatArray(width * height)
        val invTileWidth = 1.0f / tileWidth
        val invTileHeight = 1.0f / tileHeight

        for (y in 0 until height) {
            val fy = (y - tileHeight / 2.0f) * invTileHeight
            val fyFloor = if (fy >= 0.0f) fy.toInt() else fy.toInt() - 1
            val ty0 = fyFloor.coerceIn(0, tileGridH - 1)
            val ty1 = (ty0 + 1).coerceAtMost(tileGridH - 1)
            val wy = fy - ty0

            val ty0Offset = ty0 * tileGridW * numBins
            val ty1Offset = ty1 * tileGridW * numBins
            val yRowOffset = y * width

            for (x in 0 until width) {
                val valInt = Y[yRowOffset + x].toInt().coerceIn(0, 255)

                val fx = (x - tileWidth / 2.0f) * invTileWidth
                val fxFloor = if (fx >= 0.0f) fx.toInt() else fx.toInt() - 1
                val tx0 = fxFloor.coerceIn(0, tileGridW - 1)
                val tx1 = (tx0 + 1).coerceAtMost(tileGridW - 1)
                val wx = fx - tx0

                val mappedVal = if (tx0 == tx1 && ty0 == ty1) {
                    histograms[ty0Offset + tx0 * numBins + valInt].toFloat()
                } else if (tx0 == tx1) {
                    val valY0 = histograms[ty0Offset + tx0 * numBins + valInt]
                    val valY1 = histograms[ty1Offset + tx0 * numBins + valInt]
                    (1.0f - wy) * valY0 + wy * valY1
                } else if (ty0 == ty1) {
                    val valX0 = histograms[ty0Offset + tx0 * numBins + valInt]
                    val valX1 = histograms[ty0Offset + tx1 * numBins + valInt]
                    (1.0f - wx) * valX0 + wx * valX1
                } else {
                    val val00 = histograms[ty0Offset + tx0 * numBins + valInt]
                    val val01 = histograms[ty0Offset + tx1 * numBins + valInt]
                    val val10 = histograms[ty1Offset + tx0 * numBins + valInt]
                    val val11 = histograms[ty1Offset + tx1 * numBins + valInt]

                    (1.0f - wx) * (1.0f - wy) * val00 +
                            wx * (1.0f - wy) * val01 +
                            (1.0f - wx) * wy * val10 +
                            wx * wy * val11
                }
                outputY[yRowOffset + x] = mappedVal
            }
        }

        // 4. Reconstruct color image preserving original ratio in-place
        for (i in 0 until width * height) {
            val oldY = Y[i]
            val newY = outputY[i]
            val ratio = if (oldY > 0.0f) newY / oldY else 0.0f

            rgbData[i * 3] = (rgbData[i * 3] * ratio).coerceIn(0.0f, 255.0f)
            rgbData[i * 3 + 1] = (rgbData[i * 3 + 1] * ratio).coerceIn(0.0f, 255.0f)
            rgbData[i * 3 + 2] = (rgbData[i * 3 + 2] * ratio).coerceIn(0.0f, 255.0f)
        }
        return rgbData
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

    private fun resizeRGBNative(
        pixels: FloatArray,
        srcWidth: Int,
        srcHeight: Int,
        targetWidth: Int,
        targetHeight: Int
    ): FloatArray {
        val result = FloatArray(targetWidth * targetHeight * 3)
        val scaleX = srcWidth.toFloat() / targetWidth
        val scaleY = srcHeight.toFloat() / targetHeight
        for (cy in 0 until targetHeight) {
            val srcY = Math.min(srcHeight - 1, (cy * scaleY).toInt())
            val rowOffset = srcY * srcWidth
            val destRowOffset = cy * targetWidth
            for (cx in 0 until targetWidth) {
                val srcX = Math.min(srcWidth - 1, (cx * scaleX).toInt())
                val srcIdx = (rowOffset + srcX) * 3
                val destIdx = (destRowOffset + cx) * 3

                result[destIdx] = pixels[srcIdx]
                result[destIdx + 1] = pixels[srcIdx + 1]
                result[destIdx + 2] = pixels[srcIdx + 2]
            }
        }
        return result
    }

    private fun cropAndResizeRGBNative(
        pixels: FloatArray,
        srcWidth: Int,
        srcHeight: Int,
        x: Float,
        y: Float,
        width: Float,
        height: Float,
        targetWidth: Int,
        targetHeight: Int
    ): FloatArray {
        val isNormalized = x in 0.0f..1.0f && width in 0.0f..1.0f
        
        val xStart = Math.max(0, (if (isNormalized) x * srcWidth else x).toInt())
        val yStart = Math.max(0, (if (isNormalized) y * srcHeight else y).toInt())
        val cropW = Math.max(1, (if (isNormalized) width * srcWidth else width).toInt())
        val cropH = Math.max(1, (if (isNormalized) height * srcHeight else height).toInt())

        val result = FloatArray(targetWidth * targetHeight * 3)
        val scaleX = cropW.toFloat() / targetWidth
        val scaleY = cropH.toFloat() / targetHeight

        for (cy in 0 until targetHeight) {
            val srcY = Math.min(srcHeight - 1, yStart + (cy * scaleY).toInt())
            val rowOffset = srcY * srcWidth
            val destRowOffset = cy * targetWidth
            
            for (cx in 0 until targetWidth) {
                val srcX = Math.min(srcWidth - 1, xStart + (cx * scaleX).toInt())
                val srcIdx = (rowOffset + srcX) * 3
                val destIdx = (destRowOffset + cx) * 3

                result[destIdx] = pixels[srcIdx]
                result[destIdx + 1] = pixels[srcIdx + 1]
                result[destIdx + 2] = pixels[srcIdx + 2]
            }
        }
        return result
    }

    @ReactMethod
    fun runFullPipeline(
        imageData: ReadableArray,
        srcWidth: Int,
        srcHeight: Int,
        enableCLAHE: Boolean,
        clipLimit: Double,
        tileSize: Double,
        promise: Promise
    ) {
        val blazeFace = blazeFaceInterpreter
        val faceNet = faceNetInterpreter
        if (blazeFace == null || faceNet == null) {
            promise.reject("MODEL_ERROR", "Models are not fully loaded")
            return
        }

        try {
            val totalSize = imageData.size()
            val rawFloats = FloatArray(totalSize)
            for (i in 0 until totalSize) {
                rawFloats[i] = imageData.getDouble(i).toFloat()
            }

            // 1. Run BlazeFace
            val blazeFaceInput = if (totalSize == 128 * 128 * 3) {
                rawFloats
            } else {
                resizeRGBNative(rawFloats, srcWidth, srcHeight, 128, 128)
            }

            val blazeFaceInputBuffer = ByteBuffer.allocateDirect(4 * 128 * 128 * 3).apply {
                order(ByteOrder.nativeOrder())
            }
            for (i in 0 until 128 * 128 * 3) {
                blazeFaceInputBuffer.putFloat(blazeFaceInput[i] / 255.0f)
            }
            blazeFaceInputBuffer.rewind()

            val outputRegressions = Array(1) { Array(896) { FloatArray(16) } }
            val outputScores = Array(1) { Array(896) { FloatArray(1) } }

            val outputs = HashMap<Int, Any>()
            outputs[0] = outputRegressions
            outputs[1] = outputScores

            blazeFace.runForMultipleInputsOutputs(arrayOf(blazeFaceInputBuffer), outputs)

            var maxScore = -1.0f
            var bestIdx = -1
            for (i in 0 until 896) {
                val score = outputScores[0][i][0]
                if (score > maxScore) {
                    maxScore = score
                    bestIdx = i
                }
            }

            if (bestIdx == -1 || maxScore <= 0.5f) {
                val result = Arguments.createMap().apply {
                    putBoolean("faceDetected", false)
                    putNull("identity")
                    putDouble("confidence", 0.0)
                    putArray("landmarks", WritableNativeArray())
                    putArray("box", WritableNativeArray())
                }
                promise.resolve(result)
                return
            }

            val box = outputRegressions[0][bestIdx]
            val boxArray = WritableNativeArray().apply {
                pushDouble(box[0].toDouble())
                pushDouble(box[1].toDouble())
                pushDouble(box[2].toDouble())
                pushDouble(box[3].toDouble())
                pushDouble(maxScore.toDouble())
            }

            // 2. Crop FaceNet input (112x112)
            val croppedFaceNet = cropAndResizeRGBNative(
                rawFloats,
                srcWidth,
                srcHeight,
                box[0],
                box[1],
                box[2],
                box[3],
                112,
                112
            )

            // 3. Run CLAHE on FaceNet crop
            val processedFaceNet = if (enableCLAHE) {
                applyCLAHE(croppedFaceNet, 112, 112, clipLimit.toFloat(), tileSize.toInt(), tileSize.toInt())
            } else {
                croppedFaceNet
            }

            // 4. Run FaceNet
            val inputBuffer = ByteBuffer.allocateDirect(2 * 4 * 112 * 112 * 3).apply {
                order(ByteOrder.nativeOrder())
            }
            for (b in 0 until 2) {
                for (i in 0 until 112 * 112 * 3) {
                    val pixelVal = processedFaceNet[i]
                    inputBuffer.putFloat((pixelVal - 127.5f) / 128.0f)
                }
            }
            inputBuffer.rewind()

            val outputBuffer = ByteBuffer.allocateDirect(2 * 192 * 4).apply {
                order(ByteOrder.nativeOrder())
            }
            faceNet.run(inputBuffer, outputBuffer)
            outputBuffer.rewind()

            val embedding = FloatArray(192)
            for (i in 0 until 192) {
                embedding[i] = outputBuffer.getFloat()
            }

            // 5. Vector search match in native memory cache
            val matchResult = VectorSearchEngine.findBestMatch(embedding)

            // 6. Get BlazeFace keypoints as landmarks to drop FaceMesh
            val landmarksArray = WritableNativeArray()
            for (k in 0 until 6) {
                val kpY = box[4 + k * 2]
                val kpX = box[4 + k * 2 + 1]
                landmarksArray.pushDouble(kpX.toDouble())
                landmarksArray.pushDouble(kpY.toDouble())
                landmarksArray.pushDouble(0.0) // z = 0
            }

            // 8. Construct result WritableMap
            val result = Arguments.createMap().apply {
                putBoolean("faceDetected", true)
                putString("identity", matchResult.userId)
                putDouble("confidence", matchResult.similarity.toDouble())
                putArray("landmarks", landmarksArray)
                putArray("box", boxArray)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", "Error during full pipeline inference: ${e.message}", e)
        }
    }
}
