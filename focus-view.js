import {FocusTools} from './focus-tools.js?v=42';
// A single camera element is moved into the focus view, so detection keeps using
// the same stream. The dashboard becomes inert and returns after the stream stops.
export class FocusView {
  constructor({video,onStop,onThought}) {
    this.video=video;this.onStop=onStop;this.stage=document.querySelector('#focusStage');
    this.time=document.querySelector('#focusTime');this.timeGroup=document.querySelector('#focusTimeGroup');
    this.timer=document.querySelector('#focusTimer');this.toggle=document.querySelector('#toggleFocusTime');
    this.status=document.querySelector('#focusHint');this.hiddenTime=false;this.isOpen=false;
    this.hiddenVideo=false;try{this.hiddenVideo=localStorage.getItem('miz.hideStudyVideo')==='true'}catch{}
    this.tools=new FocusTools({stage:this.stage,onThought});
    try{this.hiddenTime=localStorage.getItem('miz.hideStudyTime')==='true'}catch{}
    this.renderVisibility();
    this.renderVideoVisibility();
    document.querySelector('#toggleFocusVideo').addEventListener('click',()=>{this.hiddenVideo=!this.hiddenVideo;this.renderVideoVisibility();try{localStorage.setItem('miz.hideStudyVideo',String(this.hiddenVideo))}catch{}});
    this.toggle.addEventListener('click',()=>{this.hiddenTime=!this.hiddenTime;this.renderVisibility();try{localStorage.setItem('miz.hideStudyTime',String(this.hiddenTime))}catch{}});
    document.querySelector('#stopFocus').addEventListener('click',()=>this.onStop());
    document.querySelector('#cancelBreathing').addEventListener('click',()=>this.onStop());
    this.stage.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();if(this.tools.panel)this.tools.closePanel();else this.onStop();return}
      if(e.key!=='Tab')return;
      const controls=[...this.stage.querySelectorAll('button,input,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&!el.closest('[inert]')&&el.getClientRects().length),i=controls.indexOf(document.activeElement);
      if(!controls.length)return;
      e.preventDefault();controls[i===-1?(e.shiftKey?controls.length-1:0):(i+(e.shiftKey?-1:1)+controls.length)%controls.length].focus();
    });
    window.addEventListener('popstate',()=>{if(this.isOpen)this.onStop()});
  }
  open() {
    if(this.isOpen)return;
    this.isOpen=true;this.scrollY=window.scrollY;this.returnHash=location.hash||'#desk';
    this.anchor=document.createComment('camera dashboard position');this.video.before(this.anchor);
    document.querySelector('#focusMedia').append(this.video);
    document.querySelectorAll('.workspace,.sidebar').forEach(el=>{el.inert=true;el.setAttribute('aria-hidden','true')});
    document.body.classList.add('focus-mode');this.stage.hidden=false;this.stage.dataset.ready='false';
    this.stage.dataset.phase='preparing';
    this.setTime('00:00:00');this.setStatus('در حال آماده‌سازی جلسه…');
    history.pushState({mizFocus:true},'','#focus');this.stage.focus({preventScroll:true});
  }
  ready(){this.stage.dataset.ready='true'}
  setAttention(allowed){this.stage.dataset.attention=allowed?'active':'away';document.querySelector('#focusAway').hidden=allowed}
  prepareBreathing(){return this.tools.prepare()}
  enableParking(){this.tools.enableParking(true)}
  flushThought(){return this.tools.flushThought()}
  setTime(value){this.time.textContent=value}
  setStatus(message,type=''){
    this.stage.dataset.presence=type||'preparing';
    if(this.status.textContent!==message)this.status.textContent=message;this.status.hidden=type==='present';
  }
  renderVisibility(){
    this.timeGroup.hidden=this.hiddenTime;this.timer.classList.toggle('time-hidden',this.hiddenTime);
    this.toggle.setAttribute('aria-label',this.hiddenTime?'نمایش زمان مطالعه':'پنهان کردن زمان مطالعه');
    this.toggle.setAttribute('aria-pressed',String(this.hiddenTime));
    this.toggle.innerHTML=`<svg><use href="#i-${this.hiddenTime?'eye':'eye-off'}"/></svg>`;
  }
  renderVideoVisibility(){
    this.stage.classList.toggle('video-hidden',this.hiddenVideo);
    const button=document.querySelector('#toggleFocusVideo');button.setAttribute('aria-label',this.hiddenVideo?'نمایش تصویر خودم':'پنهان کردن تصویر خودم');button.setAttribute('aria-pressed',String(this.hiddenVideo));
    button.innerHTML=`<svg><use href="#i-${this.hiddenVideo?'camera':'eye-off'}"/></svg><span class="focus-tool-label">${this.hiddenVideo?'نمایش':'تصویر'}</span>`;
  }
  close(){
    if(!this.isOpen)return;
    this.tools.close();
    this.isOpen=false;this.anchor.replaceWith(this.video);this.stage.hidden=true;
    document.body.classList.remove('focus-mode');
    document.querySelectorAll('.workspace,.sidebar').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
    if(location.hash==='#focus')history.replaceState(null,'',this.returnHash);
    window.scrollTo({top:this.scrollY,behavior:'auto'});
  }
}
