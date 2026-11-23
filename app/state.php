<?php
function account_state(string $uid): array {
 $subjects=rows('SELECT id,name,color FROM '.table('subjects').' WHERE user_id=? ORDER BY position,id',[$uid]);
 $records=rows('SELECT * FROM '.table('study_sessions').' WHERE user_id=? ORDER BY start_ms',[$uid]);$sessions=[];
 foreach($records as $r)$sessions[]=['id'=>$r['id'],'subjectId'=>$r['subject_id'],'subjectName'=>$r['subject_name'],'color'=>$r['color'],'start'=>(int)$r['start_ms'],'end'=>(int)$r['end_ms'],'activeMs'=>(int)$r['active_ms'],'elapsedMs'=>(int)$r['elapsed_ms'],'segments'=>json_decode($r['segments'],true),'thoughts'=>json_decode($r['thoughts'],true),'interrupted'=>(bool)$r['interrupted']];
 $u=one('SELECT goal FROM '.table('users').' WHERE id=?',[$uid]);return ['subjects'=>$subjects,'sessions'=>$sessions,'goal'=>(int)$u['goal'],'schemaVersion'=>2];
}
function record_id(mixed $id,int $max=80): string {if(!is_string($id)||strlen($id)>$max||!preg_match('/^[a-zA-Z0-9_-]+$/D',$id))fail(422,'INVALID_ID','شناسهٔ رکورد معتبر نیست.');return $id;}
function record_color(mixed $color): string {if(!is_string($color)||!preg_match('/^#[a-fA-F0-9]{6}$/D',$color))fail(422,'INVALID_COLOR','رنگ درس معتبر نیست.');return $color;}
function number_ms(mixed $v): float {if(!is_int($v)&&!is_float($v)||!is_finite((float)$v)||$v<0||$v>9007199254740991)fail(422,'INVALID_TIME','زمان معتبر نیست.');return (float)$v;}
function normalize_session(array $r): array {
 $id=record_id($r['id']??null);$subject=record_id($r['subjectId']??null,64);$name=clean_name($r['subjectName']??null,40);$color=record_color($r['color']??null);$start=number_ms($r['start']??null);$end=number_ms($r['end']??null);
 if($end<$start||$end-$start>7*86400000)fail(422,'INVALID_TIME','مدت جلسه معتبر نیست.');
 $segments=$r['segments']??null;if(!is_array($segments)||count($segments)>20000)fail(422,'SEGMENTS','مسیر جلسه معتبر نیست.');$last=$start;$active=0.;$clean=[];
 foreach($segments as $s){if(!is_array($s))fail(422,'SEGMENTS','مسیر جلسه معتبر نیست.');$from=number_ms($s['from']??null);$to=number_ms($s['to']??null);$type=$s['type']??'';if(!in_array($type,['present','away'],true)||$from<$last-1||$to<$from||$to>$end+2)fail(422,'SEGMENTS','مسیر جلسه معتبر نیست.');if($type==='present')$active+=$to-$from;$last=$to;$clean[]=['from'=>$from,'to'=>$to,'type'=>$type];}
 if(abs(number_ms($r['activeMs']??null)-$active)>5)fail(422,'INVALID_TOTAL','جمع زمان جلسه با مسیر آن یکسان نیست.');
 $thoughts=$r['thoughts']??[];if(!is_array($thoughts)||count($thoughts)>101)fail(422,'THOUGHTS','فهرست افکار معتبر نیست.');$notes=[];foreach($thoughts as $t){if(!is_array($t)||!is_string($t['text']??null)||text_length(trim($t['text']))<1||text_length($t['text'])>500)fail(422,'THOUGHTS','متن فکر معتبر نیست.');$notes[]=['text'=>trim($t['text']),'createdAt'=>(int)round(number_ms($t['createdAt']??$start))];}
 return [$id,$subject,$name,$color,(int)round($start),(int)round($end),(int)round($active),(int)round($end-$start),json_encode($clean,JSON_THROW_ON_ERROR),json_encode($notes,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),!empty($r['interrupted'])?1:0];
}
function apply_changes(string $uid,array $data): void {
 $changes=$data['changes']??null;if(!is_array($changes)||count($changes)>100)fail(422,'CHANGES','تغییرات معتبر نیست.');
 begin_write();try{one('SELECT id FROM '.table('users').' WHERE id=? FOR UPDATE',[$uid]);foreach($changes as $change){$type=$change['type']??'';$value=$change['value']??null;
 switch($type){
 case 'subject_upsert':if(!is_array($value))fail(422,'SUBJECT','درس معتبر نیست.');$id=record_id($value['id']??null,64);$name=clean_name($value['name']??null,40);$color=record_color($value['color']??null);$position=max(0,min(1000,(int)($value['position']??0)));query('INSERT INTO '.table('subjects').' (user_id,id,name,color,position) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),color=VALUES(color),position=VALUES(position)',[$uid,$id,$name,$color,$position]);break;
 case 'subject_delete':query('DELETE FROM '.table('subjects').' WHERE user_id=? AND id=?',[$uid,record_id($value,64)]);break;
 case 'goal':if(!is_int($value)||$value<5||$value>1440)fail(422,'GOAL','هدف روزانه معتبر نیست.');query('UPDATE '.table('users').' SET goal=? WHERE id=?',[$value,$uid]);break;
 case 'session_upsert':if(!is_array($value))fail(422,'SESSION','جلسه معتبر نیست.');$record=normalize_session($value);query('INSERT INTO '.table('study_sessions').' (user_id,id,subject_id,subject_name,color,start_ms,end_ms,active_ms,elapsed_ms,segments,thoughts,interrupted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE subject_id=VALUES(subject_id),subject_name=VALUES(subject_name),color=VALUES(color),start_ms=VALUES(start_ms),end_ms=VALUES(end_ms),active_ms=VALUES(active_ms),elapsed_ms=VALUES(elapsed_ms),segments=VALUES(segments),thoughts=VALUES(thoughts),interrupted=VALUES(interrupted)',[$uid,...$record]);break;
 default:fail(422,'CHANGE','نوع تغییر معتبر نیست.');
 }}db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
