<?php
// Only schema metadata and additive/encoding changes. Never erase existing records.
const MIZ_SCHEMA_VERSION='7.0';
function migration_options(): string {return sqlite_mode()?'':' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';}
function migration_version(): ?string {
 try{return (string)(one('SELECT setting_value FROM '.table('site_settings')." WHERE setting_key='_schema_version'")['setting_value']??'');}
 catch(PDOException $e){$driver=(int)($e->errorInfo[1]??0);if($driver===1146||(sqlite_mode()&&str_contains($e->getMessage(),'no such table')))return null;throw $e;}
}
function migration_lock(string $scope): array {
 $file=MIZ_STORAGE.'/'.$scope.'-upgrade.lock';$handle=@fopen($file,'c');if(!$handle)$handle=@fopen($file,'r');
 if($handle){if(flock($handle,LOCK_EX))return ['file'=>$handle];fclose($handle);}
 // Shared hosts can leave an old lock file read-only or disallow local flock.
 if(!sqlite_mode()){$name='miz:'.substr(hash('sha256',config()['db']['name'].'|'.config()['prefix'].'|'.$scope),0,48);if((int)(one('SELECT GET_LOCK(?,10) AS acquired',[$name])['acquired']??0)===1)return ['db'=>$name];}
 throw new RuntimeException('MIZ_STORAGE_LOCK');
}
function migration_unlock(array $lock): void {if(isset($lock['file'])){flock($lock['file'],LOCK_UN);fclose($lock['file']);}else query('SELECT RELEASE_LOCK(?)',[$lock['db']]);}
function migration_unicode(string $name): void {
 if(sqlite_mode())return;
 // CREATE IF NOT EXISTS cannot fix tables left with the host's default collation.
 foreach(rows('SHOW FULL COLUMNS FROM '.table($name)) as $column)if(!empty($column['Collation'])&&strtolower($column['Collation'])!=='utf8mb4_unicode_ci'){
  $GLOBALS['miz_upgrade_step']='encoding:'.$name;
  query('ALTER TABLE '.table($name).' CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');break;
 }
}
function migration_failure(Throwable $error): never {
 $id=strtoupper(bin2hex(random_bytes(4)));$driver=(int)($error instanceof PDOException?($error->errorInfo[1]??0):0);$code='UPG-QUERY';$message='اجرای یکی از مراحل ارتقا کامل نشد.';
 if(in_array($driver,[1044,1045,1142,1143,1227],true)){$code='UPG-PERMISSION';$message='کاربر دیتابیس برای مرحلهٔ ارتقا دسترسی لازم را ندارد؛ مجوز CREATE، ALTER و INDEX را در پنل هاست بررسی کن.';}
 elseif(in_array($driver,[1267,1271,1366],true)){$code='UPG-ENCODING';$message='کدگذاری یا مرتب‌سازی جدول‌های دیتابیس یکسان نیست؛ فایل‌های نسخهٔ اصلاحی را کامل جایگزین کن.';}
 elseif(in_array($driver,[2002,2006,2013],true)){$code='UPG-CONNECTION';$message='اتصال به دیتابیس برقرار نماند؛ وضعیت سرویس دیتابیس هاست را بررسی کن.';}
 elseif($error->getMessage()==='MIZ_STORAGE_LOCK'||(sqlite_mode()&&$driver===8)){$code='UPG-STORAGE';$message='قفل ارتقا یا نوشتن دیتابیس در دسترس نیست؛ مالکیت و قابلیت نوشتن storage و فایل SQLite را بررسی کن.';}
 elseif(sqlite_mode()&&in_array($driver,[5,6],true)){$code='UPG-BUSY';$message='دیتابیس موقتاً قفل است؛ چند ثانیه بعد صفحه را تازه کن.';}
 elseif(in_array($driver,[1054,1146],true)){$code='UPG-SCHEMA';$message='ساختار دیتابیس ناقص است؛ فایل‌های بستهٔ اصلاحی را کامل جایگزین کن و دوباره صفحه را باز کن.';}
 error_log(json_encode(['event'=>'Miz upgrade failure','id'=>$id,'stage'=>$GLOBALS['miz_upgrade_step']??'version','class'=>get_class($error),'state'=>(string)$error->getCode(),'driver'=>$driver],JSON_UNESCAPED_SLASHES));
 http_response_code(503);header('Content-Type: text/plain; charset=UTF-8');exit($message."\nکد پیگیری: ".$code.' / '.$id."\nنصاب را دوباره اجرا نکن؛ ارتقا هیچ سابقه‌ای را حذف نمی‌کند.");
}
