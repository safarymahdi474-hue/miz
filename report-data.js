const midnight=value=>{const d=new Date(value);d.setHours(0,0,0,0);return d};
const move=(value,days)=>{const d=new Date(value);d.setDate(d.getDate()+days);return d};
const persianParts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(value).map(p=>[p.type,p.value]));
export const PERIODS={day:'روزانه',week:'هفتگی',month:'ماهانه'};
export const fa=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(n);
export const fullDate=value=>new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'long',day:'numeric'}).format(value);
export const shortDate=value=>new Intl.DateTimeFormat('fa-IR',{month:'short',day:'numeric'}).format(value);
export function inputDate(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function localDate(value){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d)}
export function reportRange(period='week',reference=Date.now()){
  const start=midnight(reference);
  if(period==='week')start.setDate(start.getDate()-(start.getDay()+1)%7);
  if(period==='month')start.setDate(start.getDate()-(Number(persianParts(start).day)-1));
  let end=move(start,period==='day'?1:7);
  if(period==='month'){const month=persianParts(start).month;end=move(start,1);while(persianParts(end).month===month)end=move(end,1)}
  return {period,from:+start,to:+end,label:period==='day'?fullDate(start):`${fullDate(start)} تا ${fullDate(move(end,-1))}`};
}
export function buildReport(records,{period='week',reference=Date.now(),subject='all',name='',goal=120}={}){
  const range=reportRange(period,reference),sessions=[];
  for(const r of records){
    if(subject!=='all'&&r.subjectId!==subject)continue;
    const start=Math.max(range.from,r.start),end=Math.min(range.to,r.end??r.start+r.elapsedMs);if(end<=start)continue;
    const original=r.segments?.length?r.segments:[{from:r.start,to:r.start+Math.min(r.activeMs,r.elapsedMs),type:'present'},{from:r.start+Math.min(r.activeMs,r.elapsedMs),to:r.start+r.elapsedMs,type:'away'}];
    const segments=original.map(s=>({...s,from:Math.max(s.from,start),to:Math.min(s.to,end)})).filter(s=>s.to>s.from);
    sessions.push({...r,start,end,elapsedMs:end-start,activeMs:segments.reduce((n,s)=>n+(s.type==='present'?s.to-s.from:0),0),segments,thoughts:(r.thoughts||[]).filter(t=>!t.createdAt||t.createdAt>=range.from&&t.createdAt<range.to)});
  }
  sessions.sort((a,b)=>a.start-b.start);
  const days=[];for(let d=new Date(range.from);+d<range.to;d=move(d,1)){const to=+move(d,1);days.push({from:+d,to,label:shortDate(d),activeMs:sessions.reduce((n,s)=>n+s.segments.reduce((m,p)=>m+(p.type==='present'?Math.max(0,Math.min(p.to,to)-Math.max(p.from,+d)):0),0),0)})}
  const subjects=new Map();for(const r of sessions){const old=subjects.get(r.subjectId)||{id:r.subjectId,name:r.subjectName,color:r.color,total:0,count:0};old.total+=r.activeMs;old.count++;subjects.set(r.subjectId,old)}
  const activeMs=sessions.reduce((n,s)=>n+s.activeMs,0),elapsedMs=sessions.reduce((n,s)=>n+s.elapsedMs,0),studyDays=days.filter(d=>d.activeMs>0).length;
  return {...range,name,goal,sessions,days,subjects:[...subjects.values()].sort((a,b)=>b.total-a.total),activeMs,elapsedMs,awayMs:elapsedMs-activeMs,count:sessions.length,studyDays,averageMs:studyDays?activeMs/studyDays:0,presence:elapsedMs?Math.round(activeMs/elapsedMs*100):0,generatedAt:Date.now()};
}
export function reportDuration(ms){const minutes=Math.floor(Math.max(0,ms)/60000),seconds=Math.floor(ms/1000)%60;return minutes?`${fa(minutes)} دقیقه`:`${fa(seconds)} ثانیه`}
export function reportChart(report){
  if(report.period!=='day')return report.days;
  return Array.from({length:12},(_,i)=>{
    const from=new Date(report.from),to=new Date(report.from);from.setHours(i*2);to.setHours(i*2+2);
    return {from:+from,to:+to,label:fa(i*2),activeMs:report.sessions.reduce((n,s)=>n+s.segments.reduce((m,p)=>m+(p.type==='present'?Math.max(0,Math.min(+to,p.to)-Math.max(+from,p.from)):0),0),0)};
  });
}
