import test from 'node:test';
import assert from 'node:assert/strict';
import {PresenceTracker,standingPose,faceObservation} from '../presence.js';
test('a seated user can move anywhere in frame; an old seat is never matched',()=>{
 const p=new PresenceTracker();
 for(const x of [.2,.5,.8])assert.equal(p.observe(x*1000,{torso:{x,y:.6,width:.25},face:{x,y:.35,width:.12,eyesClosed:false},pose:[]}).present,true);
 assert.equal(p.observe(2000,{torso:null,face:null,pose:[]}).present,false);
 assert.equal(p.observe(2500,{torso:{x:.8,y:.6,width:.25},face:{x:.2,y:.3,width:.1,eyesClosed:false},pose:[]}).present,false);
});
test('ordinary blinks do not interrupt; sustained eye closure does; fresh reopening resumes',()=>{
 const p=new PresenceTracker(),torso={x:.5,y:.6,width:.3},face={x:.5,y:.35,width:.14,eyesClosed:true};
 for(const now of [0,500,1000,1500,2000,2500])assert.equal(p.observe(now,{torso,face,pose:[]}).present,true);
 assert.equal(p.observe(3000,{torso,face,pose:[]}).reason,'eyes');
 assert.equal(p.observe(3500,{torso,face:{...face,eyesClosed:false},pose:[]}).present,true);
 p.reset();assert.equal(p.observe(4000,{torso,face,pose:[]}).present,true);
});
test('standing requires reliable visible legs, not remembered head position',()=>{
 const points=[];points[23]={x:.5,y:.3,visibility:.9};points[25]={x:.5,y:.6,visibility:.9};points[27]={x:.5,y:.9,visibility:.9};
 assert.equal(standingPose(points),true);points[27].y=1.3;assert.equal(standingPose(points),false);points[27].y=.8;points[27].x=.8;assert.equal(standingPose(points),false);
});
test('real face blendshape scores distinguish bilateral closure from an ordinary wink',()=>{
 const points=Array.from({length:468},(_,i)=>({x:.2+(i%25)/100,y:.2+Math.floor(i/25)/100}));
 assert.equal(faceObservation(points,{blendshapes:[{categoryName:'eyeBlinkLeft',score:.9},{categoryName:'eyeBlinkRight',score:.9}]}).eyesClosed,true);
 assert.equal(faceObservation(points,{blendshapes:[{categoryName:'eyeBlinkLeft',score:.9},{categoryName:'eyeBlinkRight',score:.1}]}).eyesClosed,false);
 assert.equal(faceObservation(null),null);
});
test('the WASM landmark route estimates open and closed eyes from their actual geometry',()=>{
 const points=Array.from({length:468},()=>({x:.5,y:.5}));
 function eye(ids,x,height){const xy=[[x,.3],[x+.03,.3-height],[x+.07,.3-height],[x+.1,.3],[x+.07,.3+height],[x+.03,.3+height]];ids.forEach((id,i)=>points[id]={x:xy[i][0],y:xy[i][1]})}
 eye([33,160,158,133,153,144],.3,.02);eye([362,385,387,263,373,380],.6,.02);assert.equal(faceObservation(points).eyesClosed,false);
 eye([33,160,158,133,153,144],.3,.003);eye([362,385,387,263,373,380],.6,.003);assert.equal(faceObservation(points).eyesClosed,true);
});
