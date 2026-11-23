const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const pages=document.querySelectorAll('.page');
const observer=new MutationObserver(records=>{if(reduced.matches)return;for(const {target} of records)if(!target.hidden){target.classList.remove('elevate-enter');requestAnimationFrame(()=>target.classList.add('elevate-enter'))}});
for(const page of pages)observer.observe(page,{attributes:true,attributeFilter:['hidden']});
