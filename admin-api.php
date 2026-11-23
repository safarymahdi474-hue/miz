<?php
declare(strict_types=1);require __DIR__.'/app/bootstrap.php';require_once MIZ_ROOT.'/app/groups.php';
try {
 if(!installed())fail(503,'INSTALL_REQUIRED','ابتدا سایت را نصب کن.');$u=require_admin_api();$method=$_SERVER['REQUEST_METHOD'];$path='/'.trim((string)($_GET['route']??'overview'),'/');
 if($method==='GET'){session_write_close();room_settle();json_response(admin_read($path,$u));}
 if($method!=='POST')fail(405,'METHOD','این روش مجاز نیست.');$data=request_json();verify_csrf($_SERVER['HTTP_X_CSRF_TOKEN']??($data['_csrf']??null));session_write_close();rate_limit('admin-actions',$u['id'],120,60);json_response(admin_write($path,$data,$u));
}catch(ApiError $e){json_response(['error'=>['code'=>$e->errorCode,'message'=>$e->getMessage()]],$e->status);}catch(Throwable $e){error_log('Miz admin failure '.get_class($e).' '.$e->getCode());json_response(['error'=>['code'=>'SERVER_ERROR','message'=>'عملیات مدیریت انجام نشد؛ دوباره تلاش کن.']],500);}
