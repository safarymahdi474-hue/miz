import test from 'node:test';
import assert from 'node:assert/strict';
import {BreathPacer,createThought,sessionThoughts} from '../session-prep.js';
import {noiseSamples,SoundStudio} from '../sound-studio.js';

test('breathing guides six unheld 4/6 cycles before completing',()=>{
  const p=new BreathPacer();p.step(0);
  for(let t=100;t<=3900;t+=100)p.step(t);
  assert.equal(p.snapshot().phase,'inhale');assert.equal(p.snapshot().cycle,1);
  assert.equal(p.step(4000).phase,'exhale');
  for(let t=4100;t<=10000;t+=100)p.step(t);
  assert.equal(p.snapshot().phase,'inhale');assert.equal(p.snapshot().cycle,2);
  for(let t=10100;t<60000;t+=100)p.step(t);
  assert.equal(p.snapshot().done,false);assert.equal(p.step(60000).done,true);
  assert.equal(p.snapshot().remainingMs,0);assert.equal(p.step(60100).cycle,6);
});

test('hidden time and long frame gaps never finish breathing in the background',()=>{
  const p=new BreathPacer();p.step(0);p.step(500);p.step(600,false);p.step(60600,false);p.step(61000,true);
  assert.equal(p.snapshot().elapsedMs,500);
  p.step(61500);assert.equal(p.snapshot().elapsedMs,1000);
  p.step(200000);assert.equal(p.snapshot().elapsedMs,1000);
  p.step(200200);assert.equal(p.snapshot().elapsedMs,1200);assert.equal(p.snapshot().done,false);
});

test('thoughts stay attached to their session through draft serialization and legacy records work',()=>{
  const text='بعد از مطالعه به علی پیام بدهم.\n<script>private thought</script>';
  const thought=createThought('  '+text+'  ',1234);
  assert.deepEqual(thought,{text,createdAt:1234});
  const record=JSON.parse(JSON.stringify({thoughts:[thought]}));
  assert.deepEqual(sessionThoughts(record),[thought]);
  assert.deepEqual(sessionThoughts({}),[]);assert.deepEqual(sessionThoughts({thoughts:[null,{},thought]}),[thought]);
  assert.equal(createThought('   '),null);assert.equal(createThought('a'.repeat(501)),null);
});

test('brown noise is bounded and smoother than white noise',()=>{
  const random=()=>{let n=197;return()=>{n=(n*16807)%2147483647;return(n-1)/2147483646}};
  const white=noiseSamples('white',48000,random()),brown=noiseSamples('brown',48000,random());
  const roughness=data=>data.slice(1000).reduce((sum,x,i)=>sum+(x-data[i+999])**2,0)/(data.length-1000);
  assert.ok(roughness(brown)<roughness(white)*.1);
  assert.ok(brown.some(n=>n>.05));assert.ok(brown.every(n=>Number.isFinite(n)&&Math.abs(n)<=1));
  assert.ok(Math.abs(white[0])===0);assert.ok(Math.abs(white.at(-1))===0);
});

test('audio stop cancels scheduled work, closes its context and invalidates a pending play',async()=>{
  const studio=new SoundStudio();let closeCount=0,suspended=0,stopped=0,disconnected=0,resume;
  studio.context={resume:()=>new Promise(r=>{resume=r}),suspend:async()=>{suspended++},close:async()=>{closeCount++}};
  studio.master={gain:{value:0}};
  studio.sources=[{stop(){stopped++},disconnect(){disconnected++}}];studio.nodes=[{disconnect(){disconnected++}}];
  studio.timers=[setTimeout(()=>assert.fail('stopped timer fired'),1000)];
  const pending=studio.play();studio.pause();resume();await pending;
  assert.equal(studio.playing,false);assert.equal(stopped,1);assert.equal(disconnected,2);assert.equal(studio.timers.length,0);assert.equal(suspended,1);
  studio.close();assert.equal(closeCount,1);assert.equal(studio.context,null);
});
test('a real recording that finishes downloading after Stop cannot start playing',async()=>{
 const original=globalThis.fetch,studio=new SoundStudio();let resolveFetch,closed=0,started=0;
 globalThis.fetch=()=>new Promise(resolve=>{resolveFetch=resolve});
 studio.context={resume:async()=>{},close:async()=>{closed++},decodeAudioData:async()=>({}),createBufferSource:()=>({connect(){},start(){started++}})};
 studio.master={gain:{value:0,setTargetAtTime(){}}};
 try{const pending=studio.play();await Promise.resolve();assert.ok(resolveFetch);studio.close();resolveFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});await pending;assert.equal(started,0);assert.equal(closed,1);assert.equal(studio.playing,false)}finally{globalThis.fetch=original}
});
