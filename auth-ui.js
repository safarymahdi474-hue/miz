document.querySelectorAll('input[type=password]').forEach(input=>{
 const button=document.createElement('button');button.type='button';button.className='password-toggle';button.textContent='نمایش';button.setAttribute('aria-label','نمایش '+(input.closest('.identity-field')?.querySelector('label')?.textContent||'رمز'));button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');
 button.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'پنهان':'نمایش';button.setAttribute('aria-pressed',String(show))});input.after(button);
});
document.querySelectorAll('form').forEach(form=>{
 const password=form.querySelector('[name=password]'),repeat=form.querySelector('[name=password_repeat]');
 const validate=()=>{if(repeat)repeat.setCustomValidity(repeat.value&&password?.value!==repeat.value?'تکرار رمز با رمز عبور یکسان نیست.':'')};password?.addEventListener('input',validate);repeat?.addEventListener('input',validate);
 form.addEventListener('submit',()=>{if(form.checkValidity())form.setAttribute('aria-busy','true')});
});
window.addEventListener('pageshow',()=>document.querySelectorAll('form[aria-busy]').forEach(f=>f.removeAttribute('aria-busy')));
