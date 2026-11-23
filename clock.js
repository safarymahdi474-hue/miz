// Each interval is credited only when BOTH camera observations confirm presence.
// Missed frames, hidden tabs and uncertain observations therefore leave gaps.
export class StudyClock {
  constructor(start, maxGap = 1800) { this.start=start; this.last=null; this.present=false; this.maxGap=maxGap; this.total=0; this.segments=[]; }
  observe(now, present) {
    const current=Math.max(this.last ?? this.start,now);
    if(this.last!==null && current>this.last) {
      const credited=this.present && present && current-this.last<=this.maxGap;
      this.append(this.last,current,credited?'present':'away');
      if(credited) this.total+=current-this.last;
    } else if(this.last===null && current>this.start) this.append(this.start,current,'away');
    this.last=current; this.present=present;
  }
  append(from,to,type) {
    const previous=this.segments.at(-1);
    if(previous && previous.type===type && previous.to===from) previous.to=to;
    else this.segments.push({from,to,type});
  }
  snapshot(now) {
    const end=Math.max(now,this.last??this.start),segments=this.segments.map(s=>({...s}));
    if(end>(this.last??this.start)) segments.push({from:this.last??this.start,to:end,type:'away'});
    return {activeMs:this.total,elapsedMs:Math.max(0,end-this.start),segments};
  }
}
export function torsoFromPose(landmarks) {
  if(!landmarks?.length)return null;
  const [left,right]=[landmarks[11],landmarks[12]];
  if(!left||!right||(left.visibility??0)<.5||(right.visibility??0)<.5)return null;
  const width=Math.hypot(left.x-right.x,left.y-right.y);
  const x=(left.x+right.x)/2,y=(left.y+right.y)/2;
  if(width<.09||width>.88||x<.1||x>.9||y<.12||y>.94)return null;
  const head=landmarks.slice(0,11).some(p=>(p.visibility??0)>.35&&p.x>0&&p.x<1&&p.y>0&&p.y<1);
  return head ? {x,y,width} : null;
}
