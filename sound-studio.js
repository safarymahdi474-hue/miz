// Nature sounds are licensed field recordings served by this Site. Only white
// and brown noise are synthesized. Audio never uses the microphone.
export const SOUNDS=[
  {id:'rain',name:'باران',description:'ضبط واقعی · باران روی برگ‌ها',icon:'rain',file:(globalThis.MIZ?.base||'')+'/audio/rain.mp3'},
  {id:'forest',name:'جنگل',description:'ضبط واقعی · پرندگان جنگل',icon:'forest',file:(globalThis.MIZ?.base||'')+'/audio/forest.mp3'},
  {id:'white',name:'نویز سفید',description:'یک بافت روشن و یکنواخت',icon:'wave'},
  {id:'brown',name:'نویز قهوه‌ای',description:'صدایی بم، نرم و عمیق',icon:'wave'},
  {id:'river',name:'رودخانه',description:'ضبط واقعی · جریان آب',icon:'river',file:(globalThis.MIZ?.base||'')+'/audio/river.mp3'}
];

export function noiseSamples(kind,length,random=Math.random){
  const data=new Float32Array(length);let brown=0;
  for(let i=0;i<length;i++){const white=random()*2-1;brown=(brown+.02*white)/1.02;data[i]=kind==='brown'?Math.max(-1,Math.min(1,brown*3.5)):white*.32}
  // Matching endpoints avoid clicks at the loop boundary without modulating the
  // body of the noise (a short edge crossfade is inaudible in long textures).
  const fade=Math.min(512,Math.floor(length/10));
  for(let i=0;i<fade;i++){const mix=i/fade;data[i]*=mix;data[length-1-i]*=mix}
  return data;
}

export class SoundStudio {
  constructor(onChange=()=>{}){
    this.onChange=onChange;this.selected='rain';this.volume=.3;this.playing=false;this.loading=false;this.recordingCache=null;this.context=null;this.nodes=[];this.sources=[];this.timers=[];this.revision=0;
    try{const p=JSON.parse(localStorage.getItem('miz.sound.v1'));if(SOUNDS.some(s=>s.id===p?.selected))this.selected=p.selected;if(Number.isFinite(p?.volume))this.volume=Math.max(0,Math.min(.8,p.volume))}catch{}
  }
  save(){try{localStorage.setItem('miz.sound.v1',JSON.stringify({selected:this.selected,volume:this.volume}))}catch{}}
  async play(){
    const revision=++this.revision;
    try{
      if(!this.context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw new Error('unsupported');this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=0;const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=8;this.master.connect(limiter);limiter.connect(this.context.destination)}
      await this.context.resume();if(revision!==this.revision||!this.context)return;
      this.clearTexture();this.playing=false;this.loading=true;this.onChange();await this.buildTexture(this.selected,revision);if(revision!==this.revision||!this.context)return;this.loading=false;this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.12);this.playing=true;this.onChange();
    }catch{if(revision===this.revision){this.loading=false;this.playing=false;this.clearTexture();this.onChange('پخش صدا در این مرورگر ممکن نشد. دوباره دکمهٔ پخش را بزن.')}}
  }
  pause(){
    ++this.revision;this.playing=false;this.loading=false;this.clearTexture();
    if(this.context){this.master.gain.value=0;this.context.suspend().catch(()=>{})}this.onChange();
  }
  select(id){if(!SOUNDS.some(s=>s.id===id)||id===this.selected)return;this.selected=id;this.save();if(this.playing||this.loading)void this.play();this.onChange()}
  setVolume(value){this.volume=Math.max(0,Math.min(.8,Number(value)||0));if(this.context&&this.playing)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.05);this.save();this.onChange()}
  connect(node,destination=this.master){node.connect(destination);this.nodes.push(node);return node}
  filter(type,frequency,q=1,destination=this.master){const node=this.context.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.Q.value=q;return this.connect(node,destination)}
  noise(kind,destination){
    const c=this.context,buffer=c.createBuffer(1,c.sampleRate*8,c.sampleRate);buffer.copyToChannel(noiseSamples(kind,buffer.length),0);
    const source=c.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(destination);source.start();this.sources.push(source);return source;
  }
  gain(value,destination=this.master){const g=this.context.createGain();g.gain.value=value;return this.connect(g,destination)}
  wobble(target,frequency,amount){const o=this.context.createOscillator(),g=this.context.createGain();o.frequency.value=frequency;g.gain.value=amount;o.connect(g);g.connect(target);o.start();this.sources.push(o);this.nodes.push(g)}
  async buildTexture(id,revision){
    if(!this.context)return;
    const sound=SOUNDS.find(s=>s.id===id);
    if(sound?.file){
      const context=this.context;let buffer=this.recordingCache?.id===id?this.recordingCache.buffer:null;
      if(!buffer){
        this.fetchController=new AbortController();const response=await fetch(sound.file,{signal:this.fetchController.signal});
        if(!response.ok)throw new Error('recording unavailable');
        const bytes=await response.arrayBuffer();if(revision!==this.revision)return;
        buffer=await context.decodeAudioData(bytes);if(revision!==this.revision||context!==this.context)return;
        this.recordingCache={id,buffer};
      }
      const source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.master);source.start();this.sources.push(source);return;
    }
    if(id==='white')this.noise('white',this.gain(.7));
    if(id==='brown')this.noise('brown',this.filter('lowpass',900,.7,this.gain(1.8)));
  }
  clearTexture(){
    this.fetchController?.abort();this.fetchController=null;this.timers.forEach(clearTimeout);this.timers=[];
    for(const node of this.sources){node.onended=null;try{node.stop()}catch{}node.disconnect()}this.sources=[];
    for(const node of this.nodes)node.disconnect();this.nodes=[];
  }
  close(){++this.revision;this.playing=false;this.loading=false;this.clearTexture();const c=this.context;this.context=null;this.master=null;if(c)c.close().catch(()=>{});this.onChange()}
}
