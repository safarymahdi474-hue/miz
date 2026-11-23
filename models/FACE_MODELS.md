# Local face models and licenses

Copyright Google LLC / TensorFlow Authors. All model and package files below are distributed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0 . Bundles retain their license headers. Downloaded from primary official distributions on 31 October 2026; no model was converted or modified.

## MediaPipe Face Landmarker

- Local: `/models/face_landmarker.task` (3,758,596 bytes).
- Official version: float16, version 1.
- Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- SHA256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Official model card (Apache 2.0): https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
- API guide: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Uses the existing self-hosted `@mediapipe/tasks-vision` 0.10.21 vision bundle and WASM files. The bundle contains face detection, face landmarks, geometry metadata and face blendshapes. No additional models are needed for the MediaPipe API.

## TensorFlow.js fallback

- `/vendor/face-landmarks-detection.min.js`: `@tensorflow-models/face-landmarks-detection` 1.0.6, https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection@1.0.6/dist/face-landmarks-detection.min.js . UMD global: `faceLandmarksDetection`. TFJS face detection is included in this browser bundle. Requires the existing TFJS 4.22.0 bundle and WASM backend. Does not require MediaPipe FaceMesh runtime for `{runtime: 'tfjs'}`.
- Official package repository and Apache license: https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection
- WASM support documentation explicitly includes Face landmarks detection: https://github.com/tensorflow/tfjs/blob/master/tfjs-backend-wasm/README.md

### FaceMesh (no attention/iris refinement)

- Local graph: `/models/face-mesh/model.json`
- Local weights: `/models/face-mesh/group1-shard1of1.bin` (1,477,958 bytes, exact manifest byte count verified).
- Official graph download: https://tfhub.dev/mediapipe/tfjs-model/face_landmarks_detection/face_mesh/1/model.json?tfjs-format=file
- Official weights download: https://tfhub.dev/mediapipe/tfjs-model/face_landmarks_detection/face_mesh/1/group1-shard1of1.bin?tfjs-format=file
- Weight SHA256: `3826da640b0a3021161605369ee6af293f75d518040355b960ec71a3390c1c0b`

### Short-range face detector

- Local graph: `/models/face-detector/model.json`
- Local weights: `/models/face-detector/group1-shard1of1.bin` (201,268 bytes, exact manifest byte count verified).
- Official graph download: https://tfhub.dev/mediapipe/tfjs-model/face_detection/short/1/model.json?tfjs-format=file
- Official weights download: https://tfhub.dev/mediapipe/tfjs-model/face_detection/short/1/group1-shard1of1.bin?tfjs-format=file
- Weight SHA256: `e9b69ee1c1f8cd33c58120bcd75bf8c56bfba20c880f447e9d293ec102059d4b`

### Integration contract

```js
await tf.setBackend('wasm');
await tf.ready();
const detector = await faceLandmarksDetection.createDetector(
  faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
  {runtime:'tfjs', maxFaces:1, refineLandmarks:false,
   detectorModelUrl:'/models/face-detector/model.json',
   landmarkModelUrl:'/models/face-mesh/model.json'}
);
const faces = await detector.estimateFaces(video, {flipHorizontal:false, staticImageMode:false});
```

`faces[].keypoints` has 468 points in image pixel coordinates; normalize x and y with video width and height before combining with MediaPipe results. Set `refineLandmarks:false` for this graph; it is not the attention/iris graph. Neither model identifies a person or measures learning. A blink or closed eyes inferred from landmarks needs temporal smoothing and should not be interpreted as a medical condition.

The MediaPipe CPU delegate is documented, but its Web vision preprocessing may still require WebGL. A project maintainer documents this Canvas/WebGL requirement in https://github.com/google-ai-edge/mediapipe/issues/4548 . Therefore the TFJS WASM fallback is retained for environments without WebGL. All runtime paths above are same-origin; camera input stays on the device.


## Local validation

The existing TensorFlow.js 4.22.0 WASM backend and the downloaded FaceMesh 1.0.6 UMD were run in Node with Tensor3D input and local model IOHandlers. A blank image returned zero faces; the official MediaPipe portrait sample returned one face with 468 landmarks. Local IOHandlers preserved the model JSON `signature` aliases as well as topology and weights. This validates the graph/kernel path; camera and browser lifecycle still require browser QA. Test portrait source: https://storage.googleapis.com/mediapipe-assets/portrait.jpg (temporary QA sample, not deployed with the models).

Browser validation: the actual local PoseNet + FaceMesh WASM engines were exercised together with a canvas-captured portrait stream. Presence resumed at center, right and left positions, and stopped on blank frames. Eye closure uses bilateral blink coefficients when available, or aspect-corrected eye geometry on the WASM fallback, with a three-second grace period for ordinary blinks.
