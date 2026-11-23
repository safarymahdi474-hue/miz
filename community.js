import {progressAPI} from './progress-ui.js';
const root=document.getElementById('rankingContent');const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let busy=false,rankMode='daily',rankData=null;
const rankClock=ms=>{const n=Math.floor(Math.max(0,Number(ms)||0)/1000);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':')};
function selectRankingMode(){document.querySelectorAll('[data-rank-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rankMode===rankMode)))}
function renderRanking(){if(!root||!rankData)return;const list=rankMode==='groups'?(rankData.groups||[]):(rankData[rankMode]||[]);const max=Math.max(1,...list.map(m=>Number(rankMode==='groups'?m.totalMs:m.activeMs)||0));root.innerHTML=list.length?list.map((m,i)=>`<article class="rank-row"><span class="rank-number">${(i+1).toLocaleString('fa')}</span><div class="rank-person"><span class="rank-avatar" aria-hidden="true">${esc(String(m.name||'م').slice(0,1))}</span><div class="rank-person-copy"><strong>${esc(m.name)}</strong><small>${rankMode==='groups'?Number(m.memberCount).toLocaleString('fa')+' عضو · مجموع تاریخچهٔ اتاق':rankMode==='daily'?'مطالعهٔ امروز':'مطالعه از شنبه'}</small><span class="rank-meter" aria-hidden="true"><i style="width:${Math.min(100,Math.max(0,Number(rankMode==='groups'?m.totalMs:m.activeMs)||0)/max*100)}%"></i></span></div></div><strong dir="ltr">${rankClock(rankMode==='groups'?m.totalMs:m.activeMs)}</strong></article>`).join(''):'<div class="requests-empty">هنوز زمانی برای این رتبه‌بندی ثبت نشده است.</div>';selectRankingMode()}
async function ranking(){if(!root||busy)return;busy=true;root.setAttribute('aria-busy','true');root.innerHTML='<div class="ranking-loading" role="status">در حال دریافت رتبه‌بندی…<span></span><span></span><span></span></div>';try{rankData=await progressAPI('/api/ranking');renderRanking()}catch(e){root.innerHTML=`<div class="ranking-error"><svg aria-hidden="true"><use href="#i-target"/></svg><p>${esc(e.message)}</p><button class="secondary-button" id="retryRanking">تلاش دوباره</button></div>`;document.getElementById('retryRanking')?.addEventListener('click',ranking)}finally{busy=false;root.setAttribute('aria-busy','false')}}
document.querySelectorAll('[data-rank-mode]').forEach(b=>b.addEventListener('click',()=>{rankMode=b.dataset.rankMode;selectRankingMode();if(rankData)renderRanking();else ranking()}));document.getElementById('refreshRanking')?.addEventListener('click',ranking);document.querySelectorAll('[data-page="ranking"]').forEach(b=>b.addEventListener('click',ranking));if(location.hash==='#ranking')ranking();
document.getElementById('communityAction')?.addEventListener('click',()=>document.getElementById('groupsContent').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'}));

// Progressive enhancements: app actions and server state remain independent of motion.
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
function revealSurfaces(scope=document){
 const surfaces=scope.querySelectorAll('.community-heading,.community-intro,.club-guide,.community-section-heading,.groups-welcome,.group-form-card,.group-tile,.rank-row');
 if(motionQuery.matches||!('IntersectionObserver' in window))return;
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.remove('reveal-pending');entry.target.classList.add('reveal-visible');observer.unobserve(entry.target)}}),{threshold:.08});
 surfaces.forEach((el,i)=>{if(el.dataset.motionReady)return;el.dataset.motionReady='true';el.classList.add('reveal-pending');el.style.transitionDelay=`${Math.min(i,3)*55}ms`;observer.observe(el)});
}
revealSurfaces();
let revealFrame=0;
new MutationObserver(()=>{if(revealFrame)return;revealFrame=requestAnimationFrame(()=>{revealFrame=0;revealSurfaces()})}).observe(document.querySelector('main'),{childList:true,subtree:true});
// Delegated jQuery handlers also cover cards rendered after group refreshes.
function attachJQueryMotion(){const jq=window.jQuery;if(!jq)return;jq(document).on('click.mizMotion','.primary-button,.secondary-button',function(event){if(motionQuery.matches)return;const box=this.getBoundingClientRect();const ripple=jq('<span class="button-ripple" aria-hidden="true"></span>').css({left:event.clientX-box.left,top:event.clientY-box.top});jq(this).append(ripple);setTimeout(()=>ripple.remove(),700)});jq(document).on('mouseenter.mizMotion focusin.mizMotion','.group-tile',function(){jq(this).addClass('interaction-active')}).on('mouseleave.mizMotion focusout.mizMotion','.group-tile',function(){jq(this).removeClass('interaction-active')})}

if(window.jQuery)attachJQueryMotion();else window.addEventListener('load',attachJQueryMotion,{once:true});

// Keep the skip link within the app's current page instead of changing its hash route.
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();const main=document.getElementById('mainContent');main.tabIndex=-1;main.focus({preventScroll:true});main.scrollIntoView({behavior:'instant',block:'start'})});
