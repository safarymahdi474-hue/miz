<?php
function page_start(string $title,string $subtitle='باشگاه مطالعه تو'): void {
 $screen=basename($_SERVER['SCRIPT_NAME']??'');$setup=$screen==='install.php';$registration=$screen==='register.php';
?>
<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17131f"><title><?=e($title)?> | میز</title><link rel="icon" href="<?=e(url('favicon.svg'))?>"><link rel="stylesheet" href="<?=e(url('design.css'))?>"><link rel="stylesheet" href="<?=e(url('auth.css'))?>"><link rel="stylesheet" href="<?=e(url('community.css'))?>"><link rel="stylesheet" href="<?=e(url('nova.css'))?>"><link rel="stylesheet" href="<?=e(url('account-design.css'))?>"><link rel="stylesheet" href="<?=e(url('elevate.css?v=50'))?>"><link rel="stylesheet" href="<?=e(url('interface.css?v=71'))?>"></head><body class="account-page <?=$setup?'setup-page':'identity-page'?>">
<header class="identity-header"><a class="identity-brand" href="<?=e(url())?>"><span class="identity-logo">م</span><strong>میز<small>باشگاه مطالعهٔ تو</small></strong></a><a class="identity-back" href="<?=e(url())?>">بازگشت به میز</a></header>
<main class="identity-layout <?=$setup?'identity-setup':''?>">
<aside class="identity-story" aria-label="درباره میز"><span class="story-badge"><i></i>هر روز، یک قدم نزدیک‌تر.</span><h2>هدف‌های بزرگ،<br>با قدم‌های کوچک.<br><em>کنار هم.</em></h2><p>یک گروه هم‌مسیر، یک فضای آرام و فرصتی تازه<br>برای ادامه دادن؛ میز تو اینجاست.</p><div class="identity-art" aria-hidden="true"><div class="art-ring"></div><div class="identity-table"><span>میز</span><div class="identity-book"></div><div class="identity-cup"></div></div><i class="identity-person person-one">م</i><i class="identity-person person-two">ت</i><i class="identity-person person-three">ن</i><span class="identity-spark">✦</span></div><div class="story-features"><div><span>◈</span><strong>گروه‌های خصوصی<small>برای هم‌مسیرهای تو</small></strong></div><div><span>◎</span><strong>دوربین اختیاری<small>تمرکز، به انتخاب خودت</small></strong></div></div><p class="story-signature">YOUR NEXT CHAPTER STARTS HERE</p></aside>
<section class="account-shell"><div class="account-card">
<?php if(!$setup&&in_array($screen,['login.php','register.php'],true)){?><nav class="identity-tabs" aria-label="ورود و ثبت نام"><a href="<?=e(url('login.php'))?>" <?=$registration?'':'aria-current="page"'?>>ورود به حساب</a><a href="<?=e(url('register.php'))?>" <?=$registration?'aria-current="page"':''?>>ساخت حساب</a></nav><?php }?>
<span class="account-eyebrow"><?=e($subtitle)?></span><h1><?=e($title)?></h1>
<?php }
function page_end(): void {echo '</div><footer class="account-footer"><span class="security-dot"></span>حساب تو، فضای خصوصی تو.<small>تصویر دوربین روی دستگاهت پردازش می‌شود.</small></footer></section></main><script src="'.e(url('auth-ui.js')).'" defer></script></body></html>';}
function message(?string $message,bool $ok=false): void {if($message)echo '<div role="'.($ok?'status':'alert').'" class="account-message '.($ok?'success':'').'"><span>'.($ok?'✓':'!').'</span><p>'.e($message).'</p></div>';}
function field(string $label,string $name,string $type='text',string $value='',string $auto='',bool $required=true): void {
 $password=$type==='password'&&$name!=='db_password';$new=$password&&$auto==='new-password';$id='field-'.$name;
 echo '<div class="identity-field"><label for="'.e($id).'">'.e($label).'</label><div class="input-wrap"><input id="'.e($id).'" name="'.e($name).'" type="'.e($type).'" '.($required?'required ':'').' value="'.e($value).'" autocomplete="'.e($auto).'" '.($type==='email'?'dir="ltr" inputmode="email" maxlength="190" placeholder="you@example.com" ':'').($password?'dir="ltr" maxlength="64" '.($new?'minlength="10" ':'').' ':'').($name==='name'?'minlength="2" maxlength="32" placeholder="نام نمایشی تو" ':'').'></div>';
 if($new&&$name==='password')echo '<p class="field-hint">حداقل ۱۰ نویسه؛ از یک رمز طولانی و منحصربه‌فرد استفاده کن.</p>';
 echo '</div>';
}
function csrf_field(): void {echo '<input type="hidden" name="_csrf" value="'.e(csrf()).'">';}
