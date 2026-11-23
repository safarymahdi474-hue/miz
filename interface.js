// Presentation only. Credit accounting and room policy stay in their services.
const $=selector=>document.querySelector(selector);
const dialog=$('#quickNavDialog'),search=$('#quickNavSearch'),list=$('#quickNavList');
const destinations=[
 {page:'groups',title:'گروه‌های من',detail:'اتاق‌ها و همراهان',icon:'users',terms:'گروه اتاق همراه عضویت'},
 {page:'desk',title:'میز مطالعه',detail:'شروع جلسهٔ تمرکز',icon:'grid',terms:'مطالعه تمرکز تایمر شروع'},
 {page:'ranking',title:'رتبه‌بندی',detail:'روزانه و هفتگی',icon:'target',terms:'رتبه رنک رقابت روز هفته'},
 {page:'reports',title:'گزارش مطالعه',detail:'تاریخچه و پروفایل عمومی',icon:'chart',terms:'گزارش تاریخچه پروفایل عمومی اشتراک'},
 {page:'subjects',title:'درس‌های من',detail:'مدیریت درس‌ها',icon:'book',terms:'درس فیزیک شیمی ریاضی'}
];
function renderQuickNav(){
 const query=search.value.trim().replace(/ي/g,'ی').replace(/ك/g,'ک');
 const entries=destinations.filter(d=>(d.title+' '+d.terms).includes(query));
 list.replaceChildren(...entries.map(d=>{
  const button=document.createElement('button');button.type='button';button.dataset.destination=d.page;
  button.innerHTML=`<svg aria-hidden="true"><use href="#i-${d.icon}"/></svg><span>${d.title}</span><small>${d.detail}</small>`;
  button.addEventListener('click',()=>{dialog.close();document.querySelector(`#mainNavigation [data-page="${d.page}"]`)?.click()});return button;
 }));
 if(!entries.length){const p=document.createElement('p');p.className='quick-nav-empty';p.textContent='بخشی با این نام پیدا نشد.';list.append(p)}
}
function openQuickNav(){if(!dialog||document.body.classList.contains('focus-mode')||document.querySelector('dialog[open]'))return;search.value='';renderQuickNav();dialog.showModal();search.focus()}
$('#openQuickNav')?.addEventListener('click',openQuickNav);
$('#closeQuickNav')?.addEventListener('click',()=>dialog.close());
search?.addEventListener('input',renderQuickNav);
search?.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();list.querySelector('button')?.focus()}});
list?.addEventListener('keydown',event=>{
 const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}
});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(dialog?.open)dialog.close();else openQuickNav()}});
dialog?.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-hub-action]');if(!trigger)return;
 const panel=$('#'+(trigger.dataset.hubAction==='create'?'createGroupPanel':'joinGroupPanel'));if(!panel)return;
 panel.open=true;panel.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 panel.querySelector('input')?.focus({preventScroll:true});
});
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
function updateNavigation(){
 document.querySelectorAll('#mainNavigation [data-page]').forEach(button=>{if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
}
const pages=document.querySelectorAll('.page');
for(const page of pages)new MutationObserver(()=>{if(!page.hidden){updateNavigation();if(!reduced.matches){page.classList.remove('ui-page-enter');requestAnimationFrame(()=>page.classList.add('ui-page-enter'))}}}).observe(page,{attributes:true,attributeFilter:['hidden']});
updateNavigation();

const shortcut=document.querySelector('.quick-launch kbd');if(shortcut)shortcut.textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
