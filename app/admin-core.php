<?php
require_once __DIR__.'/migrations.php';require_once __DIR__.'/progress.php';
// Additive, resumable migration. Existing config, accounts and study rows are retained.
function admin_schema_upgrade(): void {
 if(migration_version()===MIZ_SCHEMA_VERSION)return;
 $lock=migration_lock('admin');
 try {
  if(migration_version()===MIZ_SCHEMA_VERSION)return;
  $GLOBALS['miz_upgrade_step']='settings';
  query('CREATE TABLE IF NOT EXISTS '.table('site_settings').' (setting_key VARCHAR(64) PRIMARY KEY,setting_value TEXT NOT NULL)'.migration_options());migration_unicode('site_settings');
  require_once MIZ_ROOT.'/app/groups.php';room_upgrade();
  foreach(['users'=>['disabled','TINYINT NOT NULL DEFAULT 0'],'study_groups'=>['archived','TINYINT NOT NULL DEFAULT 0']] as $name=>$column){
   $cols=sqlite_mode()?rows('PRAGMA table_info('.table($name).')'):rows('SHOW COLUMNS FROM '.table($name));
   if(!in_array($column[0],array_column($cols,sqlite_mode()?'name':'Field'),true))query('ALTER TABLE '.table($name).' ADD COLUMN '.$column[0].' '.$column[1]);
  }
  foreach(['study_groups'=>['background_continue'=>'TINYINT NOT NULL DEFAULT 0','background_minutes'=>'INT NOT NULL DEFAULT 60','deleted_at'=>'BIGINT NOT NULL DEFAULT 0'],'room_presence'=>['run_until'=>'BIGINT NOT NULL DEFAULT 0','run_from'=>'BIGINT NOT NULL DEFAULT 0']] as $name=>$columns){
   $existing=sqlite_mode()?rows('PRAGMA table_info('.table($name).')'):rows('SHOW COLUMNS FROM '.table($name));$names=array_column($existing,sqlite_mode()?'name':'Field');foreach($columns as $column=>$type)if(!in_array($column,$names,true))query('ALTER TABLE '.table($name).' ADD COLUMN '.$column.' '.$type);
  }
  if(!sqlite_mode())foreach(['room_presence','room_history'] as $name){$mode=one('SHOW COLUMNS FROM '.table($name)." LIKE 'mode'");if(preg_match('/^varchar\((\d+)\)$/i',$mode['Type']??'',$length)&&((int)$length[1])<12)query('ALTER TABLE '.table($name)." MODIFY COLUMN mode VARCHAR(12) NOT NULL".($name==='room_presence'?" DEFAULT 'manual'":''));}
  query('CREATE TABLE IF NOT EXISTS '.table('admin_audit').' (id CHAR(32) PRIMARY KEY,actor_id CHAR(32) NOT NULL,action VARCHAR(40) NOT NULL,target_id VARCHAR(64) NOT NULL,details TEXT NOT NULL,created_at BIGINT NOT NULL)'.migration_options());migration_unicode('admin_audit');
  progress_schema_upgrade();
  foreach(['registration_open'=>'1','group_creation_open'=>'1','announcement'=>'','site_name'=>'میز','_schema_version'=>MIZ_SCHEMA_VERSION] as $key=>$value)query('INSERT INTO '.table('site_settings').' (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[$key,($key==='_schema_version'?$value:(one('SELECT setting_value FROM '.table('site_settings').' WHERE setting_key=?',[$key])['setting_value']??$value))]);
 } finally {migration_unlock($lock);}
}
function site_settings(): array {static $settings;if($settings===null){$settings=['registration_open'=>'1','group_creation_open'=>'1','announcement'=>'','site_name'=>'میز'];if(installed())foreach(rows('SELECT setting_key,setting_value FROM '.table('site_settings')) as $row)if(array_key_exists($row['setting_key'],$settings))$settings[$row['setting_key']]=$row['setting_value'];}return $settings;}
function require_admin_api(): array {$u=user();if(!$u)fail(401,'AUTH_REQUIRED','ابتدا وارد حساب شو.');if($u['role']!=='admin')fail(403,'ADMIN_ONLY','این بخش فقط برای مدیر سایت است.');return $u;}
function admin_log(string $actor,string $action,string $target,array $details=[]): void {query('INSERT INTO '.table('admin_audit').' (id,actor_id,action,target_id,details,created_at) VALUES (?,?,?,?,?,?)',[ident(),$actor,$action,$target,json_encode($details,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),now_ms()]);}
function admin_page(): int {return max(1,min(10000,(int)($_GET['page']??1)));}
function admin_count(string $sql,array $params=[]): int {return (int)(one($sql,$params)['n']??0);}
function admin_read(string $path,array $u): array {
 $time=now_ms();$page=admin_page();$offset=($page-1)*20;$term=trim((string)($_GET['q']??''));if(text_length($term)>100)fail(422,'SEARCH','عبارت جست‌وجو طولانی است.');$like='%'.str_replace(['!','%','_'],['!!','!%','!_'],$term).'%';
 if($path==='/overview'){
  $stats=['users'=>admin_count('SELECT COUNT(*) AS n FROM '.table('users')),'admins'=>admin_count('SELECT COUNT(*) AS n FROM '.table('users')." WHERE role='admin' AND disabled=0"),'suspended'=>admin_count('SELECT COUNT(*) AS n FROM '.table('users').' WHERE disabled=1'),'groups'=>admin_count('SELECT COUNT(*) AS n FROM '.table('study_groups').' WHERE archived=0'),'archived'=>admin_count('SELECT COUNT(*) AS n FROM '.table('study_groups').' WHERE archived=1'),'online'=>admin_count('SELECT COUNT(*) AS n FROM '.table('room_presence').' WHERE last_seen>=?',[$time-PRESENCE_TTL]),'sessions'=>admin_count('SELECT COUNT(*) AS n FROM '.table('study_sessions')),'studyMs'=>admin_count('SELECT COALESCE(SUM(active_ms),0) AS n FROM '.table('study_sessions')),'pending'=>admin_count('SELECT COUNT(*) AS n FROM '.table('group_members')." WHERE status='pending'")];
  $trend=[];for($i=6;$i>=0;$i--){$from=$time-($i+1)*86400000;$to=$time-$i*86400000;$trend[]=['at'=>$to,'studyMs'=>admin_count('SELECT COALESCE(SUM(active_ms),0) AS n FROM '.table('study_sessions').' WHERE start_ms>=? AND start_ms<?',[$from,$to]),'newUsers'=>admin_count('SELECT COUNT(*) AS n FROM '.table('users').' WHERE created_at>=? AND created_at<?',[$from,$to])];}
  $top=rows('SELECT g.id,g.name,(SELECT COALESCE(SUM(h.active_ms),0) FROM '.table('room_history').' h WHERE h.group_id=g.id) AS totalMs FROM '.table('study_groups').' g WHERE g.deleted_at=0 AND g.archived=0 AND g.is_personal=0 AND g.is_private=0 ORDER BY totalMs DESC,g.created_at DESC LIMIT 5');
  $events=rows('SELECT a.action,a.target_id AS targetId,a.details,a.created_at AS createdAt,u.display_name AS actor,COALESCE(t.display_name,g.name,a.target_id) AS targetName FROM '.table('admin_audit').' a JOIN '.table('users').' u ON u.id=a.actor_id LEFT JOIN '.table('users').' t ON t.id=a.target_id LEFT JOIN '.table('study_groups').' g ON g.id=a.target_id ORDER BY a.created_at DESC LIMIT 6');
  return ['stats'=>$stats,'trend'=>$trend,'topGroups'=>$top,'events'=>$events,'me'=>['id'=>$u['id'],'name'=>$u['display_name']],'settings'=>site_settings()];
 }
 if($path==='/users'){
  $status=$_GET['status']??'all';$where=" WHERE (u.display_name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')";$params=[$like,$like];
  if($status==='suspended')$where.=' AND u.disabled=1';elseif($status==='admins')$where.=" AND u.role='admin'";elseif($status==='active')$where.=' AND u.disabled=0';
  $total=admin_count('SELECT COUNT(*) AS n FROM '.table('users').' u'.$where,$params);
  $items=rows('SELECT u.id,u.display_name AS name,u.email,u.role,u.disabled,u.created_at AS createdAt,(SELECT COUNT(*) FROM '.table('study_sessions').' s WHERE s.user_id=u.id) AS sessionCount,(SELECT COALESCE(SUM(s.active_ms),0) FROM '.table('study_sessions').' s WHERE s.user_id=u.id) AS studyMs,(SELECT COUNT(*) FROM '.table('group_members')." m WHERE m.user_id=u.id AND m.status='approved') AS groupCount FROM ".table('users').' u'.$where.' ORDER BY u.created_at DESC,u.id LIMIT 20 OFFSET '.$offset,$params);return compact('items','total','page');
 }
 if(preg_match('~^/users/([a-f0-9]{32})$~D',$path,$m)){
  $person=one('SELECT id,display_name AS name,email,role,disabled,goal,created_at AS createdAt FROM '.table('users').' WHERE id=?',[$m[1]]);if(!$person)fail(404,'USER_NOT_FOUND','کاربر پیدا نشد.');
  $sessions=rows('SELECT subject_name AS subjectName,start_ms AS start,active_ms AS activeMs,elapsed_ms AS elapsedMs FROM '.table('study_sessions').' WHERE user_id=? ORDER BY start_ms DESC LIMIT 20',[$m[1]]);
  $groups=rows('SELECT g.id,g.name,m.status FROM '.table('group_members').' m JOIN '.table('study_groups').' g ON g.id=m.group_id WHERE m.user_id=? ORDER BY g.created_at DESC',[$m[1]]);return ['user'=>$person,'sessions'=>$sessions,'groups'=>$groups];
 }
 if($path==='/groups'){
  $where=" WHERE g.is_personal=0 AND g.name LIKE ? ESCAPE '!'";$params=[$like];$status=$_GET['status']??'all';if($status==='archived')$where.=' AND g.archived=1';elseif($status==='active')$where.=' AND g.archived=0';
  $total=admin_count('SELECT COUNT(*) AS n FROM '.table('study_groups').' g'.$where,$params);
  $items=rows('SELECT g.id,g.name,g.archived,g.deleted_at AS deletedAt,g.camera_required AS cameraRequired,g.created_at AS createdAt,u.display_name AS ownerName,(SELECT COUNT(*) FROM '.table('group_members')." m WHERE m.group_id=g.id AND m.status='approved') AS memberCount,(SELECT COALESCE(SUM(h.active_ms),0) FROM ".table('room_history').' h WHERE h.group_id=g.id) AS totalMs FROM '.table('study_groups').' g JOIN '.table('users').' u ON u.id=g.owner_id'.$where.' ORDER BY g.created_at DESC,g.id LIMIT 20 OFFSET '.$offset,$params);return compact('items','total','page');
 }
 if(preg_match('~^/groups/([a-f0-9]{32})$~D',$path,$m)){
  $g=group_info($m[1]);$g['archived']=(bool)one('SELECT archived FROM '.table('study_groups').' WHERE id=?',[$m[1]])['archived'];
  $members=rows('SELECT m.user_id AS id,u.display_name AS name,m.status FROM '.table('group_members').' m JOIN '.table('users').' u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.requested_at DESC',[$m[1]]);
  $history=rows('SELECT u.display_name AS name,h.active_ms AS activeMs,h.entered_at AS enteredAt,h.mode FROM '.table('room_history').' h JOIN '.table('users').' u ON u.id=h.user_id WHERE h.group_id=? ORDER BY h.last_seen DESC LIMIT 30',[$m[1]]);return ['group'=>$g,'members'=>$members,'history'=>$history];
 }
 if($path==='/audit'){$total=admin_count('SELECT COUNT(*) AS n FROM '.table('admin_audit'));$items=rows('SELECT a.id,a.action,a.target_id AS targetId,a.details,a.created_at AS createdAt,u.display_name AS actor,COALESCE(t.display_name,g.name,a.target_id) AS targetName FROM '.table('admin_audit').' a JOIN '.table('users').' u ON u.id=a.actor_id LEFT JOIN '.table('users').' t ON t.id=a.target_id LEFT JOIN '.table('study_groups').' g ON g.id=a.target_id ORDER BY a.created_at DESC,a.id LIMIT 20 OFFSET '.$offset);return compact('items','total','page');}
 if($path==='/settings')return ['settings'=>site_settings()];
 if($path==='/health')return ['php'=>PHP_VERSION,'database'=>sqlite_mode()?'SQLite':'MySQL / MariaDB','schemaVersion'=>MIZ_SCHEMA_VERSION,'storageWritable'=>is_writable(MIZ_STORAGE),'sessionStorageWritable'=>is_writable(MIZ_STORAGE.'/sessions'),'pdo'=>PDO::getAvailableDrivers(),'adminCount'=>admin_count('SELECT COUNT(*) AS n FROM '.table('users')." WHERE role='admin' AND disabled=0"),'checkedAt'=>$time];
 fail(404,'NOT_FOUND','این بخش پیدا نشد.');
}
function admin_write(string $path,array $data,array $u): array {
 $actor=$u['id'];begin_write();try{room_settle();
 // Lock administrators in stable order to protect the last active admin across concurrent requests.
 rows('SELECT id FROM '.table('users')." WHERE role='admin' ORDER BY id FOR UPDATE");
 $current=one('SELECT role,disabled,session_version FROM '.table('users').' WHERE id=?',[$actor]);if(!$current||$current['role']!=='admin'||(int)$current['disabled']||(int)$current['session_version']!==(int)$u['session_version'])fail(403,'ADMIN_CHANGED','دسترسی مدیریت تغییر کرده است؛ دوباره وارد شو.');
 if(preg_match('~^/users/([a-f0-9]{32})$~D',$path,$m)){
  $id=$m[1];$person=one('SELECT id,role,disabled FROM '.table('users').' WHERE id=? FOR UPDATE',[$id]);if(!$person)fail(404,'USER_NOT_FOUND','کاربر پیدا نشد.');$action=$data['action']??'';
  if(in_array($action,['suspend','activate','promote','demote'],true)){
   if($id===$actor)fail(422,'SELF_PROTECTED','نقش و وضعیت حساب خودت را از این بخش تغییر نده.');
   $role=$action==='promote'?'admin':($action==='demote'?'member':$person['role']);$disabled=$action==='suspend'?1:($action==='activate'?0:(int)$person['disabled']);
   if($person['role']==='admin'&&!(int)$person['disabled']&&($disabled||$role!=='admin')&&admin_count('SELECT COUNT(*) AS n FROM '.table('users')." WHERE role='admin' AND disabled=0")<=1)fail(422,'LAST_ADMIN','حداقل یک مدیر فعال باید باقی بماند.');
   query('UPDATE '.table('users').' SET role=?,disabled=?,session_version=session_version+1 WHERE id=?',[$role,$disabled,$id]);query('DELETE FROM '.table('room_presence').' WHERE user_id=?',[$id]);admin_log($actor,'user.'.$action,$id,['role'=>$role,'disabled'=>$disabled]);
  }elseif($action==='signout'){if($id===$actor)fail(422,'SELF_PROTECTED','برای خروج از حساب خودت از دکمهٔ خروج استفاده کن.');query('UPDATE '.table('users').' SET session_version=session_version+1 WHERE id=?',[$id]);query('DELETE FROM '.table('room_presence').' WHERE user_id=?',[$id]);admin_log($actor,'user.signout',$id);}
  else fail(422,'ACTION','عملیات معتبر نیست.');
 }elseif(preg_match('~^/groups/([a-f0-9]{32})$~D',$path,$m)){
  $id=$m[1];$g=group_info($id,true);$action=$data['action']??'';
  if($action==='delete'){progress_detach($id);query('UPDATE '.table('study_groups').' SET deleted_at=?,archived=1 WHERE id=?',[now_ms(),$id]);query('DELETE FROM '.table('room_presence').' WHERE group_id=?',[$id]);admin_log($actor,'group.delete',$id);}
  elseif($action==='archive'||$action==='restore'){progress_detach($id);query('UPDATE '.table('study_groups').' SET archived=?,deleted_at=0 WHERE id=?',[$action==='archive'?1:0,$id]);query('DELETE FROM '.table('room_presence').' WHERE group_id=?',[$id]);admin_log($actor,'group.'.$action,$id);}
  elseif($action==='edit'){progress_detach($id);$name=clean_name($data['name']??null,48);if(!is_bool($data['cameraRequired']??null))fail(422,'POLICY','قانون دوربین معتبر نیست.');$background=$data['backgroundContinue']??$g['backgroundContinue'];$minutes=$data['backgroundMinutes']??$g['backgroundMinutes'];if(!is_bool($background)||!in_array($minutes,[15,30,60,120],true))fail(422,'POLICY','تنظیم ادامهٔ زمان معتبر نیست.');query('UPDATE '.table('study_groups').' SET name=?,camera_required=?,background_continue=?,background_minutes=? WHERE id=?',[$name,$data['cameraRequired']?1:0,$background?1:0,$minutes,$id]);if((bool)$g['cameraRequired']!==$data['cameraRequired']||$background!==$g['backgroundContinue']||$minutes!==$g['backgroundMinutes'])query('DELETE FROM '.table('room_presence').' WHERE group_id=?',[$id]);admin_log($actor,'group.edit',$id,['name'=>$name,'cameraRequired'=>$data['cameraRequired']]);}
  elseif(in_array($action,['approve','reject','kick'],true)){$target=$data['userId']??'';if(!is_string($target)||!preg_match('/^[a-f0-9]{32}$/D',$target))fail(422,'MEMBER','عضو معتبر نیست.');if($target===$g['ownerId'])fail(422,'OWNER_PROTECTED','سازندهٔ اتاق قابل اخراج نیست.');if($action==='kick')progress_detach($id,$target);$state=$action==='approve'?'approved':($action==='reject'?'rejected':'kicked');if($action==='approve'&&admin_count('SELECT COUNT(*) AS n FROM '.table('group_members')." WHERE group_id=? AND status='approved'",[$id])>=50)fail(409,'GROUP_FULL','ظرفیت گروه پر است.');$q=query('UPDATE '.table('group_members').' SET status=?,updated_at=? WHERE group_id=? AND user_id=? AND status=?',[$state,now_ms(),$id,$target,$action==='kick'?'approved':'pending']);if(!$q->rowCount())fail(409,'MEMBER_CHANGED','وضعیت این عضو تغییر کرده است.');query('DELETE FROM '.table('room_presence').' WHERE group_id=? AND user_id=?',[$id,$target]);admin_log($actor,'member.'.$action,$id,['userId'=>$target]);}
  else fail(422,'ACTION','عملیات معتبر نیست.');
 }elseif($path==='/settings'){
  $name=clean_name($data['site_name']??null,32);$announcement=$data['announcement']??'';if(!is_string($announcement)||text_length($announcement)>500)fail(422,'ANNOUNCEMENT','اطلاعیه باید حداکثر ۵۰۰ نویسه باشد.');
  foreach(['registration_open','group_creation_open'] as $key)if(!is_bool($data[$key]??null))fail(422,'SETTING','وضعیت تنظیمات معتبر نیست.');
  foreach(['site_name'=>$name,'announcement'=>trim($announcement),'registration_open'=>$data['registration_open']?'1':'0','group_creation_open'=>$data['group_creation_open']?'1':'0'] as $key=>$value)query('INSERT INTO '.table('site_settings').' (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[$key,$value]);admin_log($actor,'settings.update','site',['changed'=>['site_name','announcement','registration_open','group_creation_open']]);
 }else fail(404,'NOT_FOUND','عملیات پیدا نشد.');
 db()->commit();return ['saved'=>true];
 }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
