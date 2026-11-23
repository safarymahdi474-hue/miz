<?php
// Development router only. Production Apache/Nginx rules are supplied separately.
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)??'/');
if(str_contains($path,'..')||str_contains($path,"\0")||preg_match('~(?:^|/)(?:\.|app(?:/|$)|storage(?:/|$)|database(?:/|$)|docs(?:/|$)|tests(?:/|$))~i',$path)||preg_match('/\.(?:sql|sqlite|db|log|ini|bak|env|md|py|sha256)(?:-[a-z]+)?$/i',$path)){http_response_code(404);exit;}
if($path==='/'||$path==='/index.php'){require __DIR__.'/index.php';return;}
$file=realpath(__DIR__.$path);
if($file&&str_starts_with($file,__DIR__.DIRECTORY_SEPARATOR)&&is_file($file))return false;
http_response_code(404);echo 'Not found';
