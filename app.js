import {periodKeys} from './progress-time.js';
import {AccountStore} from './account-store.js';
import {BackgroundClock} from './background-clock.js';
import {StudyClock,torsoFromPose} from './clock.js';
import {requestStudyCamera,cameraFallbackMessage,manualClock} from './camera-mode.js';
import {createPoseEngine} from './pose-engine.js';
import {FocusView} from './focus-view.js?v=42';
import {emptyStudyState,readStudyState,formatStudyDate} from './study-state.js';
import {StudyGroups} from './groups.js?v=71';
import {createThought,sessionThoughts as readThoughts} from './session-prep.js';
import {AttentionGate} from './attention.js';
import {createFaceEngine} from './face-engine.js';
import {PresenceTracker} from './presence.js';
import {buildReport,reportChart,reportRange,inputDate,localDate,PERIODS} from './report-data.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const icon=name=>`<svg><use href="#i-${name}"/></svg>`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fa=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(n);
const time=ms=>{const s=Math.floor(Math.max(0,ms)/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')};
const duration=ms=>ms<60000?`${fa(Math.floor(ms/1000))} ثانیه`:`${fa(Math.floor(ms/60000))} دقیقه`;
const dateLabel=n=>formatStudyDate(n,{month:'short',day:'numeric'},'تاریخ نامشخص');
const hourLabel=n=>formatStudyDate(n,{hour:'2-digit',minute:'2-digit'});
const dayStart=n=>{const d=new Date(n);d.setHours(0,0,0,0);return +d};
const dayEnd=n=>{const d=new Date(dayStart(n));d.setDate(d.getDate()+1);return +d};
const weekStart=n=>{const d=new Date(dayStart(n));d.setDate(d.getDate()-(d.getDay()+1)%7);return +d};
const nextDay=(n,offset=1)=>{const d=new Date(n);d.setDate(d.getDate()+offset);return +d};
const colors=['#bde875','#a99bf4','#75c8d5','#f0ad7d','#e5cd72','#e898ba'];
const accountStore=new AccountStore();
const STORAGE=accountStore.key,DRAFT=`miz.draft.${window.MIZ.user.id}.v1`;
const uid=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
let storageAvailable=true,toastTimer;
let state=accountStore.state;
try{localStorage.setItem('miz.storage.test','1');localStorage.removeItem('miz.storage.test')}catch{storageAvailable=false}
let selected=state.subjects[0]?.id??null,page='desk',model=null,modelPromise=null;
let choosingSubject=false;
let stream=null,clock=null,calibration=null,calibrationStarted=null,calibrationSamples=[],paused=false,active=false,starting=false;
let wallStart=0,runToken=0,loopTimer=null,uiTimer=null,wakeLock=null,lastFrameTime=-1,sessionSubject=null,lastSaved=0,lockRelease=null;
let parkedThoughts=[];
let reportPeriod='week',reportReference=Date.now(),currentReport=null,pdfPreviewRevision=0;
const attention=new AttentionGate(),presenceTracker=new PresenceTracker();
attention.update({focused:document.hasFocus(),hidden:document.hidden});
const video=$('#cameraVideo'),canvas=$('#poseCanvas');
const focusView=new FocusView({video,onStop:()=>finishSession(),onThought:text=>{
  if(!clock||!active)return 'ثبت فکر پس از شروع شمارش در دسترس است.';
  const thought=createThought(text);if(!thought)return 'یک فکر تا ۵۰۰ نویسه بنویس.';
  if(parkedThoughts.length>=100)return 'برای این جلسه ۱۰۰ فکر ثبت کرده‌ای.';
  parkedThoughts.push(thought);if(saveDraft())return true;
  parkedThoughts.pop();return 'فضای ذخیره‌سازی کافی نیست. متن اینجا می‌ماند؛ پس از جلسه از گزارش خروجی بگیر.';
}});
const groups=new StudyGroups({notify:toast,onStartStudy:id=>{selected=id;renderPills();startSession()},onAddSubject:()=>openDialog('addSubject'),onSubject:id=>{selected=id;renderPills()},onForcedLeave:message=>{if(active||starting)finishSession(true);toast(message)}});
function createStudyClock(now){return groups.continuesOutside()?new BackgroundClock(now,groups.snapshot.group.backgroundMinutes):new StudyClock(now)}
function policyAway(){return groups.continuesOutside()&&!attention.allowed&&!paused}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000)}
function persist(){const saved=accountStore.write(state);if(!saved)toast('ذخیرهٔ موقت در دسترس نیست؛ از گزارشت خروجی بگیر.');return saved}
function emptyHistory(){return `<div class="empty-history">${icon('book')}<strong>اولین صفحه هنوز نوشته نشده.</strong><p>جلسهٔ اولت را شروع کن؛ ادامه‌اش اینجا ثبت می‌شود.</p></div>`}
function liveRecord(){if(!clock)return null;const snap=clock.snapshot(performance.now());return {id:'live',subjectId:sessionSubject.id,subjectName:sessionSubject.name,color:sessionSubject.color,start:wallStart,end:wallStart+snap.elapsedMs,activeMs:snap.activeMs,elapsedMs:snap.elapsedMs,thoughts:parkedThoughts.map(t=>({...t})),segments:snap.segments.map(s=>({from:wallStart+s.from-clock.start,to:wallStart+s.to-clock.start,type:s.type}))}}
function records(){const live=liveRecord();return live?[...state.sessions,live]:state.sessions}
function inRange(list,from,to){return list.reduce((sum,s)=>sum+(s.segments||[]).reduce((n,p)=>n+(p.type==='present'?Math.max(0,Math.min(to,p.to)-Math.max(from,p.from)):0),0),0)}
window.addEventListener('miz-progress',()=>renderStats());
function renderStats(){
  const now=Date.now(),all=records(),keys=periodKeys(now),progress=groups.progress,today=Math.max(inRange(all,dayStart(now),dayEnd(now)),progress?.period?.day===keys.day?Number(progress.dailyMs)||0:0),week=Math.max(inRange(all,weekStart(now),dayEnd(now)),progress?.period?.week===keys.week?Number(progress.weeklyMs)||0:0);
  $('#todayValue').innerHTML=`${fa(Math.floor(today/60000))} <small>دقیقه</small>`;$('#weekValue').innerHTML=`${fa(Math.floor(week/60000))} <small>دقیقه</small>`;
  const count=all.filter(s=>s.start>=dayStart(now)).length,wcount=all.filter(s=>s.start>=weekStart(now)).length;
  $('#todaySessions').textContent=count?`${fa(count)} جلسهٔ مطالعه`:today?'مطالعهٔ ثبت‌شده در حساب':'هنوز شروع نکرده‌ای';$('#weekSessions').textContent=wcount?`${fa(wcount)} جلسهٔ مطالعه`:'شنبه تا امروز';
  $('#goalValue').innerHTML=`${fa(Math.floor(today/60000))} <small>از ${fa(state.goal)} دقیقه</small>`;$('#goalBar').style.width=`${Math.min(100,today/(state.goal*60000)*100)}%`;$('.goal-stat').style.setProperty('--goal-percent',`${Math.min(100,today/(state.goal*60000)*100)}%`);
  const days=Array.from({length:7},(_,i)=>nextDay(weekStart(now),i)),values=days.map(d=>inRange(all,d,nextDay(d))),max=Math.max(3600000,...values);
  const names=['ش','ی','د','س','چ','پ','ج'];
  $('#weeklyChart').innerHTML=days.map((d,i)=>`<div class="chart-day ${dayStart(now)===d?'today':''}" title="${dateLabel(d)}: ${duration(values[i])}"><small>${values[i]>0?fa(Math.floor(values[i]/60000)):''}</small><div class="chart-track"><div class="chart-fill" style="height:${Math.max(2,values[i]/max*100)}%"></div></div><span>${names[i]}${dayStart(now)===d?' · امروز':''}</span></div>`).join('');
  $('#weeklyMessage').textContent=week?`${duration(week)} فرصت برای یاد گرفتن ساخته‌ای.`:'نمودارت با اولین جلسه جان می‌گیرد.';
}
function renderPills(){
  if(!state.subjects.some(s=>s.id===selected))selected=state.subjects[0]?.id??null;
  const current=state.subjects.find(s=>s.id===selected);
  $('#timerCaption').textContent=current?`زمان خالص مطالعه · ${current.name}`:'زمان خالص مطالعه';
  $('#subjectPills').innerHTML=state.subjects.length?state.subjects.map(s=>`<button class="subject-pill ${s.id===selected?'selected':''}" data-subject="${esc(s.id)}" style="--subject-color:${s.color}" aria-pressed="${s.id===selected}" ${active||starting?'disabled':''}><i></i>${esc(s.name)}</button>`).join(''):'<div class="empty-subject-message"><strong>اولین درس را خودت اضافه کن.</strong><span>فهرست درس‌ها مخصوص توست.</span></div>';
  if(!active&&!starting){$('#startButton').innerHTML=current?`${icon('camera')}شروع مطالعه<svg class="arrow"><use href="#i-arrow"/></svg>`:`${icon('plus')}افزودن اولین درس<svg class="arrow"><use href="#i-arrow"/></svg>`;$('#startNote').innerHTML=current?`${icon('shield')}تنفس آرام اختیاری است؛ تصویر دوربین ذخیره نمی‌شود.`:'نام درس را اضافه کن، سپس مطالعه را شروع کن.'}
}
function historyHTML(sessions,full=false){if(!sessions.length)return emptyHistory();return `<table class="history-table"><thead><tr><th>درس</th><th>زمان خالص</th><th>${full?'مدت کل / وقفه':'تاریخ'}</th>${full?'<th>تاریخ</th>':''}</tr></thead><tbody>${sessions.map(s=>`<tr data-session="${esc(s.id)}" tabindex="0" role="button" aria-label="جزئیات مطالعهٔ ${esc(s.subjectName)}"><td><span class="subject-label" style="--subject-color:${s.color}"><i></i>${esc(s.subjectName)}</span><small>${hourLabel(s.start)}${s.interrupted?' · ناتمام':''}</small></td><td class="duration">${duration(s.activeMs)}</td><td>${full?`${duration(s.elapsedMs)}<small>وقفه: ${duration(s.elapsedMs-s.activeMs)}</small>`:dateLabel(s.start)}</td>${full?`<td>${dateLabel(s.start)}</td>`:''}</tr>`).join('')}</tbody></table>`}
function renderHistory(){const sorted=[...state.sessions].sort((a,b)=>b.start-a.start);$('#recentHistory').innerHTML=historyHTML(sorted.slice(0,3));const filter=$('#reportFilter').value;$('#reportFilter').innerHTML='<option value="all">همهٔ درس‌ها</option>'+[...new Map([...state.subjects,...state.sessions.map(s=>({id:s.subjectId,name:s.subjectName}))].map(s=>[s.id,s])).values()].map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');$('#reportFilter').value=[...$('#reportFilter').options].some(o=>o.value===filter)?filter:'all';renderReports()}
function renderReports(){
  const filter=$('#reportFilter').value;
  currentReport=buildReport(state.sessions,{period:reportPeriod,reference:reportReference,subject:filter,name:groups.name,goal:state.goal});
  const r=currentReport;$('#reportDate').value=inputDate(reportReference);$('#reportRangeLabel').textContent=r.label;
  $$('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===reportPeriod)));
  $('#reportHistory').innerHTML=r.sessions.length?historyHTML([...r.sessions].reverse(),true):'<div class="report-empty">جلسه‌ای در این بازه ثبت نشده است. بازهٔ دیگری را انتخاب کن.</div>';
  const summaries=[['زمان خالص',`${fa(Math.floor(r.activeMs/60000))} <small>دقیقه</small>`,'clock','warm'],['جلسهٔ مطالعه',`${fa(r.count)} <small>جلسه</small>`,'book','sage'],['سهم حضور',`${fa(r.presence)}٪ <small>از مدت جلسه</small>`,'target','lilac']];
  $('#reportSummary').innerHTML=summaries.map(([title,value,ico,color])=>`<article class="stat-card"><span class="stat-icon ${color}">${icon(ico)}</span><div><p>${title}</p><div class="stat-value">${value}</div></div></article>`).join('');
  const bars=reportChart(r),max=Math.max(60000,...bars.map(d=>d.activeMs));
  $('#reportRhythm').innerHTML=bars.map((d,i)=>`<div class="rhythm-bar" title="${esc(d.label)}: ${duration(d.activeMs)}"><span>${d.activeMs?fa(Math.floor(d.activeMs/60000)):''}</span><div><i style="height:${Math.max(1,d.activeMs/max*100)}%"></i></div><small>${reportPeriod==='day'?d.label:reportPeriod==='month'?(i%5===0||i===bars.length-1?new Intl.DateTimeFormat('fa-IR',{day:'numeric'}).format(d.from):''):new Intl.DateTimeFormat('fa-IR',{weekday:'short'}).format(d.from)}</small></div>`).join('');
  $('#reportRhythmCaption').textContent=reportPeriod==='day'?'ساعت‌های روز':`${fa(r.studyDays)} روز مطالعه`;
  $('#reportRhythmNote').textContent=r.count?`میانگین در روزهای مطالعه: ${duration(r.averageMs)}`:'اولین جلسهٔ این بازه را ثبت کن.';
  $('#reportSubjectCount').textContent=`${fa(r.subjects.length)} درس`;
  $('#subjectBreakdown').innerHTML=r.subjects.length?r.subjects.map(s=>`<div class="breakdown-row" style="--subject-color:${s.color}"><span class="subject-label"><i></i>${esc(s.name)}</span><div class="breakdown-track"><i style="width:${r.activeMs?s.total/r.activeMs*100:0}%"></i></div><span>${duration(s.total)}</span></div>`).join(''):'<p class="report-empty">در این بازه هنوز مطالعه‌ای ثبت نشده است.</p>';
}
async function openReportExport(){
  renderReports();const report=currentReport;let theme='paper',pdfURL=null;
  dialog('گزارش تو، با مهر میز',`<div class="pdf-export-intro"><p>گزارش ${PERIODS[report.period]} · ${esc(report.label)}</p><span>${fa(report.count)} جلسه · ${duration(report.activeMs)} مطالعه</span></div><div class="pdf-options"><div class="pdf-cover-preview"><img id="pdfCoverPreview" alt="پیش‌نمایش جلد گزارش مطالعه"></div><div class="pdf-settings"><label>ظاهر گزارش</label><div class="pdf-theme-tabs" role="group" aria-label="ظاهر PDF"><button data-pdf-theme="paper" aria-pressed="true"><i></i>کاغذی</button><button data-pdf-theme="night" aria-pressed="false"><i></i>شبانه</button></div><label class="pdf-thought-option"><input id="includePDFThoughts" type="checkbox"><span>افکار خصوصی هم اضافه شوند<small>به‌صورت پیش‌فرض در PDF نمی‌آیند.</small></span></label><p class="pdf-details">جلد اختصاصی، نمودار مطالعه، سهم درس‌ها و جزئیات جلسه‌ها در قطع A4.</p><span class="pdf-stamp-label">${icon('check')}با مهر گرافیکی میز</span></div></div><a id="pdfReadyDownload" class="primary-button pdf-download" hidden download>دانلود مستقیم PDF</a><button id="downloadReportPDF" class="primary-button pdf-download">${icon('download')}دریافت PDF</button><p id="pdfExportStatus" class="pdf-export-status" role="status">فایل روی دستگاهت ساخته می‌شود.</p>`);
  const module=await import('./report-pdf.js');
  const preview=async()=>{const revision=++pdfPreviewRevision;const canvas=await module.renderReportPreview(report,{theme});if(revision===pdfPreviewRevision&&$('#pdfCoverPreview'))$('#pdfCoverPreview').src=canvas.toDataURL('image/jpeg',.82);canvas.width=0};
  preview().catch(()=>{});
  $$('[data-pdf-theme]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.pdfTheme;if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null;$('#pdfReadyDownload').hidden=true}$$('[data-pdf-theme]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));preview().catch(()=>{})}));
  $('#downloadReportPDF').addEventListener('click',async e=>{
    const button=e.currentTarget;button.disabled=true;$('#pdfExportStatus').textContent='در حال طراحی و آماده‌سازی فایل…';
    try{const blob=await module.createReportPdf(report,{theme,includeThoughts:$('#includePDFThoughts').checked});if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL=URL.createObjectURL(blob);const a=$('#pdfReadyDownload');a.href=pdfURL;a.download=module.reportFilename(report);a.hidden=false;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),600000);if($('#pdfExportStatus'))$('#pdfExportStatus').textContent='PDF آماده است؛ اگر دانلود شروع نشد، «دانلود مستقیم» را بزن.'}
    catch{if($('#pdfExportStatus'))$('#pdfExportStatus').textContent='فایل ساخته نشد. دوباره امتحان کن.'}finally{button.disabled=false}
  });
}

function renderSubjects(){
  if(!state.subjects.length){$('#subjectsGrid').innerHTML=`<div class="card subjects-empty">${icon('book')}<h2>از درس‌های خودت شروع کن.</h2><p>هنوز درسی اضافه نکرده‌ای.</p><button class="primary-button" data-open="addSubject">${icon('plus')}افزودن اولین درس</button></div>`;return}
  $('#subjectsGrid').innerHTML=state.subjects.map(s=>{const sessions=state.sessions.filter(r=>r.subjectId===s.id);return `<article class="card subject-tile"><span class="stat-icon" style="background:${s.color}18;color:${s.color}">${icon('book')}</span><h2>${esc(s.name)}</h2><p>${duration(sessions.reduce((n,r)=>n+r.activeMs,0))} مطالعه · ${fa(sessions.length)} جلسه</p><div class="subject-actions"><button class="text-button" data-study="${esc(s.id)}">برویم سراغ این درس ${icon('arrow')}</button><button class="delete-subject" data-delete-subject="${esc(s.id)}">حذف درس</button></div></article>`}).join('');
}
function renderAll(){renderPills();renderStats();renderHistory();renderSubjects();groups.setSubjects(state.subjects,selected)}
function showPage(name){if(focusView.isOpen)return;if(!['desk','reports','subjects','groups','ranking'].includes(name))name='desk';page=name;document.body.dataset.page=name;groups.setPage(name);$$('.page').forEach(el=>el.hidden=el.id!==`page-${name}`);$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('#pageCrumb').textContent={desk:'میز مطالعه',reports:'گزارش مطالعه',subjects:'درس‌های من',groups:'گروه‌های مطالعه',ranking:'رتبه‌بندی'}[name];if(location.hash!==`#${name}`)history.replaceState(null,'',`#${name}`);window.scrollTo({top:0,behavior:'smooth'});renderAll()}
function dialog(title,html){$('#dialogTitle').textContent=title;$('#dialogContent').innerHTML=html;if(!$('#appDialog').open)$('#appDialog').showModal()}
function closeDialog(){$('#appDialog').close()}
function openDialog(type){
  if(type==='name'){groups.openNameDialog();return}
  if(type==='addSubject'){
    if(active||starting){toast('بعد از اتمام جلسه می‌توانی درس جدید اضافه کنی.');return}
    dialog('یک درس تازه',`<form id="subjectForm"><label class="form-field">نام درس<input name="name" placeholder="مثلاً زیست‌شناسی" required maxlength="40" autocomplete="off"></label><label class="form-field">رنگ درس</label><div class="color-picker">${colors.map((c,i)=>`<button type="button" class="color-option ${i===0?'chosen':''}" data-color="${c}" style="--subject-color:${c}" aria-label="رنگ ${i+1}" aria-pressed="${i===0}"></button>`).join('')}</div><p class="dialog-copy" style="margin-top:20px">برای هر درس، زمان و جلسه‌ها جداگانه ثبت می‌شوند.</p><button class="primary-button" style="width:100%" type="submit">افزودن درس ${icon('plus')}</button></form>`);
    $('#subjectForm').addEventListener('submit',e=>{e.preventDefault();const name=new FormData(e.target).get('name').trim();if(!name)return;if(state.subjects.some(s=>s.name===name)){toast('این درس را قبلاً اضافه کرده‌ای.');return}const color=$('.color-option.chosen').dataset.color;const subject={id:uid(),name,color};state.subjects.push(subject);selected=subject.id;persist();renderAll();closeDialog();toast('درس جدیدت آماده است.')});
  }else if(type==='settings'){
    dialog('تنظیمات فضای تو',`<div class="settings-name-row"><span>نام نمایشی</span><strong>${esc(groups.name)}</strong><button class="text-button" data-open="name">تغییر نام</button></div><form id="settingsForm"><label class="form-field">هدف روزانه (دقیقه)<input name="goal" type="number" min="5" max="1440" step="5" value="${state.goal}" required inputmode="numeric"></label><p class="dialog-copy">هدفت را واقع‌بینانه انتخاب کن؛ حتی یک جلسهٔ کوتاه هم یک قدم رو به جلوست.</p><div class="notice">درس‌ها، جلسه‌های نهایی و افکار در حساب میز ذخیره می‌شوند. پیش‌نویس جلسهٔ جاری و تغییرات در انتظار اتصال، موقتاً در همین مرورگر می‌مانند. پیش از خروج، وضعیت ذخیره در حساب را بررسی کن.</div><button class="primary-button" style="width:100%;margin-top:22px" type="submit">ذخیرهٔ تنظیمات ${icon('check')}</button></form>`);
    $('#settingsForm').addEventListener('submit',e=>{e.preventDefault();state.goal=Number(new FormData(e.target).get('goal'));persist();renderStats();closeDialog();toast('هدف تازه‌ات ذخیره شد.')});
  }else if(type==='guide'){
    dialog('چطور با میز مطالعه کنیم؟',`<div class="guide-steps"><div class="guide-step"><strong>درست بنشین، درس را انتخاب کن</strong><p>دوربین روبه‌رو باشد، نور کافی داشته باشی و سر و هر دو شانه در تصویر دیده شوند. «شروع مطالعه» را بزن؛ اگر خواستی تنفس آرام را انجام بده یا آن را رد کن، سپس اجازهٔ دوربین بده.</p></div><div class="guide-step"><strong>دو ثانیه برای تأیید حضور تو</strong><p>چند لحظه در حالت معمول مطالعه بنشین تا حضور چهره و بالاتنه تأیید شود. بعد از تأیید حضور، زمان خالص شروع می‌شود.</p></div><div class="guide-step"><strong>حضورت ثبت می‌شود، غیبتت خالی می‌ماند</strong><p>با خروج از تصویر یا مرورگر، شمارش متوقف می‌شود. می‌توانی جای نشستن را عوض کنی؛ صورت و شانه‌ها در تصویر باشند. پلک‌زدن عادی مانع شمارش نیست؛ بسته ماندن چشم‌ها برای چند ثانیه آن را متوقف می‌کند.</p></div><div class="guide-step"><strong>یک صفحه، فقط برای تمرکز</strong><p>هنگام مطالعه دوربین تمام صفحه است. از آیکن هدفون صدای محیط را پخش کن؛ از آیکن فکر برای کنار گذاشتن حواس‌پرتی‌ها استفاده کن و پس از جلسه فهرستشان را ببین. از دکمهٔ «تصویر» برای ندیدن چهرهٔ خودت استفاده کن؛ تشخیص حضور همچنان فعال می‌ماند. از آیکن چشم کنار زمان هم می‌توانی تایمر را پنهان کنی. با «توقف»، دوربین بسته و نتیجهٔ جلسه ثبت می‌شود.</p></div></div><div class="notice"><strong>این ابزار حضور را تخمین می‌زند، نه میزان یادگیری.</strong><br>هر فرد دیگری در جای تو هم ممکن است حضور تشخیص داده شود. نگاه‌کردن به کتاب یا فکر کردن قابل تأیید قطعی نیست. تغییر نور، پوشاندن بدن و زاویهٔ دوربین می‌توانند باعث خطا شوند.</div><p class="dialog-copy" style="margin:15px 0 0">تصویر و صدا ذخیره یا ارسال نمی‌شوند و میکروفون فعال نمی‌شود. برای ادامهٔ تشخیص، صفحه باید باز و قابل مشاهده بماند؛ تب پنهان یا صفحهٔ قفل‌شده زمان نمی‌گیرد. در موبایل اجازه بده صفحه روشن بماند.</p><button class="primary-button" data-close style="width:100%;margin-top:18px">آماده‌ام ${icon('check')}</button>`);
  }
}
function setStatus(message,type=''){focusView.setStatus(message,type);document.body.dataset.sessionState=type||'idle'; $('#statusText').textContent=message;$('#sessionStatus').className=`status-pill ${type}` }
function setCamera(message,sub=''){const p=$('#cameraMessage');p.textContent=message;if(sub){const small=document.createElement('small');small.textContent=sub;p.append(small)}}
function drawTimeline(el,snap){
  const elapsed=snap.elapsedMs;if(!elapsed){el.innerHTML='<div class="empty-timeline">دقیقه‌های خوب از اینجا شروع می‌شوند</div>';return}
  // Kept in chronological left-to-right order; blank sections are actual gaps.
  el.replaceChildren(...snap.segments.map(s=>{const b=document.createElement('span');b.className=`timeline-block ${s.type}`;b.style.width=`${(s.to-s.from)/elapsed*100}%`;b.title=`${s.type==='present'?'حضور':'وقفه'}: ${duration(s.to-s.from)}`;return b}));
}
async function getModel(){if(model)return model;if(modelPromise)return modelPromise;modelPromise=(async()=>{const body=await createPoseEngine(),face=await createFaceEngine();return {async detect(video,now){const pose=await body.detect(video,now);const faceState=await face.detect(video,now);return {pose,face:faceState}}}})();try{model=await modelPromise;return model}catch(e){modelPromise=null;throw e}}
async function requestWake(){const token=runToken;try{if('wakeLock'in navigator&&document.visibilityState==='visible'){const lock=await navigator.wakeLock.request('screen');if(token!==runToken||(!active&&!starting)||document.hidden){await lock.release();return}wakeLock=lock}}catch{/* Visibility fallback stops credit while hidden. */}}
function releaseWake(){if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null}}
async function acquireLock(){
  if(!navigator.locks)return true;
  return new Promise(resolve=>{navigator.locks.request('miz-study-session',{ifAvailable:true},async lock=>{if(!lock){resolve(false);return}await new Promise(release=>{lockRelease=release;resolve(true)})}).catch(()=>resolve(false))});
}
async function confirmStudySubject(){const d=$('#subjectConfirmDialog');d.returnValue='';$('#confirmSubjectOptions').innerHTML=state.subjects.map(s=>`<label class="subject-confirm-option"><input type="radio" name="confirmedSubject" value="${esc(s.id)}" ${s.id===selected?'checked':''}><span>${esc(s.name)}</span></label>`).join('');const button=$('#confirmSubjectStart'),update=()=>{const id=d.querySelector('input:checked')?.value,name=state.subjects.find(s=>s.id===id)?.name;button.disabled=!name;button.textContent=name?`شروع مطالعهٔ «${name}»`:'یک درس انتخاب کن'};d.onchange=update;update();d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>{if(d.returnValue==='start'){selected=d.querySelector('input:checked').value;renderAll();resolve(true)}else resolve(false)},{once:true}))}
async function startSession(){
  if(active||starting||choosingSubject)return;
  if(!groups.name){groups.openNameDialog();return}
  if(!state.subjects.length){openDialog('addSubject');return}
  if(!storageAvailable){toast('برای ثبت جلسه، ذخیره‌سازی مرورگر باید فعال باشد.');return}

  choosingSubject=true;const confirmed=await confirmStudySubject();choosingSubject=false;if(!confirmed)return;
  if(groups.requiresCamera())$('#cameraOptIn').checked=true;
  starting=true;const token=++runToken;
  if(!await acquireLock()){starting=false;document.body.classList.remove('session-active');toast('یک جلسه در تب دیگری باز است. ابتدا همان جلسه را تمام کن.');return}
  if(token!==runToken){lockRelease?.();lockRelease=null;return}
  try{await groupsReady;if(!groups.room&&groups.auth)await groups.enterPersonal()}catch(e){starting=false;lockRelease?.();lockRelease=null;toast(e.message);return}
  sessionSubject={...state.subjects.find(s=>s.id===selected)};$('#focusSubjectName').textContent=sessionSubject.name;
  parkedThoughts=[];
  syncAttention();
  document.body.classList.remove('session-finished');document.body.classList.add('session-active');groups.beginStudy(sessionSubject.name);focusView.open();
  $('#studyTimer').innerHTML='00<span>:</span>00<span>:</span>00';$('#sessionElapsed').textContent='مدت کل: ۰۰:۰۰';$('#sessionStartLabel').textContent='شروع جلسه';drawTimeline($('#liveTimeline'),{elapsedMs:0,segments:[]});
  $('#cameraError').hidden=true;$('#startButton').hidden=true;$('#finishButton').hidden=false;$('#finishButton').innerHTML='لغو آماده‌سازی';$('#startNote').textContent='در حال آماده‌سازی جلسهٔ مطالعه…';
  setStatus('در حال آماده‌سازی جلسه…');setCamera('دوربین فقط با انتخاب تو فعال می‌شود.','میکروفون خاموش می‌ماند.');renderPills();
  try{
    await requestWake();if(token!==runToken)return;
    const prepared=await focusView.prepareBreathing();if(!prepared||token!==runToken)return;
    if(!$('#cameraOptIn')?.checked){startManualStudy();return}
    setStatus('اجازهٔ دوربین را تأیید کن.');
    const camera=await requestStudyCamera(navigator.mediaDevices);const requestedStream=camera.stream;
    if(token!==runToken){requestedStream?.getTracks().forEach(t=>t.stop());return}
    if(!requestedStream){startManualStudy(camera.message);return}
    if(token!==runToken){requestedStream.getTracks().forEach(t=>t.stop());return}
    if($('#roomPolicyError'))$('#roomPolicyError').hidden=true;groups.studyMode='camera';stream=requestedStream;video.srcObject=stream;await video.play();if(token!==runToken)return;focusView.ready();
    stream.getVideoTracks().forEach(t=>t.enabled=attention.allowed);focusView.setAttention(attention.allowed);
    $('#cameraPlaceholder').hidden=true;$('#hideCamera').hidden=false;$('#cameraBadge').classList.add('live');$('#cameraBadge').innerHTML='<i></i>دوربین روشن';
    setStatus('مدل تشخیص حضور در حال بارگذاری…');setCamera('تصویر آماده است؛ تشخیص حضور در حال آماده‌سازی.');
    const track=stream.getVideoTracks()[0];track.addEventListener('ended',()=>{if(active||starting)cameraDisconnected()});track.addEventListener('mute',()=>{if(clock)clock.observe(performance.now(),policyAway())});
    await getModel();if(token!==runToken)return;
    starting=false;active=true;presenceTracker.reset();calibration=null;calibrationStarted=null;calibrationSamples=[];lastFrameTime=-1;paused=false;
    $('#finishButton').innerHTML=`${icon('stop')}اتمام و ثبت`;$('#pauseButton').hidden=false;$('#pauseButton').disabled=true;
    $('#sessionMode').textContent='تشخیص حضور با دوربین';$('#cameraCorners').hidden=false;$('#startNote').textContent='صفحه را باز نگه دار. حضور جلوی میز تخمین زده می‌شود، نه کیفیت درس خواندن.';
    setStatus('صورت و شانه‌ها در تصویر باشند؛ دو ثانیه راحت بنشین.');setCamera('در حالت معمول مطالعه بنشین.','صورت و شانه‌ها دیده شوند؛ نگاه به کتاب هم مجاز است.');
    await requestWake();if(token!==runToken)return;
    uiTimer=setInterval(updateLive,500);detectLoop(token);
  }catch(e){if(token!==runToken)return;startManualStudy(cameraFallbackMessage(e))}
}
function startManualStudy(message='',{pause=false}={}){
  if(groups.requiresCamera()){if(active||clock)finishSession(true);else cleanup();const text='مدیر این اتاق دوربین را الزامی کرده است. دوربین آماده نیست و زمانی شمرده نمی‌شود؛ همچنان داخل اتاق هستی.';const error=$('#roomPolicyError');if(error){error.textContent=text;error.hidden=false}toast(text);return}
  groups.studyMode='manual';
  ++runToken;clearTimeout(loopTimer);clearInterval(uiTimer);loopTimer=null;
  document.body.classList.add('manual-session');
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}video.srcObject=null;
  const hadClock=!!clock,now=performance.now();if(!clock)clock=createStudyClock(now);clock=manualClock(clock,now);if(!hadClock)wallStart=Date.now();
  starting=false;active=true;paused=pause;calibration=null;
  if(paused)clock.observe(now,false);
  $('#cameraOptIn').checked=false;if($('#roomCamera'))$('#roomCamera').checked=false;
  $('#manualPauseFocus').innerHTML=paused?'▷<small>ادامه</small>':'Ⅱ<small>استراحت</small>';
  focusView.ready();focusView.enableParking();
  $('#finishButton').innerHTML=`${icon('stop')}اتمام و ثبت`;$('#pauseButton').hidden=false;$('#pauseButton').disabled=false;
  $('#sessionMode').textContent='ثبت دستی · بدون دوربین';$('#cameraBadge').innerHTML='<i></i>دوربین خاموش';$('#cameraBadge').classList.remove('live');
  $('#cameraError').hidden=true;setCamera('مطالعه بدون دوربین.','زمان به‌صورت دستی ثبت می‌شود؛ هنگام استراحت، شمارش را متوقف کن.');
  setStatus(message||(paused?'جلسه در حال استراحت است؛ برای ادامه دکمهٔ ادامه را بزن.':'ثبت دستی زمان فعال است.'),message?'manual':paused?'away':'present');
  if(message)toast(message);
  uiTimer=setInterval(()=>{if(!clock)return;clock.observe(performance.now(),!paused&&(groups.continuesOutside()||attention.allowed));updateLive()},500);saveDraft();updateLive();
}
async function detectLoop(token){
  if(!active||token!==runToken)return;
  const now=performance.now();
  syncAttention();const attentionEpoch=attention.epoch;
  try{
    const track=stream?.getVideoTracks()[0];
    if(!attention.allowed||paused||track?.readyState!=='live'||track?.muted||video.readyState<2||video.currentTime===lastFrameTime){
      clock?.observe(now,policyAway());if(attention.allowed&&clock)setStatus(paused?'استراحت؛ هر وقت آماده بودی ادامه بده':'دریافت تصویر متوقف شده؛ زمان ثبت نمی‌شود','away');
    }else{
      lastFrameTime=video.currentTime;
      const {pose,face}=await model.detect(video,now);
      if(!active||token!==runToken)return;
      syncAttention();
      if(!attention.accepts(attentionEpoch)||paused){clock?.observe(performance.now(),policyAway());loopTimer=setTimeout(()=>detectLoop(token),500);return}
      const torso=torsoFromPose(pose),presence=presenceTracker.observe(now,{torso,pose,face});
      if(!focusView.isOpen)drawPose(pose);
      if(!calibration){
        if(presence.present){if(calibrationStarted===null)calibrationStarted=now;setStatus(`تنظیم جای تو… ${fa(Math.max(1,Math.ceil((2000-(now-calibrationStarted))/1000)))} ثانیه`);if(now-calibrationStarted>=2000){calibration={confirmed:true};clock=createStudyClock(now);wallStart=Date.now();clock.observe(now,true);focusView.enableParking();$('#pauseButton').disabled=false;$('#sessionStartLabel').textContent=`شروع: ${hourLabel(wallStart)}`;setStatus('پشت میز هستی؛ زمانت در حال ثبت است','present');saveDraft()}}
        else{calibrationStarted=null;calibrationSamples=[];setStatus(presence.reason==='standing'?'برای مطالعه بنشین؛ شمارش هنوز شروع نشده.':presence.reason==='eyes'?'چشم‌ها بسته‌اند؛ شمارش هنوز شروع نشده.':'صورت و شانه‌ها را داخل تصویر قرار بده.');setCamera('در انتظار حضور تو.','صورت و شانه‌ها دیده شوند؛ لازم نیست به دوربین نگاه کنی.');}
      }else{
        const present=presence.present;clock.observe(now,present);
        setStatus(present?'حضورت تأیید شد؛ زمانت در حال ثبت است':presence.reason==='eyes'?'چشم‌ها مدتی بسته‌اند؛ زمان متوقف شد':presence.reason==='standing'?'از حالت مطالعه بلند شدی؛ زمان متوقف شد':presence.reason==='face'?'صورت دیده نمی‌شود؛ زمان متوقف شد':'حضورت دیده نمی‌شود؛ زمان متوقف شد',present?'present':'away');
        setCamera(present?'حضورت پشت میز شناسایی شد.':'منتظرت هستم؛ این زمان حساب نمی‌شود.',present?'وقتی از میز دور شوی، شمارش متوقف می‌شود.':'در هر جای تصویر بنشین؛ چهره و شانه‌ها دیده شوند.');
        $('#cameraBadge').innerHTML=`<i></i>${present?'حضور تأیید شد':'وقفهٔ خودکار'}`;
      }
    }
  }catch(e){if(token!==runToken||document.body.classList.contains('manual-session'))return;startManualStudy('تشخیص دوربین متوقف شد؛ زمان قبلی حفظ شده است. برای ادامهٔ ثبت دستی، «ادامه» را بزن.',{pause:!!clock});return}
  loopTimer=setTimeout(()=>detectLoop(token),500);
}
function drawPose(points){
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!points)return;
  ctx.strokeStyle='#d9edbcaa';ctx.fillStyle='#e5f4d4';ctx.lineWidth=2;
  const a=points[11],b=points[12];if(a?.visibility>.5&&b?.visibility>.5){ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();for(const p of[a,b]){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,4,0,Math.PI*2);ctx.fill()}}
}
function updateLive(){
  if(!clock)return;if(policyAway())clock.observe(performance.now(),true);if(clock.expired&&!paused){paused=true;$('#manualPauseFocus').innerHTML='▷<small>ادامه</small>';$('#pauseButton').innerHTML=`${icon('play')}<span>ادامه</span>`;toast('سقف ادامهٔ خودکار زمان تمام شد؛ برای مطالعهٔ تازه، ادامه را بزن.')}const snap=clock.snapshot(performance.now());groups.recordStudy(snap.activeMs,clock.present&&!paused);focusView.setTime(time(groups.room?groups.overallDailyMs():snap.activeMs));$('#focusSessionTime').textContent='این جلسه: '+time(snap.activeMs);
  if(!focusView.isOpen){$('#studyTimer').innerHTML=time(snap.activeMs).split(':').join('<span>:</span>');$('#sessionElapsed').textContent=`مدت کل: ${time(snap.elapsedMs)}`;drawTimeline($('#liveTimeline'),snap);renderStats()}
  if(performance.now()-lastSaved>5000){saveDraft();lastSaved=performance.now()}
}
function pauseSession(){if(!clock)return;paused=!paused;if(!paused)clock.renew?.();clock.observe(performance.now(),false);if(document.body.classList.contains('manual-session')){setStatus(paused?'جلسه در حال استراحت است.':'ثبت دستی زمان فعال است.',paused?'away':'present');$('#pauseButton').innerHTML=`${icon(paused?'play':'pause')}<span>${paused?'ادامه':'استراحت'}</span>`;saveDraft();updateLive();return}$('#cameraBadge').innerHTML=`<i></i>${paused?'استراحت دستی':'در انتظار حضور'}`;$('#pauseButton').innerHTML=`${icon(paused?'play':'pause')}<span>${paused?'ادامه':'استراحت'}</span>`;setStatus(paused?'استراحت؛ هر وقت آماده بودی ادامه بده':'در انتظار تأیید دوبارهٔ حضور','away');setCamera(paused?'استراحتت خوش؛ زمان متوقف است.':'در انتظار تصویر تازه از جای تو.');saveDraft();updateLive()}
function saveDraft(){if(!clock)return false;const rec=liveRecord();rec.id='recovered-'+wallStart;if(groups.room&&groups.continuesOutside()){rec.roomVisitId=groups.room.visitId;rec.roomBase=groups.studyBase;rec.backgroundMinutes=groups.snapshot.group.backgroundMinutes;}try{localStorage.setItem(DRAFT,JSON.stringify(rec));return true}catch{return false}}
function cleanup(){
  ++runToken;active=false;starting=false;document.body.classList.remove('session-active','manual-session');clearTimeout(loopTimer);clearInterval(uiTimer);loopTimer=null;uiTimer=null;
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null;focusView.close();releaseWake();lockRelease?.();lockRelease=null;
  $('#cameraPlaceholder').hidden=false;$('#cameraCorners').hidden=true;$('#hideCamera').hidden=true;$('#cameraView').classList.remove('obscured');$('#hideCamera').textContent='پنهان کردن';$('#cameraBadge').classList.remove('live');$('#cameraBadge').innerHTML='<i></i>دوربین خاموش';canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  $('#startButton').hidden=false;$('#finishButton').hidden=true;$('#pauseButton').hidden=true;$('#pauseButton').innerHTML=`${icon('pause')}<span>استراحت</span>`;$('#sessionMode').textContent='آمادهٔ یک شروع تازه';$('#startNote').innerHTML=`${icon('shield')}تنفس آرام اختیاری است؛ تصویر دوربین ذخیره نمی‌شود.`;
  renderPills();setCamera('وقتی پشت میز باشی، زمانت ثبت می‌شود.','از میز که دور شوی، شمارش متوقف می‌شود.');$('#startButton').focus({preventScroll:true});
}
function finishSession(interrupted=false){
  if(clock&&!focusView.flushThought()){
    const pending=createThought($('#parkedThought').value);if(pending)parkedThoughts.push(pending);
  }
  if(!active&&!starting)return;let rec=null;if(clock){clock.observe(performance.now(),false);rec=liveRecord();rec.id=uid();rec.interrupted=interrupted;state.sessions.push(rec)}
  if(rec)groups.endStudy(rec.activeMs);
  if(rec){$('#studyTimer').innerHTML=time(rec.activeMs).split(':').join('<span>:</span>');$('#sessionElapsed').textContent=`مدت کل: ${time(rec.elapsedMs)}`;drawTimeline($('#liveTimeline'),rec)}
  clock=null;calibration=null;cleanup();let saved=true;if(rec){saved=persist();if(saved){try{localStorage.removeItem(DRAFT)}catch{}}}renderAll();
  document.body.classList.toggle('session-finished',!!rec);setStatus(rec?'جلسه تمام شد؛ هر دقیقه‌اش یک قدم بود.':'آماده‌ای؟ از همین‌جا شروع کن');
  if(rec){showSession(rec,true,saved)}else toast('آماده‌سازی لغو شد. زمانی ثبت نشد.');
}
function showSession(rec,finished=false,saved=true){
  const percent=rec.elapsedMs?Math.round(rec.activeMs/rec.elapsedMs*100):0,thoughts=readThoughts(rec);
  const parking=thoughts.length?`<section class="parked-summary"><div class="parked-summary-heading"><h3>${icon('thought')}پارکینگ افکار</h3><span>${fa(thoughts.length)} فکر</span></div><p>حالا می‌توانی با خیال راحت به این فکرها برگردی. به‌صورت خصوصی در حساب تو ذخیره می‌شوند.</p><ol>${thoughts.map(t=>`<li>${esc(t.text)}</li>`).join('')}</ol></section>`:'';
  dialog(finished?(saved?'جلسه‌ات ثبت شد.':'نتیجهٔ جلسه؛ ذخیره انجام نشد'):`مطالعهٔ ${rec.subjectName}`,`<p class="dialog-copy" style="text-align:center">${esc(rec.subjectName)} · ${dateLabel(rec.start)} · ${hourLabel(rec.start)}${rec.interrupted?' · جلسه با وقفه پایان یافته':''}</p><div class="summary-number">${fa(Math.floor(rec.activeMs/60000))} <small>دقیقه و ${fa(Math.floor(rec.activeMs/1000)%60)} ثانیه</small></div><p class="dialog-copy" style="text-align:center">زمان ثبت‌شدهٔ مطالعه</p><div class="summary-meta"><div>مدت کل جلسه<strong>${duration(rec.elapsedMs)}</strong></div><div>وقفه‌ها<strong>${duration(rec.elapsedMs-rec.activeMs)}</strong></div></div><div class="timeline-title"><span>مسیر جلسه</span><span>${fa(percent)}٪ زمان فعال</span></div><div id="detailTimeline" class="timeline dialog-timeline"></div>${parking}${!saved?'<p class="storage-warning">ذخیرهٔ موقت انجام نشد. همین حالا خروجی گزارش بگیر و وضعیت ذخیره در حساب را بررسی کن.</p>':''}<div class="dialog-actions"><button class="primary-button" data-close>خوب است ${icon('check')}</button><button class="secondary-button" data-go-reports>دیدن گزارش</button></div>`);
  drawTimeline($('#detailTimeline'),rec);
}
function showCameraError(message){$('#cameraError').textContent=message;$('#cameraError').hidden=false;setStatus('دوربین آماده نیست؛ زمانی شمرده نمی‌شود','away')}
function cameraDisconnected(){if(policyAway())return;if((!active&&!starting)||document.body.classList.contains('manual-session'))return;startManualStudy('دوربین قطع شد؛ زمان قبلی حفظ شده است. برای ادامه بدون دوربین، «ادامه» را بزن.',{pause:!!clock})}
function deleteSubject(id){
  if(active||starting){toast('بعد از اتمام جلسه، درس‌ها را تغییر بده.');return}const subject=state.subjects.find(s=>s.id===id);
  dialog('حذف درس',`<p class="dialog-copy">درس «${esc(subject.name)}» از فهرست درس‌ها حذف شود؟ گزارش جلسه‌های قبلی آن حفظ می‌شوند.</p><div class="dialog-actions"><button class="secondary-button" data-close>انصراف</button><button class="primary-button" id="confirmDeleteSubject">حذف درس</button></div>`);
  $('#confirmDeleteSubject').addEventListener('click',()=>{state.subjects=state.subjects.filter(s=>s.id!==id);if(selected===id)selected=state.subjects[0]?.id??null;persist();renderAll();closeDialog();toast('درس از فهرست حذف شد.')});
}
function exportReport(){
  renderReports();const sessions=currentReport.sessions;if(!sessions.length){toast('هنوز جلسه‌ای برای خروجی گرفتن نیست.');return}
  const safe=s=>`"${String(s).replace(/^[=+\-@]/,"'").replaceAll('"','""')}"`;
  const csv='\uFEFF'+[['درس','شروع (ISO)','پایان (ISO)','خالص (ثانیه)','مدت کل (ثانیه)','وقفه (ثانیه)','وضعیت','پارکینگ افکار'],...sessions.map(s=>[s.subjectName,new Date(s.start).toISOString(),new Date(s.end).toISOString(),Math.floor(s.activeMs/1000),Math.floor(s.elapsedMs/1000),Math.floor((s.elapsedMs-s.activeMs)/1000),s.interrupted?'ناتمام':'اتمام',readThoughts(s).map(t=>t.text).join(' | ')])].map(row=>row.map(safe).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`miz-study-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('خروجی گزارش آماده شد.');
}
document.addEventListener('click',e=>{
  const target=e.target.closest('button,[data-session]');if(!target)return;
  if(target.dataset.page)showPage(target.dataset.page);
  if(target.dataset.open)openDialog(target.dataset.open);
  if(target.dataset.subject&&!active&&!starting){selected=target.dataset.subject;renderPills()}
  if(target.dataset.color){$$('.color-option').forEach(b=>{b.classList.toggle('chosen',b===target);b.setAttribute('aria-pressed',b===target)})}
  if(target.dataset.study){if(active||starting){toast('یک جلسه در حال اجراست؛ ابتدا آن را تمام کن.');showPage('desk');return}selected=target.dataset.study;showPage('desk');$('#startButton').focus()}
  if(target.dataset.deleteSubject)deleteSubject(target.dataset.deleteSubject);
  if(target.dataset.session){const rec=state.sessions.find(s=>s.id===target.dataset.session);if(rec)showSession(rec)}
  if(target.hasAttribute('data-close'))closeDialog();
  if(target.hasAttribute('data-go-reports')){closeDialog();showPage('reports')}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-session]')){e.preventDefault();e.target.click()}});
$('#manualPauseFocus').addEventListener('click',()=>{pauseSession();$('#manualPauseFocus').innerHTML=paused?'▷<small>ادامه</small>':'Ⅱ<small>استراحت</small>'});$('#startButton').addEventListener('click',startSession);$('#finishButton').addEventListener('click',()=>finishSession());$('#pauseButton').addEventListener('click',pauseSession);$('#closeDialog').addEventListener('click',closeDialog);
$('#appDialog').addEventListener('click',e=>{if(e.target===$('#appDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()}});
$$('[data-period]').forEach(b=>b.addEventListener('click',()=>{reportPeriod=b.dataset.period;renderReports()}));
$('#reportDate').addEventListener('change',e=>{if(e.target.value){reportReference=+localDate(e.target.value);renderReports()}});
$('#previousPeriod').addEventListener('click',()=>{reportReference=reportRange(reportPeriod,reportReference).from-1;renderReports()});
$('#nextPeriod').addEventListener('click',()=>{reportReference=reportRange(reportPeriod,reportReference).to;renderReports()});
$('#reportFilter').addEventListener('change',renderReports);$('#exportButton').addEventListener('click',()=>openReportExport().catch(()=>toast('آماده‌سازی گزارش انجام نشد؛ دوباره امتحان کن.')));$('#exportCSV').addEventListener('click',exportReport);
$('#hideCamera').addEventListener('click',()=>{const hidden=$('#cameraView').classList.toggle('obscured');$('#hideCamera').textContent=hidden?'نمایش تصویر':'پنهان کردن';toast(hidden?'فقط پیش‌نمایش پنهان شد؛ تشخیص حضور همچنان فعال است.':'پیش‌نمایش دوربین نمایش داده می‌شود.')});
function syncAttention(patch={}){
  const changed=attention.update({hidden:document.hidden,focused:document.hasFocus(),...patch});
  if(!changed)return;
  const continuing=groups.continuesOutside();clock?.setBackground?.(!attention.allowed);if(!continuing||paused)clock?.observe(performance.now(),false);else if(!attention.allowed)clock?.observe(performance.now(),true);lastFrameTime=video.currentTime;presenceTracker.reset();calibrationStarted=null;calibrationSamples=[];
  focusView.setAttention(attention.allowed);
  stream?.getVideoTracks().forEach(t=>t.enabled=attention.allowed);
  if(!attention.allowed){saveDraft();releaseWake();if(active||starting)setStatus(continuing?'زمان با اجازهٔ مدیر تا سقف مشخص‌شده ادامه دارد.':'صفحه فعال نیست؛ زمان مطالعه متوقف است',continuing?'manual':'away')}
  else if(active){setStatus('برگشتی؛ در انتظار تأیید دوبارهٔ حضور','away');requestWake()}
  if(attention.allowed&&active&&stream?.getVideoTracks()[0]?.readyState==='ended'){cameraDisconnected();return}
  if(clock){groups.recordStudy(clock.snapshot(performance.now()).activeMs,continuing&&!paused);updateLive()}
}
window.addEventListener('blur',()=>{if(!document.hasFocus())syncAttention({focused:false})});
window.addEventListener('focus',()=>syncAttention({focused:true}));
document.addEventListener('visibilitychange',()=>{syncAttention();if(!document.hidden)renderStats()});
window.addEventListener('pagehide',()=>syncAttention({suspended:true}));
window.addEventListener('pageshow',()=>syncAttention({suspended:false}));
document.addEventListener('freeze',()=>syncAttention({suspended:true}));
document.addEventListener('resume',()=>syncAttention({suspended:false}));
window.addEventListener('beforeunload',e=>{if(active&&clock){saveDraft();e.preventDefault();e.returnValue=''}});
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1)));
$('#currentDate').textContent=new Intl.DateTimeFormat('fa-IR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
async function recoverDraft(){
  // Do not recover another tab's ongoing session as an interrupted one.
  async function recover(){try{const draft=JSON.parse(localStorage.getItem(DRAFT));if(draft?.id&&!state.sessions.some(s=>s.id===draft.id)){if(draft.roomVisitId&&groups.recovered?.visitId===draft.roomVisitId){const recovered=groups.recovered;const extra=Math.max(0,Number(recovered.activeMs)-Number(draft.roomBase||0)-draft.activeMs);const end=Math.max(draft.end,Math.min(Date.now(),Number(recovered.runUntil)||Date.now()));const added=Math.min(extra,end-draft.end);if(added>0){draft.segments.push({from:draft.end,to:draft.end+added,type:'present'});if(draft.end+added<end)draft.segments.push({from:draft.end+added,to:end,type:'away'});draft.activeMs+=added;draft.end=end;draft.elapsedMs=end-draft.start;}}draft.interrupted=true;state.sessions.push(draft);if(persist()){localStorage.removeItem(DRAFT);renderAll();toast(draft.roomVisitId?'جلسهٔ قبلی با زمان پذیرفته‌شدهٔ سرور بازیابی شد.':'زمان تأییدشدهٔ جلسهٔ قبلی بازیابی شد. فاصلهٔ بسته‌بودن صفحه حساب نشده است.')}}}catch{}}
  if(navigator.locks){await navigator.locks.request('miz-study-session',{ifAvailable:true},async lock=>{if(lock)await recover()})}else await recover();
}
window.addEventListener('storage',e=>{if(e.key===STORAGE&&!active&&!starting){try{state=readStudyState(JSON.parse(e.newValue)).state;if(!state.subjects.some(s=>s.id===selected))selected=state.subjects[0]?.id??null;renderAll()}catch{}}});
showPage(new URLSearchParams(location.search).has('room')?'groups':location.hash.slice(1)||'groups');const groupsReady=groups.init();groupsReady.then(recoverDraft);
if(!storageAvailable)toast('ذخیره‌سازی مرورگر غیرفعال است. برای ثبت مطالعه، آن را فعال کن.');
