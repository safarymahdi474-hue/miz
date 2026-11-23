const clone=value=>JSON.parse(JSON.stringify(value));
export const endpoint=path=>`${window.MIZ.base}/api.php?route=${encodeURIComponent(path.replace(/^\/api/,''))}`;
export async function apiFetch(path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 const payload=body===undefined?undefined:JSON.stringify(body);
 try{return await fetch(endpoint(path),{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':window.MIZ.csrf},body:payload,keepalive:payload!==undefined&&new TextEncoder().encode(payload).byteLength<60000})}finally{clearTimeout(timer)}
}

function apply(state,change){
 const value=change.value;
 if(change.type==='goal')state.goal=value;
 if(change.type==='subject_delete')state.subjects=state.subjects.filter(s=>s.id!==value);
 if(change.type==='subject_upsert'){const item=state.subjects.find(s=>s.id===value.id);if(item)Object.assign(item,value);else state.subjects.push(value)}
 if(change.type==='session_upsert'){const index=state.sessions.findIndex(s=>s.id===value.id);if(index<0)state.sessions.push(value);else state.sessions[index]=value}
}
export class AccountStore {
 constructor(){
  this.key=`miz.study.${window.MIZ.user.id}.v1`;this.queueKey=this.key+'.outbox';this.queue=[];this.sending=false;this.timer=null;this.retry=2000;
  try{this.queue=JSON.parse(localStorage.getItem(this.queueKey)||'[]');if(!Array.isArray(this.queue))this.queue=[]}catch{}
  this.state=clone(window.MIZ.state);for(const change of this.queue)apply(this.state,change);this.baseline=clone(this.state);
  try{localStorage.setItem(this.key,JSON.stringify(this.state))}catch{}
  window.addEventListener('online',()=>this.flush());window.addEventListener('pagehide',()=>{if(this.queue.length){const data=JSON.stringify({changes:this.queue.slice(0,20),_csrf:window.MIZ.csrf});if(data.length<60000)navigator.sendBeacon?.(endpoint('/api/state'),new Blob([data],{type:'application/json'}))}});
  document.querySelector('#syncState')?.addEventListener('click',()=>this.flush());this.status(this.queue.length?'working':'saved');if(this.queue.length)this.flush();
 }
 write(state){
  const previous=this.baseline,changes=[];
  for(const [position,subject]of state.subjects.entries()){const before=previous.subjects.find(s=>s.id===subject.id);if(!before||before.name!==subject.name||before.color!==subject.color||previous.subjects.indexOf(before)!==position)changes.push({type:'subject_upsert',value:{...subject,position}})}
  for(const subject of previous.subjects)if(!state.subjects.some(s=>s.id===subject.id))changes.push({type:'subject_delete',value:subject.id});
  for(const session of state.sessions){const before=previous.sessions.find(s=>s.id===session.id);if(!before||JSON.stringify(before)!==JSON.stringify(session))changes.push({type:'session_upsert',value:session})}
  if(previous.goal!==state.goal)changes.push({type:'goal',value:state.goal});
  try{const queue=[...this.queue,...clone(changes)];localStorage.setItem(this.queueKey,JSON.stringify(queue));localStorage.setItem(this.key,JSON.stringify(state));this.queue=queue;this.baseline=clone(state);this.state=state;if(changes.length)this.flush();return true}catch{this.status('error','ذخیرهٔ موقت انجام نشد');return false}
 }
 status(state,message){const el=document.querySelector('#syncState');if(el){el.dataset.state=state;el.textContent=message||{saved:'در حساب ذخیره شد',working:'در حال ذخیره…',error:'ذخیره در انتظار اتصال'}[state];el.title=state==='error'?'برای تلاش دوباره بزن':'وضعیت ذخیرهٔ اطلاعات حساب'}}
 async flush(){
  if(this.sending||!this.queue.length)return;clearTimeout(this.timer);this.sending=true;this.status('working');let batch=this.queue.slice(0,20);
  while(batch.length>1&&JSON.stringify(batch).length>1400000)batch.pop();
  try{const response=await apiFetch('/api/state',{changes:batch});let data;try{data=await response.json()}catch{throw new Error('SERVER_ERROR')}
   if(!response.ok){if(response.status===401||response.status===419){this.status('error','برای ذخیره دوباره وارد شو');return}throw new Error(data.error?.message||'SAVE_FAILED')}
   this.queue.splice(0,batch.length);localStorage.setItem(this.queueKey,JSON.stringify(this.queue));this.retry=2000;this.status(this.queue.length?'working':'saved');
  }catch{this.status('error');this.retry=Math.min(30000,this.retry*2)}finally{this.sending=false;if(this.queue.length)this.timer=setTimeout(()=>this.flush(),this.retry)}
 }
}
