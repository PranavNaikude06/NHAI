import Foundation
import React
import TensorFlowLite

@objc(TFLiteInference)
class TFLiteInference: NSObject, RCTBridgeModule {
  
  static func moduleName() -> String! {
    return "TFLiteInference"
  }
  
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  private var blazeFaceInterpreter: Interpreter?
  private var faceNetInterpreter: Interpreter?

  override init() {
    super.init()
    loadModels()
  }

  private func loadModels() {
    // Locate model files in the iOS main app bundle
    guard let blazeFacePath = Bundle.main.path(forResource: "blazeface", ofType: "tflite"),
          let faceNetPath = Bundle.main.path(forResource: "mobilefacenet", ofType: "tflite") else {
      print("TFLiteInference: Model files not found in main bundle assets.")
      return
    }

    do {
      var options = Interpreter.Options()
      options.threadCount = 4
      
      blazeFaceInterpreter = try Interpreter(modelPath: blazeFacePath, options: options)
      faceNetInterpreter = try Interpreter(modelPath: faceNetPath, options: options)
      
      try blazeFaceInterpreter?.allocateTensors()
      try faceNetInterpreter?.allocateTensors()
      
      print("TFLiteInference: Both models loaded and allocated successfully.")
    } catch {
      print("TFLiteInference: Error initializing TFLite models: \(error.localizedDescription)")
    }
  }

  @objc(ping:rejecter:)
  func ping(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve("bridge_ok")
  }

  @objc(runBlazeFace:resolver:rejecter:)
  func runBlazeFace(_ imageData: [Double], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let interpreter = blazeFaceInterpreter else {
      reject("MODEL_ERROR", "BlazeFace model is not loaded", nil)
      return
    }

    do {
      let inputSize = 128
      let expectedSize = inputSize * inputSize * 3
      guard imageData.count == expectedSize else {
        reject("INPUT_ERROR", "Expected array size \(expectedSize), got \(imageData.count)", nil)
        return
      }

      // Preprocess image bytes to float array (normalized to [0, 1])
      var floatArray = [Float]()
      floatArray.reserveCapacity(expectedSize)
      for val in imageData {
        floatArray.append(Float(val) / 255.0)
      }

      // Convert float array to Data
      let inputData = Data(bytes: floatArray, count: floatArray.count * MemoryLayout<Float>.size)
      try interpreter.copy(inputData, toInputAt: 0)
      
      // Run inference
      try interpreter.invoke()
      
      // Output 0: regressions [1, 896, 16]
      // Output 1: scores [1, 896, 1]
      let outputRegressionsTensor = try interpreter.outputTensor(at: 0)
      let outputScoresTensor = try interpreter.outputTensor(at: 1)
      
      let regressions = outputRegressionsTensor.data.withUnsafeBytes {
        Array($0.bindMemory(to: Float.self))
      }
      let scores = outputScoresTensor.data.withUnsafeBytes {
        Array($0.bindMemory(to: Float.self))
      }

      // Find best scoring detection
      var maxScore: Float = -1.0
      var bestIdx = -1
      
      for i in 0..<896 {
        let score = scores[i]
        if score > maxScore {
          maxScore = score
          bestIdx = i
        }
      }

      var result: [Double] = []
      if bestIdx != -1 && maxScore > 0.5 {
        let offset = bestIdx * 16
        // box contains x, y, w, h in the first 4 elements
        let x = Double(regressions[offset])
        let y = Double(regressions[offset + 1])
        let w = Double(regressions[offset + 2])
        let h = Double(regressions[offset + 3])
        
        result.append(x)
        result.append(y)
        result.append(w)
        result.append(h)
        result.append(Double(maxScore))
      }

      resolve(result)
    } catch {
      reject("INFERENCE_ERROR", "Error during BlazeFace inference: \(error.localizedDescription)", error)
    }
  }

  @objc(runFaceNet:resolver:rejecter:)
  func runFaceNet(_ croppedImageData: [Double], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let interpreter = faceNetInterpreter else {
      reject("MODEL_ERROR", "MobileFaceNet model is not loaded", nil)
      return
    }

    do {
      let inputSize = 112
      let expectedSize = inputSize * inputSize * 3
      guard croppedImageData.count == expectedSize else {
        reject("INPUT_ERROR", "Expected array size \(expectedSize), got \(croppedImageData.count)", nil)
        return
      }

      // Preprocess image bytes to float array (normalized to [-1, 1])
      var floatArray = [Float]()
      floatArray.reserveCapacity(expectedSize)
      for val in croppedImageData {
        floatArray.append((Float(val) - 127.5) / 128.0)
      }

      // Convert float array to Data
      let inputData = Data(bytes: floatArray, count: floatArray.count * MemoryLayout<Float>.size)
      try interpreter.copy(inputData, toInputAt: 0)
      
      // Run inference
      try interpreter.invoke()
      
      // Output is [1, 128] float embedding
      let outputTensor = try interpreter.outputTensor(at: 0)
      let embeddings = outputTensor.data.withUnsafeBytes {
        Array($0.bindMemory(to: Float.self))
      }

      let result = embeddings.map { Double($0) }
      resolve(result)
    } catch {
      reject("INFERENCE_ERROR", "Error during MobileFaceNet inference: \(error.localizedDescription)", error)
    }
  }
}
