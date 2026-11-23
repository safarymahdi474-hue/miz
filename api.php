<?php
declare(strict_types=1);
require __DIR__.'/app/bootstrap.php';require MIZ_ROOT.'/app/state.php';require_once MIZ_ROOT.'/app/groups.php';
try{
 if(!installed())fail(503,'INSTALL_REQUIRED','ابتدا سایت را نصب کن.');$method=$_SERVER['REQUEST_METHOD'];if(!in_array($method,['GET','POST'],true))fail(405,'METHOD','این روش مجاز نیست.');$path='/'.trim((string)($_GET['route']??''),'/');$data=$method==='POST'?request_json():[];if($method==='POST')verify_csrf($_SERVER['HTTP_X_CSRF_TOKEN']??($data['_csrf']??null));
 if(str_starts_with($path,'/public-profile/')&&$method==='GET'){session_write_close();header('X-Robots-Tag: noindex, nofollow');header('Referrer-Policy: no-referrer');json_response(public_share_report(substr($path,strlen('/public-profile/'))));}
 $u=user();if($path==='/me'&&$method==='GET')json_response($u?['authenticated'=>true,'userId'=>$u['id'],'profile'=>['name'=>$u['display_name']]]:['authenticated'=>false,'profile'=>null]);if(!$u)fail(401,'AUTH_REQUIRED','برای ادامه وارد حساب میز شو.');
 session_write_close();
 if($path==='/profile'&&$method==='POST'){$name=clean_name($data['name']??null);query('UPDATE '.table('users').' SET display_name=? WHERE id=?',[$name,$u['id']]);json_response(['profile'=>['name'=>$name]]);}
 if($path==='/progress'&&$method==='GET'){room_settle();json_response(progress_totals($u['id']));}
 if($path==='/share-settings'){if($method==='GET')json_response(['settings'=>public_share_settings(one('SELECT * FROM '.table('public_shares').' WHERE user_id=?',[$u['id']]))]);json_response(['settings'=>public_share_save($data,$u['id'])]);}
 if($path==='/state'){
  if($method==='GET')json_response(['state'=>account_state($u['id'])]);
  apply_changes($u['id'],$data);json_response(['saved'=>true]);
 }
 if($path==='/ranking'&&$method==='GET'){room_settle();
 $ranking=progress_rank($u['id']);$members=$ranking['daily'];$groups=rows('SELECT g.id,g.name,(SELECT COALESCE(SUM(h.active_ms),0) FROM '.table('room_history')." h WHERE h.group_id=g.id) AS totalMs,(SELECT COUNT(*) FROM ".table('group_members')." m WHERE m.group_id=g.id AND m.status='approved') AS memberCount FROM ".table('study_groups').' g JOIN '.table('group_members')." me ON me.group_id=g.id AND me.user_id=? AND me.status='approved' WHERE g.deleted_at=0 AND g.archived=0 AND g.is_private=0 ORDER BY totalMs DESC,g.name LIMIT 100",[$u['id']]);foreach($groups as &$group){$group['totalMs']=(int)$group['totalMs'];$group['memberCount']=(int)$group['memberCount'];}unset($group);foreach($members as &$member)$member['activeMs']=(int)$member['activeMs'];unset($member);json_response([...$ranking,'members'=>$members,'groups'=>$groups]);
 }
 if($path==='/personal/enter'||$path==='/room'||str_starts_with($path,'/groups'))json_response(group_api($path,$method,$data,$u));
 fail(404,'NOT_FOUND','این مسیر پیدا نشد.');
}catch(ApiError $e){json_response(['error'=>['code'=>$e->errorCode,'message'=>$e->getMessage()]],$e->status);}catch(Throwable $e){error_log('Miz API failure: '.get_class($e).' '.$e->getCode());json_response(['error'=>['code'=>'SERVER_ERROR','message'=>'ارتباط با سرور برقرار نشد. دوباره امتحان کن.']],500);}
