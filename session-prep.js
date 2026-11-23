// Only visible, regularly delivered frames advance the preparation exercise.
// Background tabs and sleeping devices cannot silently complete it.
export class BreathPacer {
  constructor({cycles=6,inhaleMs=4000,exhaleMs=6000}={}) {
    this.cycles=cycles;this.inhaleMs=inhaleMs;this.exhaleMs=exhaleMs;
    this.totalMs=cycles*(inhaleMs+exhaleMs);this.elapsedMs=0;this.last=null;this.wasVisible=false;
  }
  step(now,visible=true){
    if(this.last!==null&&visible&&this.wasVisible){const delta=now-this.last;if(delta>=0&&delta<=1000)this.elapsedMs=Math.min(this.totalMs,this.elapsedMs+delta)}
    this.last=now;this.wasVisible=visible;return this.snapshot();
  }
  snapshot(){
    const cycleMs=this.inhaleMs+this.exhaleMs,within=this.elapsedMs%cycleMs,done=this.elapsedMs>=this.totalMs;
    const inhale=within<this.inhaleMs,phaseMs=inhale?this.inhaleMs:this.exhaleMs,position=inhale?within:within-this.inhaleMs;
    return {done,elapsedMs:this.elapsedMs,remainingMs:Math.max(0,this.totalMs-this.elapsedMs),cycle:Math.min(this.cycles,Math.floor(this.elapsedMs/cycleMs)+1),cycles:this.cycles,phase:inhale?'inhale':'exhale',phaseRemaining:Math.ceil((phaseMs-position)/1000),expansion:inhale?position/phaseMs:1-position/phaseMs};
  }
}

export function createThought(text,now=Date.now()){
  const value=String(text??'').trim();if(!value||value.length>500)return null;
  return {text:value,createdAt:now};
}

export function sessionThoughts(record){
  return Array.isArray(record?.thoughts)?record.thoughts.filter(t=>t&&typeof t.text==='string'&&t.text.trim()).map(t=>({text:t.text,createdAt:t.createdAt})):[];
}
