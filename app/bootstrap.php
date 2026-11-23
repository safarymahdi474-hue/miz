<?php
declare(strict_types=1);
const MIZ_ROOT = __DIR__ . '/..';
const MIZ_STORAGE = MIZ_ROOT . '/storage';
ini_set('display_errors','0');ini_set('log_errors','1');ini_set('error_log',MIZ_STORAGE.'/app.log');
function config(): array { static $config; if ($config === null) { $file=MIZ_STORAGE.'/config.php'; $config=is_file($file)?require $file:[]; } return $config; }
function installed(): bool { return is_file(MIZ_STORAGE.'/config.php'); }
// The entry script determines the mount path. Old /public config values cannot redirect a root install.
function base_path(): string {$path=str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME']??'/'));return $path==='/'||$path==='.'?'':rtrim($path,'/');}
function url(string $path=''): string { return base_path().'/'.ltrim($path,'/'); }
function e(mixed $s): string { return htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
function redirect(string $path=''): never { header('Location: '.url($path),true,303);exit; }
function now_ms(): int { return (int)floor(microtime(true)*1000); }
function ident(): string { return bin2hex(random_bytes(16)); }
function table(string $name): string { return '`'.config()['prefix'].$name.'`'; }
function sqlite_mode(): bool {return (config()['db']['driver']??'mysql')==='sqlite';}
function db(): PDO {static $db;if(!$db){$c=config()['db'];$options=[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC];if(sqlite_mode()){$db=new PDO('sqlite:'.MIZ_STORAGE.'/miz.sqlite',null,null,$options);$db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL;');}else{$options[PDO::ATTR_EMULATE_PREPARES]=false;$options[PDO::MYSQL_ATTR_FOUND_ROWS]=true;$db=new PDO('mysql:host='.$c['host'].';port='.$c['port'].';dbname='.$c['name'].';charset=utf8mb4',$c['user'],$c['password'],$options);}}return $db;}
function query(string $sql,array $params=[]): PDOStatement {
 if(sqlite_mode()){
  $sql=str_replace(' FOR UPDATE','',$sql);
  $sql=str_replace(['GREATEST(', 'LEAST('],['MAX(', 'MIN('],$sql);
  if(str_contains($sql,'ON DUPLICATE KEY UPDATE')){
   $sql=str_replace('ON DUPLICATE KEY UPDATE','ON CONFLICT DO UPDATE SET',$sql);
   $sql=preg_replace('/VALUES\((\w+)\)/i','excluded.$1',$sql);
   // SQLite evaluates update expressions against the original row, as required here.
  }
 }
 $q=db()->prepare($sql);foreach(array_values($params) as $index=>$value){$q->bindValue($index+1,$value,is_int($value)?PDO::PARAM_INT:(is_bool($value)?PDO::PARAM_BOOL:(is_null($value)?PDO::PARAM_NULL:PDO::PARAM_STR)));}$q->execute();return $q;
}
function begin_write(): void {db()->beginTransaction();if(sqlite_mode())db()->exec('UPDATE '.table('users').' SET goal=goal WHERE 0');}
function one(string $sql,array $params=[]): ?array { $r=query($sql,$params)->fetch();return $r===false?null:$r; }
function rows(string $sql,array $params=[]): array { return query($sql,$params)->fetchAll(); }
function json_response(array $data,int $status=200): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit; }
class ApiError extends RuntimeException { public function __construct(public int $status, public string $errorCode,string $message){parent::__construct($message);} }
function fail(int $status,string $code,string $message): never { throw new ApiError($status,$code,$message); }
function text_length(string $value): int {return preg_match_all('/./us',$value,$matches)?:0;}
function clean_name(mixed $value,int $max=32): string {if(!is_string($value))fail(422,'INVALID_NAME','نام معتبر وارد کن.');$s=preg_replace('/\s+/u',' ',trim($value));if(!$s||text_length($s)<2||text_length($s)>$max||preg_match('/[\x00-\x1f\x7f]/u',$s))fail(422,'INVALID_NAME','نام باید بین ۲ تا '.$max.' نویسه باشد.');return $s;}
function csrf(): string {if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));return $_SESSION['csrf'];}
function verify_csrf(?string $token): void {if(!$token||!hash_equals(csrf(),$token))fail(419,'CSRF','اعتبار صفحه تمام شده؛ صفحه را تازه کن.');$origin=$_SERVER['HTTP_ORIGIN']??'';if($origin&&installed()){$u=parse_url(config()['base_url']);$expected=$u['scheme'].'://'.$u['host'].(isset($u['port'])?':'.$u['port']:'');if(!hash_equals($expected,$origin))fail(403,'ORIGIN','درخواست از این مبدأ مجاز نیست.');}}
function user(): ?array {static $loaded=false,$user=null;if($loaded)return $user;$loaded=true;if(!installed()||empty($_SESSION['uid']))return null;$r=one('SELECT id,email,display_name,role,goal,session_version,disabled FROM '.table('users').' WHERE id=?',[$_SESSION['uid']]);if(!$r||(int)$r['disabled']===1||(int)$r['session_version']!==($_SESSION['version']??0)){$_SESSION=[];return null;}return $user=$r;}
function require_user(): array {$u=user();if(!$u)redirect('login.php');return $u;}
function login_user(array $u): void {session_regenerate_id(true);$_SESSION=['uid'=>$u['id'],'version'=>(int)$u['session_version'],'csrf'=>bin2hex(random_bytes(32)),'issued'=>time()];}
function logout_user(): void {$_SESSION=[];session_regenerate_id(true);}
function validate_password(mixed $p): string {if(!is_string($p)||text_length($p)<10||text_length($p)>64||strlen($p)>72||str_contains($p,"\0"))fail(422,'PASSWORD','رمز باید حداقل ۱۰ نویسه داشته باشد؛ رمز خیلی طولانی را کوتاه‌تر کن.');return $p;}
function password_digest(string $p): string {return password_hash($p,defined('PASSWORD_ARGON2ID')?PASSWORD_ARGON2ID:PASSWORD_DEFAULT);}
function new_recovery(): array {$raw=strtoupper(bin2hex(random_bytes(20)));return [implode('-',str_split($raw,5)),hash('sha256',$raw)];}
function recovery_hash(string $code): string {return hash('sha256',strtoupper(preg_replace('/[\s-]/','',$code)));}
function rate_limit(string $scope,string $key,int $max=10,int $seconds=900): void {
 $hash=hash_hmac('sha256',$scope.'|'.$key,config()['app_key']);$now=now_ms();
 if(sqlite_mode())query('INSERT INTO '.table('rate_limits').' (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END',[$hash,$now+$seconds*1000,$now,$now]);
 else query('INSERT INTO '.table('rate_limits').' (bucket,attempts,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at<?,1,attempts+1),expires_at=IF(expires_at<?,VALUES(expires_at),expires_at)',[$hash,$now+$seconds*1000,$now,$now]);
 $row=one('SELECT attempts FROM '.table('rate_limits').' WHERE bucket=?',[$hash]);if((int)$row['attempts']>$max)fail(429,'RATE_LIMIT','تلاش‌های زیادی انجام شده؛ چند دقیقه بعد دوباره امتحان کن.');
}
function client_ip(): string {return $_SERVER['REMOTE_ADDR']??'unknown';}
function request_json(): array {$max=2*1024*1024;if((int)($_SERVER['CONTENT_LENGTH']??0)>$max)fail(413,'TOO_LARGE','حجم درخواست بیش از حد مجاز است.');$raw=file_get_contents('php://input',false,null,0,$max+1);if($raw===false||strlen($raw)>$max)fail(413,'TOO_LARGE','حجم درخواست بیش از حد مجاز است.');try{$data=json_decode($raw,true,64,JSON_THROW_ON_ERROR);}catch(JsonException){fail(400,'JSON','درخواست معتبر نیست.');}if(!is_array($data)||array_is_list($data)&&$data!==[])fail(400,'JSON','درخواست معتبر نیست.');return $data;}
header('X-Content-Type-Options: nosniff');header('Referrer-Policy: same-origin');header('X-Frame-Options: SAMEORIGIN');header("Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'");header('Cache-Control: no-store, private');header('Permissions-Policy: camera=(self), microphone=(), geolocation=()');
if((int)($_SERVER['CONTENT_LENGTH']??0)>2*1024*1024){http_response_code(413);exit('حجم درخواست بیش از حد مجاز است.');}
if(!is_dir(MIZ_STORAGE.'/sessions'))@mkdir(MIZ_STORAGE.'/sessions',0700,true);
ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime','86400');
if(is_writable(MIZ_STORAGE.'/sessions'))session_save_path(MIZ_STORAGE.'/sessions');
session_name(installed()?'MIZ_'.substr(hash('sha256',config()['app_key']),0,12):'MIZ_INSTALL');
session_set_cookie_params(['lifetime'=>0,'path'=>base_path().'/'?:'/','secure'=>installed()?str_starts_with(config()['base_url'],'https://'):(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'),'httponly'=>true,'samesite'=>'Lax']);session_start();
if(isset($_SESSION['issued'])&&time()-$_SESSION['issued']>86400)logout_user();

require_once MIZ_ROOT.'/app/admin-core.php';
if(installed())try{admin_schema_upgrade();}catch(Throwable $error){migration_failure($error);}
