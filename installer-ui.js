const mode=document.querySelector('[name=driver]'),fields=document.getElementById('mysqlFields');
function update(){if(!mode||!fields)return;const mysql=mode.value==='mysql';fields.hidden=!mysql;fields.querySelectorAll('input').forEach(el=>el.disabled=!mysql)}
mode?.addEventListener('change',update);update();
const form=document.getElementById('installForm'),button=document.getElementById('installButton'),status=document.getElementById('installStatus');
form?.addEventListener('submit',()=>{if(!form.checkValidity())return;if(status)status.textContent='در حال بررسی و نصب؛ این کار ممکن است چند ثانیه طول بکشد.';button?.setAttribute('aria-busy','true');setTimeout(()=>{if(button)button.removeAttribute('aria-busy');if(status)status.textContent='اگر پاسخی دریافت نشد، اتصال و گزارش خطای هاست را بررسی کن. می‌توانی دوباره تلاش کنی؛ نصاب نصب هم‌زمان را مسدود می‌کند.'},20000)});
window.addEventListener('pageshow',()=>button?.removeAttribute('aria-busy'));
