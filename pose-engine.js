// All model assets are served from this Site. Camera pixels stay on the device.
function loadScript(path){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('Unable to load local inference runtime'))};document.head.append(s)})}
async function cpuEngine(){
  if(!window.tf)await loadScript(window.MIZ.base+'/vendor/tf.min.js');
  if(!window.tf.wasm)await loadScript(window.MIZ.base+'/vendor/tf-backend-wasm.min.js');
  const tf=window.tf;
  tf.wasm.setWasmPaths(window.MIZ.base+'/vendor/tfwasm/');
  // One thread also works without cross-origin isolation.
  tf.wasm.setThreadsCount(1);
  try{await tf.setBackend('wasm');await tf.ready()}catch{await tf.setBackend('cpu');await tf.ready()}
  if(!window.posenet)await loadScript(window.MIZ.base+'/vendor/posenet.min.js');
  const net=await window.posenet.load({architecture:'MobileNetV1',outputStride:16,inputResolution:257,multiplier:.5,quantBytes:4,modelUrl:window.MIZ.base+'/models/posenet/model.json'});
  const mapping=[0,2,5,7,8,11,12,13,14,15,16,23,24,25,26,27,28];
  const frame=document.createElement('canvas'),context=frame.getContext('2d',{willReadFrequently:true});
  return {async detect(video){
    // PoseNet's input geometry uses width/height attributes, which are often 0
    // on responsive video elements. Snapshot intrinsic pixels with fixed geometry.
    const width=video.videoWidth||video.width,height=video.videoHeight||video.height;
    if(!width||!height)return null;
    frame.width=width;frame.height=height;context.drawImage(video,0,0,width,height);
    const result=await net.estimateSinglePose(frame,{flipHorizontal:false});
    if(result.score<.12)return null;
    const points=Array.from({length:33},()=>({x:0,y:0,visibility:0}));
    result.keypoints.forEach((p,i)=>{points[mapping[i]]={x:p.position.x/width,y:p.position.y/height,visibility:p.score}});
    return points;
  }};
}
export async function createPoseEngine(){
  const probe=document.createElement('canvas');
  const gl=probe.getContext('webgl2')||probe.getContext('webgl');
  if(gl){
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    try{
      const {FilesetResolver,PoseLandmarker}=await import('./vendor/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(window.MIZ.base+'/vendor/wasm');
      const net=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:window.MIZ.base+'/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5,outputSegmentationMasks:false});
      let fallback;
      return {async detect(video,now){try{return fallback?await fallback.detect(video,now):net.detectForVideo(video,now).landmarks[0]}catch{net.close();fallback=await cpuEngine();return fallback.detect(video,now)}}};
    }catch{/* A local WASM/CPU path supports browsers without usable WebGL. */}
  }
  return cpuEngine();
}
