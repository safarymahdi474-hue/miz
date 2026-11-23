import test from 'node:test';import assert from 'node:assert/strict';
const data=new Map(),status={dataset:{},textContent:'',addEventListener(){}};
globalThis.window={MIZ:{base:'/miz/public',csrf:'test-csrf',user:{id:'owner'},state:{subjects:[],sessions:[],goal:120,schemaVersion:2}},addEventListener(){}};globalThis.document={querySelector:()=>status};globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
let online=false,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});if(!online)throw new Error('offline');return {ok:true,json:async()=>({saved:true})}};
const {AccountStore,endpoint,apiFetch}=await import('../account-store.js');
test('account changes are queued privately, replayed on reload and sent as entity changes in a subdirectory',async()=>{
 const store=new AccountStore();assert.equal(endpoint('/api/state'),'/miz/public/api.php?route=%2Fstate');
 const state={subjects:[{id:'p',name:'فیزیک',color:'#bde875'}],sessions:[],goal:180,schemaVersion:2};assert.equal(store.write(state),true);
 await new Promise(r=>setTimeout(r,0));clearTimeout(store.timer);assert.equal(store.queue.length,2);assert.ok(data.has('miz.study.owner.v1.outbox'));assert.ok(!data.has('miz.study.other.v1.outbox'));
 const reloaded=new AccountStore();await new Promise(r=>setTimeout(r,0));clearTimeout(reloaded.timer);assert.equal(reloaded.state.subjects[0].name,'فیزیک');assert.equal(reloaded.state.goal,180);
 online=true;await reloaded.flush();clearTimeout(reloaded.timer);assert.equal(reloaded.queue.length,0);assert.equal(status.dataset.state,'saved');const last=calls.at(-1);assert.equal(last.options.headers['X-CSRF-Token'],'test-csrf');const payload=JSON.parse(last.options.body);assert.deepEqual(payload.changes.map(c=>c.type),['subject_upsert','goal']);
 const next={...state,subjects:[],sessions:[{id:'s',subjectId:'p',activeMs:1000}]};reloaded.write(next);await new Promise(r=>setTimeout(r,0));clearTimeout(reloaded.timer);assert.deepEqual(JSON.parse(calls.at(-1).options.body).changes.map(c=>c.type),['subject_delete','session_upsert']);
});
test('large UTF-8 session requests bypass the browser keepalive size limit',async()=>{
 online=true;await apiFetch('/api/state',{text:'ف'.repeat(31000)});assert.equal(calls.at(-1).options.keepalive,false);
 await apiFetch('/api/state',{changes:[]});assert.equal(calls.at(-1).options.keepalive,true);
});
