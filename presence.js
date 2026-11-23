const visible=(p,min=.45)=>p&&(p.visibility??1)>=min&&p.x>0&&p.x<1&&p.y>0&&p.y<1;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function angle(a,b,c){const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1))))*180/Math.PI}
export function standingPose(points){
  // Only reject a standing posture when a complete, reliable lower body is
  // visible. The absence of legs in a desk camera is not treated as standing.
  return [[23,25,27],[24,26,28]].some(ids=>{const [hip,knee,ankle]=ids.map(i=>points?.[i]);return [hip,knee,ankle].every(p=>visible(p,.65))&&ankle.y>knee.y&&knee.y>hip.y&&distance(hip,ankle)>.25&&angle(hip,knee,ankle)>165});
}
export function eyeAspectRatio(points,ids,aspectRatio=1){
  const p=ids.map(i=>points?.[i]);if(p.some(v=>!v))return null;
  const metric=(a,b)=>Math.hypot((a.x-b.x)*aspectRatio,a.y-b.y);
  return (metric(p[1],p[5])+metric(p[2],p[4]))/(2*metric(p[0],p[3])||1);
}
export function faceObservation(points,{blendshapes=null,aspectRatio=1}={}){
  if(!points?.length)return null;
  const scores=Object.fromEntries((blendshapes||[]).map(s=>[s.categoryName,s.score]));
  const left=eyeAspectRatio(points,[33,160,158,133,153,144],aspectRatio),right=eyeAspectRatio(points,[362,385,387,263,373,380],aspectRatio);
  const closed=Number.isFinite(scores.eyeBlinkLeft)&&Number.isFinite(scores.eyeBlinkRight)?scores.eyeBlinkLeft>.7&&scores.eyeBlinkRight>.7:left!==null&&right!==null&&left<.13&&right<.13;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
  return {x,y,width:Math.max(...xs)-Math.min(...xs),eyesClosed:closed};
}
export class PresenceTracker {
  constructor({closedGraceMs=3000}={}){this.closedGraceMs=closedGraceMs;this.closedSince=null;this.last=null}
  reset(){this.closedSince=null;this.last=null}
  observe(now,{torso,pose,face}){
    if(this.last!==null&&now-this.last>1800)this.closedSince=null;this.last=now;
    if(!torso){this.closedSince=null;return {present:false,reason:'body'}}
    if(standingPose(pose)){this.closedSince=null;return {present:false,reason:'standing'}}
    // Match the face to the upper body in this frame, never to an old seat.
    if(!face||face.width<.035||Math.abs(face.x-torso.x)>Math.max(.16,torso.width*.8)||face.y>torso.y+.08){this.closedSince=null;return {present:false,reason:'face'}}
    if(face.eyesClosed){if(this.closedSince===null)this.closedSince=now;if(now-this.closedSince>=this.closedGraceMs)return {present:false,reason:'eyes'}}
    else this.closedSince=null;
    return {present:true,reason:'present'};
  }
}
