import {faceObservation} from './presence.js';

function loadScript(path){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('Local face runtime unavailable'))};document.head.append(s)})}
async function cpuFaceEngine(){
  if(!window.tf)await loadScript(window.MIZ.base+'/vendor/tf.min.js');
  if(!window.tf.wasm)await loadScript(window.MIZ.base+'/vendor/tf-backend-wasm.min.js');
  const tf=window.tf;tf.wasm.setWasmPaths(window.MIZ.base+'/vendor/tfwasm/');tf.wasm.setThreadsCount(1);
  if(tf.getBackend()!=='wasm'){try{await tf.setBackend('wasm');await tf.ready()}catch{await tf.setBackend('cpu');await tf.ready()}}
  if(!window.faceLandmarksDetection)await loadScript(window.MIZ.base+'/vendor/face-landmarks-detection.min.js');
  const api=window.faceLandmarksDetection,net=await api.createDetector(api.SupportedModels.MediaPipeFaceMesh,{runtime:'tfjs',maxFaces:1,refineLandmarks:false,detectorModelUrl:window.MIZ.base+'/models/face-detector/model.json',landmarkModelUrl:window.MIZ.base+'/models/face-mesh/model.json'});
  const frame=document.createElement('canvas'),context=frame.getContext('2d',{willReadFrequently:true});
  return {async detect(video){
    const width=video.videoWidth||video.width,height=video.videoHeight||video.height;if(!width||!height)return null;
    frame.width=Math.min(640,width);frame.height=Math.round(frame.width*height/width);context.drawImage(video,0,0,frame.width,frame.height);
    const faces=await net.estimateFaces(frame,{flipHorizontal:false,staticImageMode:false});
    if(!faces.length)return null;
    return faceObservation(faces[0].keypoints.map(p=>({x:p.x/frame.width,y:p.y/frame.height,z:p.z})),{aspectRatio:frame.width/frame.height});
  }};
}
export async function createFaceEngine(){
  const probe=document.createElement('canvas'),gl=probe.getContext('webgl2')||probe.getContext('webgl');
  if(gl){
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    try{
      const {FilesetResolver,FaceLandmarker}=await import('./vendor/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(window.MIZ.base+'/vendor/wasm');
      const net=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:window.MIZ.base+'/models/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:true});
      let fallback;return {async detect(video,now){
        if(fallback)return fallback.detect(video,now);
        try{const result=net.detectForVideo(video,now);return faceObservation(result.faceLandmarks[0],{blendshapes:result.faceBlendshapes[0]?.categories,aspectRatio:video.videoWidth/video.videoHeight})}
        catch{net.close();fallback=await cpuFaceEngine();return fallback.detect(video,now)}
      }};
    }catch{/* The complete local TFJS/WASM route also supports browsers without WebGL. */}
  }
  return cpuFaceEngine();
}
