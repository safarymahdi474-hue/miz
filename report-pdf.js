import {fa,PERIODS,shortDate,fullDate,reportDuration,reportChart,inputDate} from './report-data.js';
import {jpegPagesToPdf} from './pdf-writer.js';

const PALETTES={
  paper:{bg:'#f5f3eb',panel:'#fffdf8',ink:'#193b37',muted:'#71837b',accent:'#456c4f',soft:'#dfe9d6',line:'#dce1d5',gold:'#9a7945'},
  night:{bg:'#0d1c2b',panel:'#152c3a',ink:'#ecf2e9',muted:'#9ab3b5',accent:'#d0e5a3',soft:'#2b443b',line:'#29444b',gold:'#d7bd83'}
};
const W=620,H=877;
const hour=value=>new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'}).format(value);
const bytesFromDataUrl=url=>Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));
async function fonts(){await document.fonts.load('400 16px Vazir');await document.fonts.load('700 16px Vazir');await document.fonts.ready}

function page(theme='paper'){
  const c=document.createElement('canvas');c.width=W*2;c.height=H*2;const ctx=c.getContext('2d');ctx.scale(2,2);const p=PALETTES[theme]||PALETTES.paper;
  ctx.fillStyle=p.bg;ctx.fillRect(0,0,W,H);
  const font=(size,weight=400)=>{ctx.font=`${weight} ${size}px Vazir`;ctx.direction='rtl';ctx.textBaseline='alphabetic'};
  const text=(value,x,y,size=12,color=p.ink,weight=400,align='right')=>{font(size,weight);ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(String(value),x,y)};
  const box=(x,y,w,h,color=p.panel,r=14)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill()};
  const line=(x1,y1,x2,y2,color=p.line)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.stroke()};
  const fit=(value,maxWidth,size=12)=>{font(size);let s=String(value);if(ctx.measureText(s).width<=maxWidth)return s;while(s&&ctx.measureText(s+'…').width>maxWidth)s=s.slice(0,-1);return s+'…'};
  const wrap=(value,maxWidth,size=12)=>{
    font(size);const lines=[];for(const paragraph of String(value).split('\n')){let current='';for(const word of paragraph.split(/\s+/)){const candidate=current?current+' '+word:word;if(ctx.measureText(candidate).width<=maxWidth)current=candidate;else{if(current)lines.push(current);current='';for(const letter of word){if(ctx.measureText(current+letter).width>maxWidth){lines.push(current);current=''}current+=letter}}}lines.push(current)}return lines;
  };
  return {c,ctx,p,text,box,line,fit,wrap};
}
function brand(s,report,subtitle='دفتر دقیقه‌های تو'){
  s.text('میز',582,66,39,s.p.ink,700);s.text(subtitle,513,61,10,s.p.muted);
  s.text('MIZ / STUDY JOURNAL',38,44,9,s.p.muted,400,'left');s.text(fullDate(report.generatedAt),38,65,9,s.p.muted,400,'left');s.line(38,91,582,91);
}
function footer(s,report,index){
  s.line(38,831,582,831);s.text('میز · گزارش شخصی مطالعه · زمان حضور، نه ارزیابی یادگیری',582,850,8,s.p.muted);s.text(`صفحهٔ ${fa(index)}`,38,850,9,s.p.muted,400,'left');
}
function stamp(s,x,y,r=42){
  const {ctx,p}=s;ctx.save();ctx.translate(x,y);ctx.rotate(-.12);ctx.strokeStyle=p.gold;ctx.lineWidth=1.1;
  for(const radius of [r,r-4,r-12]){ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke()}
  for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.arc(Math.cos(a)*(r-8),Math.sin(a)*(r-8),.9,0,Math.PI*2);ctx.fillStyle=p.gold;ctx.fill()}
  s.text('میز',0,8,25,p.gold,700,'center');s.text('گزارش مطالعه',0,-17,6.5,p.gold,400,'center');s.text('ثبت‌شده در میز',0,24,6.5,p.gold,400,'center');ctx.restore();
}
function bigDuration(ms){
  const total=Math.floor(ms/60000),h=Math.floor(total/60),m=total%60;
  return h?`${fa(h)} ساعت و ${fa(m)} دقیقه`:total?`${fa(total)} دقیقه و ${fa(Math.floor(ms/1000)%60)} ثانیه`:`${fa(Math.floor(ms/1000))} ثانیه`;
}
function cover(report,theme){
  const s=page(theme);brand(s,report);
  s.text('گزارش اختصاصی مطالعه',582,125,10,s.p.accent);s.text(`روایت ${PERIODS[report.period]} تمرکز تو`,582,163,27,s.p.ink,700);
  s.text(report.label,582,188,11,s.p.muted);s.text(`برای ${report.name||'همراه میز'}`,582,210,11,s.p.ink);
  s.box(38,229,544,106,s.p.soft,19);s.text(bigDuration(report.activeMs),560,280,33,s.p.ink,700);s.text('زمان خالص حضور پشت میز',560,309,11,s.p.muted);
  const stats=[['جلسهٔ مطالعه',fa(report.count)],['سهم حضور',`${fa(report.presence)}٪`],[report.period==='day'?'وقفه‌های جلسه':'روزهای مطالعه',report.period==='day'?reportDuration(report.awayMs):`${fa(report.studyDays)} روز`]];
  stats.forEach(([label,value],i)=>{const x=404-i*183;s.box(x,351,178,65);s.text(value,x+160,377,20,s.p.ink,700);s.text(label,x+160,399,9,s.p.muted)});
  s.box(38,434,544,160);s.text(report.period==='day'?'ریتم مطالعه در ساعت‌های روز':'ریتم مطالعه در این بازه',564,459,12,s.p.ink,700);s.text('دقیقه',56,459,8,s.p.muted,400,'left');
  const bars=reportChart(report),maximum=Math.max(60000,...bars.map(d=>d.activeMs)),step=500/bars.length,barWidth=Math.min(34,step*.58);
  s.line(60,561,560,561);
  bars.forEach((d,i)=>{const x=560-step*i-step/2,h=Math.max(2,d.activeMs/maximum*79);s.box(x-barWidth/2,561-h,barWidth,h,d.activeMs===maximum?s.p.accent:s.p.soft,Math.min(4,barWidth/2));if(bars.length<14||i%5===0||i===bars.length-1){const label=report.period==='day'?d.label:new Intl.DateTimeFormat('fa-IR',{day:'numeric'}).format(d.from);s.text(label,x,578,8,s.p.muted,400,'center')}if(bars.length<=12&&d.activeMs)s.text(fa(Math.floor(d.activeMs/60000)),x,555-h,8,s.p.muted,400,'center')});
  s.text('سهم درس‌ها',582,625,13,s.p.ink,700);
  if(!report.subjects.length)s.text('در این بازه هنوز جلسه‌ای ثبت نشده است.',582,661,11,s.p.muted);
  report.subjects.slice(0,3).forEach((sub,i)=>{const y=651+i*35;s.text(s.fit(sub.name,210),582,y,11);s.text(reportDuration(sub.total),38,y,10,s.p.muted,400,'left');s.box(174,y-7,180,4,s.p.line,2);s.box(354-180*(report.activeMs?sub.total/report.activeMs:0),y-7,Math.max(2,180*(report.activeMs?sub.total/report.activeMs:0)),4,s.p.accent,2)});
  if(report.subjects.length>3)s.text(`جزئیات ${fa(report.subjects.length)} درس در صفحه‌های بعد آمده است.`,582,752,9,s.p.muted);
  stamp(s,91,783);s.text('هر دقیقه، یک قدم رو به جلو.',582,778,18,s.p.ink,700);s.text('مهر میز، همراهِ گزارش دقیقه‌هایی که برای یاد گرفتن ساختی.',582,801,9,s.p.muted);
  return s;
}
function* detailPages(report,theme){
  for(let start=0;start<report.sessions.length;start+=14){
    const s=page(theme);brand(s,report,'جزئیات جلسه‌ها');s.text('جزئیات مسیر مطالعه',582,133,22,s.p.ink,700);s.text(report.label,582,156,10,s.p.muted);
    s.box(38,175,544,37,s.p.soft,9);[['درس',565],['تاریخ / شروع',363],['زمان خالص',211],['وقفه',91]].forEach(([t,x])=>s.text(t,x,199,10,s.p.ink,700));
    report.sessions.slice(start,start+14).forEach((r,i)=>{const y=218+i*40;if(i%2===0)s.box(38,y,544,38,s.p.panel,7);s.text(s.fit(r.subjectName,173),565,y+23,11);s.text(`${shortDate(r.start)} · ${hour(r.start)}`,363,y+23,9,s.p.muted);s.text(reportDuration(r.activeMs),211,y+23,10);s.text(reportDuration(r.elapsedMs-r.activeMs),91,y+23,9,s.p.muted);s.line(48,y+39,572,y+39)});
    s.text(`جمع این بازه: ${bigDuration(report.activeMs)} · ${fa(report.count)} جلسه`,582,813,10,s.p.muted);yield s;
  }
}
function* thoughtPages(report,theme){
  const entries=report.sessions.flatMap(r=>(r.thoughts||[]).map(t=>({...t,subject:r.subjectName})));if(!entries.length)return;
  let y=191;const add=()=>{const s=page(theme);brand(s,report,'پارکینگ افکار · خصوصی');s.text('فکرهایی برای بعد از مطالعه',582,134,22,s.p.ink,700);s.text('این بخش با انتخاب تو به گزارش اضافه شده است.',582,158,10,s.p.muted);y=191;return s};let s=add();
  for(let i=0;i<entries.length;i++){
    const t=entries[i],lines=s.wrap(t.text,493,11);let lineIndex=0;
    while(lineIndex<lines.length){
      if(y+65>810){yield s;s=add()}
      const available=Math.max(1,Math.floor((810-y-38)/20)),part=lines.slice(lineIndex,lineIndex+available),height=part.length*20+36;
      s.box(38,y,544,height);s.text(`${fa(i+1)} · ${s.fit(t.subject,300,9)}${lineIndex?' · ادامه':''}`,565,y+20,9,s.p.accent);part.forEach((line,j)=>s.text(line,565,y+43+j*20,11));y+=height+10;lineIndex+=part.length;
      if(lineIndex<lines.length){yield s;s=add()}
    }
  }
  yield s;
}
export async function renderReportPreview(report,{theme='paper'}={}){await fonts();return cover(report,theme).c}
export async function createReportPdf(report,{theme='paper',includeThoughts=false}={}){
  await fonts();const images=[];let index=0;
  function* sheets(){yield cover(report,theme);yield* detailPages(report,theme);if(includeThoughts)yield* thoughtPages(report,theme)}
  for(const s of sheets()){footer(s,report,++index);images.push({width:s.c.width,height:s.c.height,bytes:bytesFromDataUrl(s.c.toDataURL('image/jpeg',.94))});s.c.width=0;s.c.height=0;await new Promise(r=>setTimeout(r,0))}
  return new Blob([jpegPagesToPdf(images)],{type:'application/pdf'});
}
export function reportFilename(report){return `miz-${report.period}-${inputDate(report.from)}.pdf`}
