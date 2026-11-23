import {StudyClock} from './clock.js';
export function cameraFallbackMessage(error){
 const name=error?.name;
 if(name==='NotFoundError'||name==='DevicesNotFoundError')return 'دوربینی پیدا نشد؛ مطالعه بدون دوربین ادامه دارد.';
 if(name==='NotAllowedError'||name==='PermissionDeniedError')return 'دسترسی دوربین داده نشد؛ مطالعه بدون دوربین ادامه دارد.';
 if(name==='NotReadableError'||name==='TrackStartError')return 'دوربین در دسترس نیست یا در برنامه دیگری استفاده می‌شود؛ مطالعه بدون دوربین ادامه دارد.';
 return 'تشخیص دوربین در دسترس نیست؛ مطالعه بدون دوربین ادامه دارد.';
}
export async function requestStudyCamera(mediaDevices){
 if(typeof mediaDevices?.getUserMedia!=='function')return {stream:null,message:'این دستگاه امکان دوربین ندارد؛ مطالعه بدون دوربین ادامه دارد.'};
 try{return {stream:await mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:24}},audio:false}),message:''}}
 catch(error){return {stream:null,message:cameraFallbackMessage(error)}}
}
export function manualClock(current,now){
 const clock=current||new StudyClock(now);
 // The handover gap must never be credited retroactively.
 clock.observe(now,false);clock.observe(now,true);return clock;
}
