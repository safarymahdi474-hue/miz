import {BreathPacer} from './session-prep.js';
import {SoundStudio,SOUNDS} from './sound-studio.js';

const $=id=>document.getElementById(id);
const fa=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(n);
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;

export class FocusTools {
  constructor({stage,onThought}){
    this.stage=stage;this.onThought=onThought;this.sheet=$('focusSheet');this.panel=null;this.count=0;this.canPark=false;this.natural=false;
    this.audio=new SoundStudio(error=>this.renderAudio(error));
    $('openFocusGroup').addEventListener('click',()=>this.openPanel('group'));
    $('openSoundStudio').addEventListener('click',()=>this.openPanel('sound'));
    $('openThoughtParking').addEventListener('click',()=>this.openPanel('thought'));
    $('closeFocusSheet').addEventListener('click',()=>this.closePanel());
    $('focusSheetBackdrop').addEventListener('click',()=>this.closePanel());
    $('soundChoices').innerHTML=SOUNDS.map(s=>`<button type="button" class="sound-choice" data-sound="${s.id}" aria-pressed="false"><span class="sound-art sound-art-${s.id}">${icon(s.icon)}</span><span><strong>${s.name}</strong><small>${s.description}</small></span><span class="sound-choice-check">${icon('check')}</span></button>`).join('');
    $('soundChoices').addEventListener('click',e=>{const b=e.target.closest('[data-sound]');if(b)this.audio.select(b.dataset.sound)});
    $('soundPlay').addEventListener('click',()=>this.audio.playing||this.audio.loading?this.audio.pause():this.audio.play());
    $('soundVolume').addEventListener('input',e=>this.audio.setVolume(Number(e.target.value)/125));
    $('thoughtForm').addEventListener('submit',e=>{e.preventDefault();if(this.flushThought())this.closePanel()});
    $('parkedThought').addEventListener('input',()=>{$('thoughtLength').textContent=`${fa($('parkedThought').value.length)} / ۵۰۰`;$('thoughtError').hidden=true;$('saveThought').disabled=!$('parkedThought').value.trim()});
    $('startBreathing').addEventListener('click',()=>this.startBreathing());
    $('skipBreathing').addEventListener('click',()=>this.finishBreathing());
    $('naturalBreathing').addEventListener('click',()=>{this.natural=!this.natural;$('naturalBreathing').setAttribute('aria-pressed',String(this.natural));$('naturalBreathing').textContent=this.natural?'برگشت به ریتم راهنما':'با ریتم طبیعی خودم';this.renderBreathing()});
    document.addEventListener('visibilitychange',()=>{this.pacer?.step(performance.now(),!document.hidden);this.renderBreathing()});
    this.renderAudio();this.enableParking(false);
  }
  prepare(){
    this.closePanel(false);this.audio.close();this.count=0;this.enableParking(false);$('parkedThought').value='';$('thoughtLength').textContent='۰ / ۵۰۰';$('thoughtError').hidden=true;$('saveThought').disabled=true;this.renderCount();
    this.stage.dataset.phase='breathing';$('breathingGuide').hidden=false;$('breathProgress').style.width='0%';
    $('breathingGuide').dataset.running='false';$('breathingGuide').dataset.natural='false';$('breathTitle').textContent='یک دقیقه، فقط همین‌جا.';
    $('breathInstruction').textContent='راحت بنشین، شانه‌ها را رها کن و توجهت را به نفس برگردان.';
    $('breathPhase').textContent='آماده‌ای؟';$('breathCount').textContent='۶۰ ثانیه';$('breathCycle').textContent='۶ چرخهٔ آرام · بدون حبس نفس';
    $('breathRemaining').textContent='تمرین پیشنهادی · اختیاری';$('startBreathing').hidden=false;$('naturalBreathing').hidden=false;
    this.natural=false;$('naturalBreathing').setAttribute('aria-pressed','false');$('naturalBreathing').textContent='با ریتم طبیعی خودم';
    $('breathOrb').style.setProperty('--breath-scale','.72');$('startBreathing').focus({preventScroll:true});
    return new Promise(resolve=>{this.resolveBreathing=resolve});
  }
  startBreathing(){
    if(this.pacer||!this.resolveBreathing)return;
    this.pacer=new BreathPacer();$('breathingGuide').dataset.running='true';$('startBreathing').hidden=true;$('breathTitle').textContent='توجهت را به نفس برگردان.';
    $('naturalBreathing').focus({preventScroll:true});
    const frame=now=>{
      if(!this.pacer)return;
      const snap=this.pacer.step(now,!document.hidden&&document.hasFocus());this.renderBreathing(snap);
      if(snap.done){this.finishBreathing();return}
      this.frame=requestAnimationFrame(frame);
    };
    this.frame=requestAnimationFrame(frame);
  }
  finishBreathing(){
    if(!this.resolveBreathing)return;cancelAnimationFrame(this.frame);this.frame=null;this.pacer=null;
    const resolve=this.resolveBreathing;this.resolveBreathing=null;$('breathingGuide').hidden=true;this.stage.dataset.phase='preparing';resolve(true);
  }
  renderBreathing(snap=this.pacer?.snapshot()){
    if(!snap){if(this.resolveBreathing)$('breathCycle').textContent=this.natural?'۶۰ ثانیه توجه به نفس، با ریتم خودت':'۶ چرخهٔ آرام · بدون حبس نفس';return}
    $('breathingGuide').dataset.natural=String(this.natural);
    const paused=document.hidden;
    const phase=this.natural?'تنفس طبیعی':snap.phase==='inhale'?'آرام، دم بگیر':'آرام، رها کن';
    const phaseText=paused?'هر وقت برگشتی، ادامه می‌دهیم':phase;if($('breathPhase').textContent!==phaseText)$('breathPhase').textContent=phaseText;
    $('breathCount').textContent=this.natural?'با ریتم خودت':fa(snap.phaseRemaining);
    $('breathInstruction').textContent=this.natural?'نفس را تغییر نده؛ فقط رفت‌وآمدش را دنبال کن.':snap.phase==='inhale'?'به‌آرامی از بینی نفس بگیر؛ به‌اندازه‌ای که راحتی.':'نفس را نرم بیرون بده؛ نیازی به حبس یا فشار نیست.';
    $('breathCycle').textContent=this.natural?'هر وقت حواست رفت، آرام به نفس برگرد.':`چرخهٔ ${fa(snap.cycle)} از ${fa(snap.cycles)}`;
    $('breathRemaining').textContent=`${fa(Math.ceil(snap.remainingMs/1000))} ثانیه تا شروع`;
    $('breathProgress').style.width=`${snap.elapsedMs/600}%`;
    $('breathOrb').style.setProperty('--breath-scale',String(this.natural ? .88 : .72+snap.expansion*.28));
  }
  enableParking(value){this.canPark=value;$('openThoughtParking').disabled=!value;$('openThoughtParking').title=value?'پارکینگ افکار':'پس از تأیید حضور در دسترس است'}
  renderCount(){
    $('thoughtCount').textContent=fa(this.count);$('thoughtCount').hidden=!this.count;
    $('openThoughtParking').setAttribute('aria-label',this.count?`پارکینگ افکار، ${fa(this.count)} فکر ثبت‌شده`:'پارکینگ افکار');
    $('parkedCount').textContent=this.count?`${fa(this.count)} فکر برای بعد از جلسه کنار گذاشته‌ای.`:'فکرت را اینجا بگذار؛ بعد از جلسه به آن برمی‌گردی.';
  }
  flushThought(){
    const input=$('parkedThought'),text=input.value.trim();if(!text)return true;
    if(!this.canPark)return false;
    const result=this.onThought(text);
    if(result!==true){$('thoughtError').textContent=result||'فکر ذخیره نشد. دوباره امتحان کن.';$('thoughtError').hidden=false;return false}
    this.count++;this.renderCount();input.value='';$('thoughtLength').textContent='۰ / ۵۰۰';$('saveThought').disabled=true;return true;
  }
  openPanel(panel){
    if(this.stage.dataset.phase==='breathing'||(panel==='thought'&&!this.canPark))return;
    if(this.panel===panel){this.closePanel();return}this.closePanel(false);this.panel=panel;this.returnControl=panel==='sound'?$('openSoundStudio'):panel==='group'?$('openFocusGroup'):$('openThoughtParking');
    $('focusSheetTitle').textContent=panel==='sound'?'استودیوی صدا':panel==='group'?'همراهان مطالعه':'پارکینگ افکار';
    $('soundPanel').hidden=panel!=='sound';$('thoughtPanel').hidden=panel!=='thought';$('groupPanel').hidden=panel!=='group';
    const companion=panel==='group';this.stage.classList.toggle('has-companions',companion);this.sheet.dataset.panel=panel;this.sheet.setAttribute('aria-modal',String(!companion));this.sheet.setAttribute('role',companion?'region':'dialog');
    $('focusSheetBackdrop').hidden=companion;this.sheet.hidden=false;
    $('focusDock').inert=!companion;$('focusTimer').inert=!companion;if(!companion)$('focusHint').setAttribute('aria-hidden','true');
    this.returnControl.setAttribute('aria-expanded','true');
    (panel==='thought'?$('parkedThought'):$('closeFocusSheet')).focus({preventScroll:true});
  }
  closePanel(restore=true){
    if(!this.panel)return;
    this.stage.classList.remove('has-companions');this.sheet.hidden=true;$('focusSheetBackdrop').hidden=true;$('focusDock').inert=false;$('focusTimer').inert=false;$('focusHint').removeAttribute('aria-hidden');
    this.returnControl?.setAttribute('aria-expanded','false');this.panel=null;if(restore)this.returnControl?.focus({preventScroll:true});
  }
  renderAudio(error){
    document.querySelectorAll('[data-sound]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sound===this.audio.selected)));
    const name=SOUNDS.find(s=>s.id===this.audio.selected)?.name||'';
    $('soundPlay').innerHTML=`${icon(this.audio.playing?'pause':'play')}<span>${this.audio.loading?'لغو بارگذاری':this.audio.playing?'توقف صدا':'پخش '+name}</span>`;
    $('soundPlay').setAttribute('aria-pressed',String(this.audio.playing));$('soundVolume').value=String(Math.round(this.audio.volume*125));$('soundVolumeValue').textContent=`${fa(this.audio.volume*125)}٪`;
    $('openSoundStudio').classList.toggle('is-playing',this.audio.playing);$('openSoundStudio').setAttribute('aria-label',this.audio.playing?`استودیوی صدا، ${name} در حال پخش`:'استودیوی صدا');
    $('soundStatus').textContent=error|| (this.audio.loading?'در حال آماده‌سازی صدا…':this.audio.playing?`${name} در حال پخش است؛ با بستن این پنل ادامه دارد.`:'یک صدا انتخاب کن و با بلندی ملایم پخش کن.');$('soundStatus').classList.toggle('has-error',!!error);
  }
  close(){
    this.closePanel(false);this.audio.close();cancelAnimationFrame(this.frame);this.frame=null;this.pacer=null;
    const resolve=this.resolveBreathing;this.resolveBreathing=null;resolve?.(false);$('breathingGuide').hidden=true;this.enableParking(false);
  }
}
