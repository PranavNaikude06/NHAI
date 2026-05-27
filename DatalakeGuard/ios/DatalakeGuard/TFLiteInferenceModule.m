#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TFLiteInference, NSObject)

RCT_EXTERN_METHOD(ping:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(runBlazeFace:(NSArray *)imageData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(runFaceNet:(NSArray *)croppedImageData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end


@interface RCT_EXTERN_MODULE(MediaPipeLandmark, NSObject)

RCT_EXTERN_METHOD(runFaceMesh:(NSArray *)imageData
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
