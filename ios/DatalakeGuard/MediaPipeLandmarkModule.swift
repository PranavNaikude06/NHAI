import Foundation
import React
import TensorFlowLite

@objc(MediaPipeLandmark)
class MediaPipeLandmark: NSObject, RCTBridgeModule {
  
  static func moduleName() -> String! {
    return "MediaPipeLandmark"
  }
  
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  private var faceMeshInterpreter: Interpreter?

  override init() {
    super.init()
    loadModel()
  }

  private func loadModel() {
    // Locate facemesh.tflite in iOS main bundle assets
    guard let faceMeshPath = Bundle.main.path(forResource: "facemesh", ofType: "tflite") else {
      print("MediaPipeLandmark: Facemesh model file not found in main bundle assets.")
      return
    }

    do {
      var options = Interpreter.Options()
      options.threadCount = 4
      
      faceMeshInterpreter = try Interpreter(modelPath: faceMeshPath, options: options)
      try faceMeshInterpreter?.allocateTensors()
      
      print("MediaPipeLandmark: Facemesh model loaded and allocated successfully.")
    } catch {
      print("MediaPipeLandmark: Error initializing FaceMesh model: \(error.localizedDescription)")
    }
  }

  @objc(runFaceMesh:resolver:rejecter:)
  func runFaceMesh(_ imageData: [Double], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let interpreter = faceMeshInterpreter else {
      reject("MODEL_ERROR", "FaceMesh model is not loaded", nil)
      return
    }

    do {
      let inputSize = 192
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
      
      // Output 0: landmarks [1, 1404] (468 landmarks * 3)
      // Output 1: confidence/presence [1, 1]
      let outputLandmarksTensor = try interpreter.outputTensor(at: 0)
      let outputPresenceTensor = try interpreter.outputTensor(at: 1)
      
      let landmarks = outputLandmarksTensor.data.withUnsafeBytes {
        Array($0.bindMemory(to: Float.self))
      }
      let presenceArray = outputPresenceTensor.data.withUnsafeBytes {
        Array($0.bindMemory(to: Float.self))
      }
      
      let presence = presenceArray.first ?? 0.0

      var result: [Double] = []
      // Check if face is present (threshold e.g. 0.5)
      if presence > 0.5 {
        result = landmarks.map { Double($0) }
      }

      resolve(result)
    } catch {
      reject("INFERENCE_ERROR", "Error during FaceMesh inference: \(error.localizedDescription)", error)
    }
  }
}
