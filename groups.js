import {periodKeys,dayBoundary} from './progress-time.js';
import {roomView,memberCardsHTML,roomClock} from './room-view.js?v=70';
import {apiFetch,endpoint} from './account-store.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg><use href="#i-${n}"/></svg>`;
const fa=n=>new Intl.NumberFormat('fa-IR').format(n);
const clock=ms=>{const n=Math.floor(Math.max(0,ms)/1000);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':')};
class RequestError extends Error{constructor(message,status,code){super(message);this.status=status;this.code=code}}
export class StudyGroups {
 constructor({notify,onStartStudy,onAddSubject,onSubject,onForcedLeave}){
  this.notify=notify;this.onStartStudy=onStartStudy;this.onAddSubject=onAddSubject;this.onSubject=onSubject;this.onForcedLeave=onForcedLeave;
  this.deletedGroups=[];this.membersHidden=false;try{this.membersHidden=localStorage.getItem('miz.hideRoomMembers')==='1'}catch{}
  this.page='desk';this.auth=false;this.ready=false;this.name='';this.subjects=[];this.selected=null;this.items=[];this.room=null;this.snapshot=null;this.lastStudyMs=0;this.polling=false;this.listing=false;this.studyActive=false;this.timer=null;this.listTimer=null;this.error='';
  try{this.name=window.MIZ.user.name}catch{}
  $('#nameForm').addEventListener('submit',e=>{e.preventDefault();this.saveName()});
  $('#nameDialog').addEventListener('cancel',e=>{if(!this.name)e.preventDefault()});
  $('#closeNameDialog').addEventListener('click',()=>$('#nameDialog').close());
  $('#groupDialogClose').addEventListener('click',()=>$('#groupActionDialog').close());
  $('#page-groups').addEventListener('click',e=>{const b=e.target.closest('[data-group-action]');if(b)this.action(b)});
  $('#page-groups').addEventListener('submit',e=>{if(e.target.id==='createGroupForm'||e.target.id==='joinGroupForm'){e.preventDefault();this.submitGroup(e.target)}});
  $('#page-groups').addEventListener('change',e=>{if(e.target.id==='roomCamera')$('#cameraOptIn').checked=e.target.checked;if(e.target.id==='roomSubject'){this.selected=e.target.value;this.onSubject(this.selected);this.renderSubjects()}if(e.target.id==='companionGroupSelect')this.attachCompanion(e.target.value)});
  window.addEventListener('pagehide',()=>this.pageLeave());
  window.addEventListener('pageshow',e=>{if(e.persisted&&this.room&&this.continuesOutside()){this.suspended=false;this.tick();return}if(e.persisted&&this.room){this.clearRoom();this.render();this.notify('برای حضور دوباره وارد اتاق شو؛ سابقهٔ مطالعه محفوظ است.')}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(this.room)this.tick();else if(this.page==='groups')this.refresh()}else if(this.room){if(!this.continuesOutside())this.studyActive=false;this.tick()}});
 }
 async api(path,body){
  let response;try{response=await apiFetch(path,body)}catch{throw new RequestError('اتصال برقرار نشد. اینترنت را بررسی کن و دوباره امتحان کن.',0,'NETWORK')}
  let data;try{data=await response.json()}catch{throw new RequestError('پاسخ گروه دریافت نشد؛ دوباره امتحان کن.',response.status,'SERVER_ERROR')}
  if(!response.ok)throw new RequestError(data.error?.message||'عملیات انجام نشد.',response.status,data.error?.code);
  return data;
 }
 async init(){
  this.renderName();
  try{
   const me=await this.api('/api/me');this.auth=me.authenticated;this.userId=me.userId;
   if(me.profile?.name)this.setName(me.profile.name);
   else if(this.auth&&this.name)await this.api('/api/profile',{name:this.name});
   this.error='';if(this.auth){await this.refreshProgress();const recover=async()=>{const current=await this.api('/api/room');if(current.room){const old=current.room;const resumed=await this.api(`/api/groups/${encodeURIComponent(old.group.id)}/resume`,{visitId:old.visitId});this.recovered=resumed;this.room={id:old.group.id,visitId:old.visitId,totalMs:Number(resumed.activeMs)};this.snapshot=resumed;this.studyMode=resumed.group.cameraRequired?'camera':'manual';this.studyBase=this.room.totalMs;this.notify('زمانِ ادامه‌یافته ذخیره شد؛ برای جلسهٔ تازه، شروع مطالعه را بزن.');this.tick()}};if(navigator.locks)await navigator.locks.request('miz-study-session',{ifAvailable:true},async lock=>{if(lock)await recover()});else await recover()}
  }catch(e){this.error=e.message}
  this.ready=true;if(!this.name)this.openNameDialog();this.renderName();if(this.page==='groups')this.refresh();
 }
 setName(name){this.name=name;try{localStorage.setItem('miz.displayName.'+window.MIZ.user.id,name)}catch{}this.renderName()}
 renderName(){document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=this.name||'فضای مطالعهٔ من');document.querySelectorAll('[data-user-initial]').forEach(el=>el.textContent=(this.name||'م').slice(0,1))}
 openNameDialog(){const dialog=$('#nameDialog');$('#displayName').value=this.name;$('#nameError').hidden=true;$('#closeNameDialog').hidden=!this.name;if(!dialog.open)dialog.showModal();$('#displayName').focus()}
 async saveName(){
  const input=$('#displayName'),name=input.value.trim().replace(/\s+/gu,' '),button=$('#saveDisplayName');
  if([...name].length<2||[...name].length>32){this.nameError('نام باید بین ۲ تا ۳۲ حرف باشد.');return}
  button.disabled=true;
  try{if(this.auth)await this.api('/api/profile',{name});this.setName(name);$('#nameDialog').close();this.notify(`${name}، به میز خوش آمدی.`);if(this.page==='groups')this.refresh()}
  catch(e){this.nameError(e.message)}finally{button.disabled=false}
 }
 nameError(text){$('#nameError').textContent=text;$('#nameError').hidden=false}
 setSubjects(subjects,selected){this.subjects=subjects;this.selected=selected;this.renderSubjects()}
 setPage(page){
  if(!['groups','ranking'].includes(page)&&this.room)this.leave(true);
  this.page=page;clearTimeout(this.listTimer);
  if(page==='groups'){this.render();if(this.ready&&!this.room)this.refresh()}
 }
 signInPath(){return window.MIZ.base+'/login.php'}
 render(){
  const root=$('#groupsContent');$('#page-groups').classList.toggle('in-room',!!this.room);
  if(!this.ready){root.innerHTML='<div class="card groups-empty"><span class="connection-dot"></span><h2>در حال اتصال به گروه‌ها…</h2></div>';return}
  if(this.error&&!this.auth){root.innerHTML=`<div class="card groups-empty"><h2>ارتباط با گروه‌ها برقرار نشد.</h2><p>${esc(this.error)}</p><button class="secondary-button" data-group-action="retry">تلاش دوباره</button></div>`;return}
  if(!this.auth){root.innerHTML=`<section class="welcome-experience"><div class="welcome-main"><span class="section-kicker">همراهی، از همین‌جا</span><h2>یک میز مشترک.<br><em>تمرکز به سبک تو.</em></h2><p>با هم‌مسیرهایت مطالعه کن؛ زمان و پیشرفت یکدیگر را ببین و برای ادامه دادن انگیزه بگیر.</p><a class="primary-button" href="${this.signInPath()}" target="_top">${icon('users')}ورود و ساخت گروه</a><span class="welcome-trust">${icon('shield')}دوربین اختیاری · حریم خصوصی در اختیار تو</span></div><div class="study-illustration" aria-hidden="true"><div class="illustration-orbit"></div><span class="illustration-star">✦</span><div class="study-book book-back"></div><div class="study-book book-front"><i></i><strong>یک فصل تازه</strong><span>از امروز شروع کن</span><svg><use href="#i-leaf"/></svg></div><div class="illustration-cup"><i></i></div><span class="illustration-tag">کنار هم، قدم‌به‌قدم</span></div></section><div class="welcome-features"><article>${icon('users')}<h3>هم‌مسیر پیدا کن</h3><p>گروه خودت را بساز یا با کد دعوت عضو شو.</p></article><article>${icon('clock')}<h3>مطالعه‌ات را ببین</h3><p>زمان روزانه و هفتگی، روشن و قابل پیگیری.</p></article><article>${icon('shield')}<h3>انتخاب با توست</h3><p>گروه اختصاصی و گزارش عمومی با تنظیمات خودت.</p></article></div>`;return}
  if(this.room){this.renderRoom();return}
  const status={pending:'در انتظار تأیید مدیر',approved:'عضو گروه',rejected:'درخواست رد شده',kicked:'خارج‌شده توسط مدیر'};
  root.innerHTML=`<div class="hub-toolbar"><div><span class="section-kicker">فضای مشترک تو</span><h2>اتاق‌هایت</h2></div><div class="hub-toolbar-actions"><button class="primary-button" data-hub-action="create">${icon('plus')}ساخت گروه</button><button class="secondary-button" data-hub-action="join">عضویت با کد</button></div></div><div class="section-title"><h2>انتخاب کن و ادامه بده</h2><button class="text-button" data-group-action="refresh">${icon('refresh')}به‌روزرسانی</button></div><p id="groupListError" class="group-error" role="status" ${this.error?'':'hidden'}>${esc(this.error)}</p><div class="my-groups">${this.groupCardsHTML()}</div><div id="deletedGroupList">${this.deletedCards()}</div><div class="group-info-line">${icon('shield')}فقط اعضای تأییدشده نام و زمان مطالعهٔ یکدیگر را می‌بینند.</div><div class="group-forms"><details class="card group-form-card" id="createGroupPanel"><summary>${icon('plus')}یک فضای تازه بساز<span>ساخت گروه</span></summary><div class="group-form-content"><p class="form-intro">نام گروه و شیوهٔ ثبت مطالعه را مشخص کن.</p><form id="createGroupForm"><label class="form-field">نام گروه<input name="name" maxlength="48" minlength="2" required placeholder="نام گروه مطالعاتی"></label><label class="camera-choice private-room-choice"><input type="checkbox" name="isPrivate"><span>گروه اختصاصی<small>از رتبه‌بندی حذف می‌شود؛ می‌تواند همراه یک جلسهٔ دیگر باشد.</small></span></label><details class="advanced-group-settings"><summary>تنظیمات دوربین و ادامهٔ زمان</summary><label class="form-field">قانون ثبت مطالعه<select name="cameraPolicy"><option value="optional">دوربین اختیاری · ثبت بدون دوربین مجاز</option><option value="required">دوربین الزامی · تشخیص حضور</option></select><small>این قانون برای تمام اعضای اتاق اعمال می‌شود.</small></label><label class="camera-choice"><input name="backgroundContinue" type="checkbox">ادامهٔ زمان بیرون از صفحه و هنگام خاموشی دستگاه</label><label class="form-field">سقف ادامه پس از آخرین ارتباط فعال<select name="backgroundMinutes"><option value="15">۱۵ دقیقه</option><option value="30">۳۰ دقیقه</option><option value="60" selected>۶۰ دقیقه</option><option value="120">۱۲۰ دقیقه</option></select><small>در این حالت زمان با ساعت سرور ادامه می‌یابد؛ حضور واقعی در بیرون صفحه قابل تشخیص نیست.</small></label></details><button class="primary-button" type="submit">ساخت گروه </button></form></div></details><details class="card group-form-card" id="joinGroupPanel" ${new URLSearchParams(location.search).has('room')?'open':''}><summary>${icon('users')}دعوت شده‌ای؟<span>عضویت با کد</span></summary><div class="group-form-content"><p class="form-intro">کد دعوت را از مدیر گروه بگیر؛ عضویت پس از تأیید او انجام می‌شود.</p><form id="joinGroupForm"><label class="form-field">کد دعوت گروه<input name="code" dir="ltr" maxlength="16" required placeholder="کد ۱۰ کاراکتری" autocomplete="off" autocapitalize="characters" value="${esc(new URLSearchParams(location.search).get('room')||'')}"></label><button class="secondary-button" type="submit">ارسال درخواست </button></form></div></details></div>`;
 }
 groupCardsHTML(){const status={pending:'در انتظار تأیید مدیر',approved:'عضو گروه',rejected:'درخواست رد شده',kicked:'خارج‌شده توسط مدیر'};return `${this.items.length?this.items.map(g=>`<article class="card group-tile"><div class="group-tile-decoration" aria-hidden="true"><i></i><i></i><i></i></div><div class="group-tile-top"><span class="group-tile-icon">${icon('users')}</span><span class="group-role ${g.isOwner?'owner':''}">${g.isPrivate?'اختصاصی · خارج از رتبه‌بندی':g.isOwner?'مدیر گروه':status[g.status]||''}</span></div><h3>${esc(g.name)}</h3><p>${esc(g.ownerName)} · ${fa(g.onlineCount)} نفر داخل اتاق</p><div class="group-tile-bottom">${g.archived?'<span class="waiting-label">بایگانی‌شده توسط مدیر سایت</span>':g.status==='approved'?`<button class="primary-button" data-group-action="enter" data-id="${esc(g.id)}">ورود به اتاق </button>`:g.status==='pending'?'<span class="waiting-label">درخواستت برای مدیر ارسال شده است.</span>':`<button class="secondary-button" data-group-action="request-again" data-code="${esc(g.code)}">درخواست دوباره</button>`}</div></article>`).join(''):'<div class="card groups-empty">'+icon('users')+'<h3>جای اولین گروهت اینجاست.</h3><p>با ساخت گروه یا وارد کردن کد دعوت، همراهان مطالعه‌ات را کنار خودت داشته باش.</p></div>'}`}
 async refresh(){
  if(this.listing||!this.ready||this.page!=='groups'||this.room||!this.name)return;
  if(!this.auth){this.render();return}
  this.listing=true;
  try{const result=await this.api('/api/groups');this.items=result.groups;this.deletedGroups=result.deletedGroups||[];const trashHTML=this.deletedCards();if($('#deletedGroupList')&&this.deletedGroupsHTML!==trashHTML){$('#deletedGroupList').innerHTML=trashHTML;this.deletedGroupsHTML=trashHTML;}this.error=''}catch(e){if(e.status===401){this.auth=false;this.error=''}else this.error=e.message}
  finally{this.listing=false;if(!this.room&&this.page==='groups'){if(this.auth&&$('.my-groups')){const cards=this.groupCardsHTML();if($('.my-groups').innerHTML!==cards)$('.my-groups').innerHTML=cards;$('#groupListError').textContent=this.error;$('#groupListError').hidden=!this.error}else this.render();clearTimeout(this.listTimer);this.listTimer=setTimeout(()=>this.refresh(),5000)}}
 }
 async submitGroup(form){
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{const data=new FormData(form);if(form.id==='createGroupForm'){const result=await this.api('/api/groups',{name:data.get('name'),cameraRequired:data.get('cameraPolicy')==='required',backgroundContinue:data.has('backgroundContinue'),backgroundMinutes:Number(data.get('backgroundMinutes')),isPrivate:data.has('isPrivate')});await this.enter(result.group.id)}else{const result=await this.api('/api/groups/join',{code:data.get('code')});this.notify(result.status==='approved'?'قبلاً عضو این گروه هستی؛ وارد اتاق شو.':'درخواستت برای مدیر ارسال شد.');await this.refresh()}}
  catch(e){this.notify(e.message)}finally{button.disabled=false}
 }
 async action(button){
  const action=button.dataset.groupAction;button.disabled=true;
  try{
   if(action==='retry'){this.ready=false;this.render();await this.init()}
   else if(action==='refresh')await this.refresh();
   else if(action==='enter')await this.enter(button.dataset.id);
   else if(action==='request-again'){await this.api('/api/groups/join',{code:button.dataset.code});this.notify('درخواست تازه برای مدیر فرستاده شد.');await this.refresh()}
   else if(action==='leave')await this.leave();
   else if(action==='copy'){const code=this.snapshot?.group.code;if(code){try{await navigator.clipboard.writeText(code);this.notify('کد دعوت کپی شد.')}catch{this.notify(`کد گروه: ${code}`)}}}
   else if(action==='toggle-members'){this.membersHidden=!this.membersHidden;$('.room-workspace').classList.toggle('members-hidden',this.membersHidden);button.setAttribute('aria-expanded',String(!this.membersHidden));button.textContent=this.membersHidden?'نمایش همراهان':'پنهان کردن همراهان';try{localStorage.setItem('miz.hideRoomMembers',this.membersHidden?'1':'0')}catch{}}
   else if(action==='room-settings')this.openRoomSettings();
   else if(action==='delete-room')this.confirmDeleteRoom();
   else if(action==='restore-room'){await this.api(`/api/groups/${encodeURIComponent(button.dataset.id)}/restore`,{});this.notify('گروه بازیابی شد.');await this.refresh()}
   else if(action==='study'){if(!this.subjects.length)this.onAddSubject();else this.onStartStudy(this.selected)}
   else if(action==='add-subject')this.onAddSubject();
   else if(action==='approve'||action==='reject')await this.decide(button.dataset.user,action);
   else if(action==='kick')this.confirmKick(button.dataset.user,button.dataset.name);
  }catch(e){this.notify(e.message)}finally{button.disabled=false}
 }
 async enter(id){
  if(this.room)await this.leave(true);
  const snapshot=await this.api(`/api/groups/${encodeURIComponent(id)}/enter`,{});
  this.studyMode=snapshot.group.cameraRequired?'camera':'manual';this.room={id,visitId:snapshot.visitId,totalMs:0};this.snapshot=snapshot;this.lastStudyMs=0;this.studyActive=false;this.connectionLost=false;this.focusGroupHTML=null;clearTimeout(this.listTimer);this.renderRoom();window.scrollTo({top:0,behavior:'smooth'});this.tick();
 }
 renderRoom(){
  if(!this.room||!this.snapshot)return;$('#page-groups').classList.add('in-room');const s=this.snapshot;
  $('#groupsContent').innerHTML=`<section class="room-hero"><div class="room-hero-main"><span class="room-kicker"><i></i>اتاق مشترک ${s.me.isOwner?'· مدیر گروه':''}</span><h1>${esc(s.group.name)}</h1><p>فضای مشترک مطالعهٔ تو و همراهانت.</p><div class="room-invite"><span>کد دعوت</span><button data-group-action="copy" dir="ltr" aria-label="کپی کد دعوت">${esc(s.group.code)} ${icon('copy')}</button></div></div>${s.me.isOwner?'<button class="secondary-button room-settings-button" data-group-action="room-settings">تنظیمات و مدیریت گروه</button>':''}<button class="leave-room" data-group-action="leave" aria-label="خروج از اتاق">${icon('exit')}خروج از اتاق</button></section><p id="roomPolicyError" class="group-error" role="status" hidden></p><div id="roomConnection" class="group-error" hidden role="status"></div><section class="room-dashboard" aria-label="زمان و حضور در گروه"><article class="room-metric room-metric-own"><span>مطالعهٔ امروزت در این گروه</span><output id="ownRoomTime" dir="ltr">${clock(this.room.totalMs)}</output><small>با خروج و ورود دوباره صفر نمی‌شود.</small></article><article class="room-metric"><span>کنار هم در اتاق</span><strong id="roomOnlineMetric">۰ <small>نفر</small></strong><small id="roomStudyingMetric">در حال دریافت حضور</small></article><article class="room-metric"><span>مطالعهٔ امروز حاضران</span><output id="roomTotalMetric" dir="ltr">00:00:00</output><small>مجموع امروز در همین گروه</small></article></section><div class="room-panel-toolbar"><button class="secondary-button" data-group-action="toggle-members" aria-expanded="${!this.membersHidden}" aria-controls="roomSidePanel">${this.membersHidden?'نمایش همراهان':'پنهان کردن همراهان'}</button></div><div class="room-workspace ${this.membersHidden?'members-hidden':''}"><section class="room-launch"><div class="room-launch-copy"><strong>الان کدام درس را می‌خوانی؟</strong><p>درس انتخابی پیش از شروع دوباره تأیید می‌شود.</p></div><label class="camera-choice"><input type="checkbox" id="roomCamera" ${s.group.cameraRequired||$('#cameraOptIn')?.checked?'checked':''} ${s.group.cameraRequired?'disabled':''}>${s.group.cameraRequired?'دوربین الزامی':'دوربین اختیاری'}</label><div class="room-study-controls"><label class="room-subject-label">درس این جلسه<select id="roomSubject" aria-label="انتخاب درس برای مطالعهٔ گروهی"></select></label><button class="primary-button" data-group-action="study" id="roomStudyButton">${icon('play')}شروع مطالعه</button></div><div class="companion-control"><label class="form-field">گروه اختصاصی همراه<select id="companionGroupSelect" aria-label="گروه اختصاصی همراه"><option value="">بدون گروه همراه</option></select></label><small id="companionStatus">یک جلسه و یک ساعت مشترک؛ زمان دوبار ثبت نمی‌شود. قانون تایمر همین اتاق اجرا می‌شود.</small></div></section><aside class="room-grid" id="roomSidePanel" aria-label="همراهان اتاق"><section class="card room-members"><div class="card-heading"><h2>همراهان حاضر <span id="onlineCount" class="count-tag"></span></h2><span class="room-live"><i></i>همگام‌سازی هر ۳ ثانیه</span></div><div id="roomMemberList" class="companion-grid"></div><div id="roomOfflineMembers"></div><p class="room-sync-note">زمان هر فرد کنار نام اوست؛ مطالعهٔ فعال با نشان سبز مشخص می‌شود.</p></section>${s.me.isOwner?'<section class="card room-requests"><div class="card-heading"><h2>درخواست‌های عضویت <span id="requestCount" class="count-tag"></span></h2></div><div id="roomRequestList"></div></section>':''}</aside><section class="card room-history"><div class="card-heading"><h2>تاریخچهٔ اتاق</h2><span>۱۰۰ حضور اخیر</span></div><p>زمان ثبت‌شدهٔ اعضا؛ با خروج یا قطع اتصال حفظ می‌شود.</p><div id="roomHistoryList"></div></section></div><p class="room-policy-note">${s.group.backgroundContinue?`ادامهٔ زمان بیرون صفحه مجاز است · سقف ${fa(s.group.backgroundMinutes)} دقیقه پس از آخرین ارتباط فعال. برای استراحت دکمهٔ مکث را بزن.`:'با خروج از صفحه، شمارش متوقف می‌شود؛ این قانون در اختیار مدیر گروه است.'}</p><p class="room-reset-note">مجموع امروز از جلسه‌های همین روز ادامه پیدا می‌کند؛ زمان هر جلسه جداگانه در تاریخچه محفوظ است.</p><div class="group-info-line">${icon('shield')}فقط نام، زمان و وضعیت حضور دیده می‌شود؛ تصویر دوربین خصوصی است.</div>`;
  if(s.group.cameraRequired)$('#cameraOptIn').checked=true;this.renderSubjects();this.renderSnapshot();this.loadCompanions();
 }
 renderSubjects(){
  const select=$('#roomSubject');if(!select)return;
  select.innerHTML=this.subjects.length?this.subjects.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(''):'<option value="">ابتدا یک درس اضافه کن</option>';
  select.value=this.selected||'';select.disabled=!this.subjects.length;
  $('#roomStudyButton').innerHTML=this.subjects.length?`${icon('play')}شروع مطالعهٔ «${esc(this.subjects.find(s=>s.id===this.selected)?.name||'درس انتخابی')}»`:`${icon('plus')}افزودن درس`;
 }
 renderSnapshot(){
  if(!this.room||!this.snapshot||!$('#roomMemberList'))return;
  const s=this.snapshot,view=roomView(s,this.room.totalMs);
  $('#onlineCount').textContent=`${fa(view.online.length)} نفر`;
  $('#roomOnlineMetric').innerHTML=`${fa(view.online.length)} <small>نفر</small>`;
  $('#roomStudyingMetric').textContent=`${fa(view.studying)} نفر در حال مطالعه`;
  $('#roomMemberList').innerHTML=memberCardsHTML(view.online,{admin:s.me.isOwner});
  const offline=$('#roomOfflineMembers'),wasOpen=!!offline.querySelector('details[open]');
  offline.innerHTML=view.offline.length?`<details class="room-offline" ${wasOpen?'open':''}><summary>${fa(view.offline.length)} عضو خارج از اتاق</summary><div class="room-offline-list">${memberCardsHTML(view.offline,{admin:s.me.isOwner})}</div></details>`:'';
  if(s.me.isOwner){$('#requestCount').textContent=fa(s.requests.length);$('#roomRequestList').innerHTML=s.requests.length?s.requests.map(r=>`<article class="join-request"><span class="member-avatar">${esc(r.name.slice(0,1))}</span><strong>${esc(r.name)}</strong><div><button class="approve-request" data-group-action="approve" data-user="${esc(r.userId)}">قبول</button><button class="reject-request" data-group-action="reject" data-user="${esc(r.userId)}">رد</button></div></article>`).join(''):'<div class="requests-empty">درخواست تازه‌ای نداری.</div>'}
  const history=$('#roomHistoryList');if(history){const content=s.history?.length?s.history.map(h=>`<article class="history-row"><div><strong>${esc(h.name)}</strong><small>${new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(Number(h.enteredAt)))} · ${h.mode==='shared'?'زمان ثبت‌شدهٔ مشترک':h.mode==='background'?'ادامه با اجازهٔ مدیر':h.mode==='camera'?'دوربینی':h.mode==='mixed'?'دستی و دوربینی':'بدون دوربین'}</small></div><output dir="ltr">${clock(h.activeMs)}</output></article>`).join(''):'<div class="requests-empty">با شروع مطالعه، سابقهٔ اتاق اینجا نمایش داده می‌شود.</div>';if(history.innerHTML!==content)history.innerHTML=content;}
  const companion=$('#companionGroupSelect');if(companion&&document.activeElement!==companion)companion.value=s.me.companionId||'';this.renderOwnTime();
 }
 renderOwnTime(){
  if(!this.room)return;
  document.querySelectorAll('#ownRoomTime,[data-own-room-time]').forEach(el=>el.textContent=clock(this.groupDailyMs()));
  const total=$('#roomTotalMetric');if(total)total.textContent=roomClock(roomView(this.snapshot,this.room.totalMs).dailyTotalMs);
  this.renderFocusGroup();
 }
 renderFocusGroup(){
  const button=$('#openFocusGroup'),panel=$('#groupPanel');if(!button||!panel)return;
  button.hidden=!this.room;if(!this.room){panel.innerHTML='';return}
  const view=roomView(this.snapshot,this.room.totalMs),content=`<p class="focus-group-intro">${esc(this.snapshot.group.name)} · ${fa(view.online.length)} نفر کنار هم</p><div class="focus-group-members">${memberCardsHTML(view.online,{compact:true})}</div><p class="focus-group-note" data-connection="${this.connectionLost?'offline':'online'}">${this.connectionLost?'اتصال قطع است؛ زمان دیگران آخرین مقدار دریافت‌شده است.':'زمان همراهان هر ۳ ثانیه به‌روز می‌شود. سابقه و مجموع مطالعهٔ اتاق ذخیره می‌شود.'}</p>`;
  if(this.room.personal){button.hidden=true;return}if(this.focusGroupHTML!==content){panel.innerHTML=content;this.focusGroupHTML=content}
  button.setAttribute('aria-label',`همراهان مطالعه، ${fa(view.online.length)} نفر حاضر`);
 }
 continuesOutside(){return !!(this.room&&this.snapshot?.group.backgroundContinue)}
 async refreshProgress(){if(!this.auth||this.progressLoading)return;this.progressLoading=true;try{this.progress=await this.api('/api/progress');window.dispatchEvent(new Event('miz-progress'))}catch{}finally{this.progressLoading=false}}
 async enterPersonal(){if(!this.auth)return;const snapshot=await this.api('/api/personal/enter',{});this.snapshot=snapshot;this.room={id:snapshot.group.id,visitId:snapshot.visitId,totalMs:0,personal:true};this.studyMode='manual';this.lastStudyMs=0;this.studyActive=false;this.tick()}
 groupDailyMs(){const self=this.snapshot?.members.find(m=>m.isSelf),sameDay=this.snapshot?.period?.day===periodKeys(Date.now()).day;return (sameDay?Number(self?.dailyMs||0):0)+Math.min(Math.max(0,Date.now()-dayBoundary(Date.now())),Math.max(0,(this.room?.totalMs||0)-Number(self?.activeMs||0)))}
 overallDailyMs(){const self=this.snapshot?.members.find(m=>m.isSelf),sameDay=this.snapshot?.period?.day===periodKeys(Date.now()).day;return (sameDay?Number(this.snapshot?.me.overallDailyMs||0):0)+Math.min(Math.max(0,Date.now()-dayBoundary(Date.now())),Math.max(0,(this.room?.totalMs||0)-Number(self?.activeMs||0)))}
 async loadCompanions(){const id=this.room?.id;try{const data=await this.api('/api/groups');if(this.room?.id!==id)return;this.items=data.groups;const select=$('#companionGroupSelect');if(select){select.innerHTML='<option value="">بدون گروه همراه</option>'+this.items.filter(g=>g.isPrivate&&g.status==='approved'&&g.id!==id).map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');select.value=this.snapshot?.me.companionId||''}}catch(e){this.notify(e.message)}}
 async attachCompanion(id){if(!this.room)return;const select=$('#companionGroupSelect');if(select)select.disabled=true;try{this.snapshot=await this.api(`/api/groups/${encodeURIComponent(this.room.id)}/companion`,{visitId:this.room.visitId,groupId:id});this.renderSnapshot();this.notify(id?'گروه اختصاصی به همین جلسه متصل شد؛ زمان یک بار ثبت می‌شود.':'گروه همراه جدا شد؛ زمان قبلی محفوظ است.')}catch(e){this.notify(e.message);if(select)select.value=this.snapshot?.me.companionId||''}finally{if(select)select.disabled=false}}
 requiresCamera(){return !!(this.room&&this.snapshot?.group.cameraRequired)}
 beginStudy(subjectName){this.subjectName=subjectName;this.studyBase=this.room?.totalMs||0;this.lastStudyMs=0;this.studyActive=false}
 recordStudy(ms,present){if(this.room){const before=this.studyActive;this.room.totalMs=(this.studyBase||0)+Math.max(0,ms);this.studyActive=!!present&&(this.continuesOutside()||!document.hidden);this.renderOwnTime();if(before!==this.studyActive)this.tick()}this.lastStudyMs=ms}
 endStudy(ms){this.recordStudy(ms,false);this.studyActive=false;if(this.room?.personal)this.leave(true);else if(this.room)this.tick();this.lastStudyMs=0}
 async tick(){
  if(!this.room)return;if(this.polling){this.flushAgain=true;return}
  this.polling=true;clearTimeout(this.timer);const visit=this.room.visitId,id=this.room.id;
  try{
   const snapshot=await this.api(`/api/groups/${encodeURIComponent(id)}/heartbeat`,{visitId:visit,activeMs:Math.floor(this.room.totalMs),subjectName:this.subjectName||'بدون درس مشخص',studying:this.studyActive&&(this.continuesOutside()||!document.hidden),background:this.continuesOutside()&&(document.hidden||!document.hasFocus()||!!this.suspended),mode:this.continuesOutside()&&(document.hidden||!document.hasFocus()||!!this.suspended)?'background':this.studyMode||'manual'});
   if(this.room?.visitId!==visit)return;this.connectionLost=false;this.snapshot=snapshot;this.progress={period:snapshot.period,dailyMs:snapshot.me.overallDailyMs,weeklyMs:snapshot.me.overallWeeklyMs};window.dispatchEvent(new Event('miz-progress'));if(!this.studyActive){const own=snapshot.members.find(m=>m.isSelf);if(own)this.room.totalMs=Math.max(this.room.totalMs,Number(own.activeMs)||0);}this.renderSnapshot();if($('#roomConnection'))$('#roomConnection').hidden=true;
  }catch(e){
   if(this.room?.visitId!==visit)return;
   if([401,403,404,409].includes(e.status)){this.clearRoom();if(e.status===401)this.auth=false;this.error='';this.render();this.onForcedLeave(e.message)}
   else if($('#roomConnection')){this.connectionLost=true;this.renderFocusGroup();$('#roomConnection').textContent='ارتباط موقتاً قطع شده؛ در حال تلاش دوباره…';$('#roomConnection').hidden=false}
  }finally{this.polling=false;if(this.room){const delay=this.flushAgain?0:3000;this.flushAgain=false;this.timer=setTimeout(()=>this.tick(),delay)}}
 }
 clearRoom(){clearTimeout(this.timer);this.room=null;this.snapshot=null;this.studyActive=false;this.lastStudyMs=0;this.focusGroupHTML=null;this.renderFocusGroup()}
 async leave(silent=false){
  if(!this.room)return;const old=this.room;this.clearRoom();if(this.page==='groups')this.render();
  try{await this.api(`/api/groups/${encodeURIComponent(old.id)}/leave`,{visitId:old.visitId,activeMs:Math.floor(old.totalMs),studying:false,mode:this.studyMode||'manual'})}catch{}
  this.refreshProgress();if(!silent)this.notify('از اتاق خارج شدی؛ سابقهٔ مطالعه محفوظ است.');if(this.page==='groups')this.refresh();
 }
 pageLeave(){
  if(!this.room)return;if(this.continuesOutside()&&this.studyActive){this.suspended=true;this.tick();return}const path=endpoint(`/api/groups/${encodeURIComponent(this.room.id)}/leave`),data=JSON.stringify({visitId:this.room.visitId,activeMs:Math.floor(this.room.totalMs),studying:false,mode:this.studyMode||'manual',_csrf:window.MIZ.csrf});
  if(!navigator.sendBeacon?.(path,new Blob([data],{type:'application/json'})))fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':window.MIZ.csrf},body:data,credentials:'same-origin',keepalive:true}).catch(()=>{});this.clearRoom();this.onForcedLeave('از اتاق خارج شدی؛ سابقهٔ مطالعه محفوظ است.');
 }
 async decide(user,decision){if(!this.room)return;this.snapshot=await this.api(`/api/groups/${encodeURIComponent(this.room.id)}/members/${encodeURIComponent(user)}/decision`,{decision});this.renderSnapshot();this.notify(decision==='approve'?'عضویت تأیید شد.':'درخواست رد شد.')}
 confirmKick(user,name){
  $('#groupActionTitle').textContent='اخراج از گروه';$('#groupActionBody').innerHTML=`<p class="dialog-copy">«${esc(name)}» از گروه خارج شود؟ برای برگشتن، باید دوباره درخواست بدهد و تأیید تو را بگیرد.</p><div class="dialog-actions"><button class="secondary-button" id="cancelGroupAction">انصراف</button><button class="primary-button" id="confirmGroupAction">اخراج از گروه</button></div>`;
  const dialog=$('#groupActionDialog');dialog.showModal();$('#cancelGroupAction').onclick=()=>dialog.close();$('#confirmGroupAction').onclick=async e=>{e.target.disabled=true;try{if(this.room){this.snapshot=await this.api(`/api/groups/${encodeURIComponent(this.room.id)}/members/${encodeURIComponent(user)}/kick`,{});this.renderSnapshot()}dialog.close();this.notify('عضو از گروه خارج شد.')}catch(error){this.notify(error.message)}finally{e.target.disabled=false}};
 }
 deletedCards(){return this.deletedGroups.length?`<details class="card room-trash"><summary>گروه‌های حذف‌شدهٔ من (${fa(this.deletedGroups.length)})</summary>${this.deletedGroups.map(g=>`<div class="history-row"><strong>${esc(g.name)}</strong><button class="secondary-button" data-group-action="restore-room" data-id="${esc(g.id)}">بازیابی گروه</button></div>`).join('')}</details>`:''}
 openRoomSettings(){
  if(!this.snapshot?.me.isOwner)return;const g=this.snapshot.group;$('#groupActionTitle').textContent='تنظیمات گروه';$('#groupActionBody').innerHTML=`<form id="roomSettingsForm"><label class="form-field">نام گروه<input name="name" value="${esc(g.name)}" minlength="2" maxlength="48" required></label><label class="camera-choice"><input type="checkbox" name="backgroundContinue" ${g.backgroundContinue?'checked':''}>ادامهٔ زمان بیرون صفحه و در خاموشی دستگاه</label><label class="form-field">سقف ادامه پس از آخرین ارتباط فعال<select name="backgroundMinutes">${[15,30,60,120].map(n=>`<option value="${n}" ${Number(g.backgroundMinutes)===n?'selected':''}>${fa(n)} دقیقه</option>`).join('')}</select></label><p class="dialog-copy">زمان این حالت با ساعت سرور ثبت می‌شود و حضور واقعی قابل تشخیص نیست. ذخیرهٔ تنظیمات، حضور جاری اعضا را پایان می‌دهد؛ سوابق محفوظ است و ورود دوباره ممکن خواهد بود.</p><div class="dialog-actions"><button class="primary-button" type="submit">ذخیرهٔ تنظیمات</button><button class="secondary-button" type="button" id="ownerDeleteRoom">حذف گروه</button></div><p id="roomSettingsError" class="group-error" role="alert" hidden></p></form>`;
  const dialog=$('#groupActionDialog');dialog.showModal();$('#ownerDeleteRoom').onclick=()=>{dialog.close();this.confirmDeleteRoom()};$('#roomSettingsForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;const data=new FormData(e.target),id=this.room.id;try{await this.api(`/api/groups/${encodeURIComponent(id)}/settings`,{name:data.get('name'),backgroundContinue:data.has('backgroundContinue'),backgroundMinutes:Number(data.get('backgroundMinutes'))});dialog.close();this.clearRoom();await this.enter(id);this.notify('نام و قانون تایمر گروه به‌روز شد.')}catch(error){$('#roomSettingsError').hidden=false;$('#roomSettingsError').textContent=error.message}finally{button.disabled=false}};
 }
 confirmDeleteRoom(){
  if(!this.snapshot?.me.isOwner)return;const id=this.room.id,name=this.snapshot.group.name;$('#groupActionTitle').textContent='حذف گروه مطالعاتی';$('#groupActionBody').innerHTML=`<p class="dialog-copy">گروه «${esc(name)}» برای تمام اعضا از دسترس خارج می‌شود. در بخش گروه‌های حذف‌شده می‌توانی آن را بازیابی کنی؛ تاریخچه پاک نمی‌شود.</p><label class="form-field">برای تأیید، نام گروه را بنویس<input id="confirmRoomName" autocomplete="off"></label><div class="dialog-actions"><button class="secondary-button" id="cancelRoomDelete">انصراف</button><button class="primary-button" id="confirmRoomDelete" disabled>حذف گروه</button></div>`;const dialog=$('#groupActionDialog');dialog.showModal();$('#confirmRoomName').oninput=e=>$('#confirmRoomDelete').disabled=e.target.value!==name;$('#cancelRoomDelete').onclick=()=>dialog.close();$('#confirmRoomDelete').onclick=async e=>{e.target.disabled=true;try{await this.api(`/api/groups/${encodeURIComponent(id)}/delete`,{});dialog.close();this.clearRoom();this.render();await this.refresh();this.notify('گروه حذف شد؛ سابقه برای بازیابی نگه داشته شد.')}catch(error){this.notify(error.message);e.target.disabled=false}};
 }

}
