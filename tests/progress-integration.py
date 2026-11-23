"""Canonical period/parallel-room/share checks on a disposable installed database."""
import os,sys,json,time,subprocess,tempfile,importlib.util,urllib.parse
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('integration.py'));base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
class Client(base.Client):
 def login(self,email,password):
  token=self.form_token('/login.php');status,body=self.request('/login.php',{'_csrf':token,'email':email,'password':password});assert status==200 and 'window.MIZ=' in body,(status,body[:300]);return self.bootstrap()['user']['id']
owner=Client();uid=owner.login('admin@example.test','AdminPassword123!');member=Client();mid=member.login('member@example.test','ValidPassword123!');visitor=Client()
def cli(code):
 with tempfile.TemporaryDirectory() as folder:
  script=Path(folder)/'check.php';script.write_text("<?php require $argv[1].'/app/bootstrap.php';"+code);result=subprocess.run([os.environ['MIZ_TEST_PHP'],str(script),os.environ['MIZ_TEST_SITE']],capture_output=True,text=True);assert result.returncode==0,(result.stdout,result.stderr);return result.stdout
group=owner.api('/groups',{'name':'گروه رتبهٔ تازه'})['group'];private=owner.api('/groups',{'name':'گروه اختصاصی تازه','isPrivate':True})['group'];path='/groups/'+group['id'];private_path='/groups/'+private['id']
member.api('/groups/join',{'code':group['code']});owner.api(path+'/members/'+mid+'/decision',{'decision':'approve'});visit=owner.api(path+'/enter',{})['visitId']
owner.api(path+'/companion',{'visitId':visit,'groupId':group['id']},expected=422);member.api(path+'/companion',{'visitId':visit,'groupId':private['id']},expected=409)
owner.api(path+'/companion',{'visitId':visit,'groupId':private['id']});time.sleep(.35)
snap=owner.api(path+'/heartbeat',{'visitId':visit,'activeMs':300,'studying':True,'subjectName':'زیست‌شناسی'});assert next(x for x in snap['members'] if x['isSelf'])['dailyMs']==300
peer=owner.api(private_path);assert next(x for x in peer['members'] if x['isSelf'])['activeMs']==300;assert next(x for x in peer['members'] if x['isSelf'])['dailyMs']==300
rank=member.api('/ranking');assert next(x for x in rank['daily'] if x['userId']==uid)['activeMs']>=300;assert not any(x['id']==private['id'] for x in owner.api('/ranking')['groups'])
owner.api(path+'/leave',{'visitId':visit,'activeMs':300,'studying':False});old=visit;visit=owner.api(path+'/enter',{})['visitId'];assert next(x for x in owner.api(path)['members'] if x['isSelf'])['dailyMs']==300
owner.api(path+'/heartbeat',{'visitId':old,'activeMs':999999999,'studying':True},expected=409);time.sleep(.35);owner.api(path+'/heartbeat',{'visitId':visit,'activeMs':300,'studying':True,'subjectName':'شیمی'});assert next(x for x in owner.api(path)['members'] if x['isSelf'])['dailyMs']==600
print('PASS daily cumulative time survives re-entry; one primary visit is mirrored in private group without duplicate rank credit')
assert not owner.api('/share-settings')['settings']['enabled'];visitor.api('/share-settings',expected=401)
options={'enabled':True,'name':'نام عمومی مستقل','showDaily':True,'showWeekly':False,'showSubjects':False,'showSessions':False,'rangeDays':7}
share=owner.api('/share-settings',options)['settings'];report=visitor.api('/public-profile/'+share['token']);assert report['name']==options['name'] and report['daily']
for key in ['weekly','subjects','sessions','email','userId','thoughts','groupName']:assert key not in report
old_token=share['token'];share=owner.api('/share-settings',dict(options,rotate=True,showSubjects=True,showWeekly=True,showSessions=True))['settings'];visitor.api('/public-profile/'+old_token,expected=404);report=visitor.api('/public-profile/'+share['token']);assert report['subjects'] and report['sessions'] and report['weekly'];assert 'گروه اختصاصی تازه' not in json.dumps(report,ensure_ascii=False)
owner.api('/share-settings',dict(options,enabled=False));visitor.api('/public-profile/'+share['token'],expected=404)
solo=owner.api('/personal/enter',{});time.sleep(.25);owner.api('/groups/'+solo['group']['id']+'/heartbeat',{'visitId':solo['visitId'],'activeMs':200,'studying':True,'subjectName':'مطالعهٔ شخصی'});owner.api(path+'/heartbeat',{'visitId':visit,'activeMs':999999999,'studying':True},expected=409)
assert not any(x['id']==solo['group']['id'] for x in owner.api('/groups')['groups']);assert not any(x['id']==solo['group']['id'] for x in owner.api('/ranking')['groups'])
before=json.loads(cli("echo json_encode(progress_totals('"+uid+"'));"))['dailyMs'];assert before>=800;assert owner.api('/progress')['dailyMs']==before;visitor.api('/progress',expected=401)
print('PASS opt-in public fields, no private identity/notes/group leakage, token rotation/revocation and private standalone study')
code="""$s=(int)(new DateTimeImmutable('2026-11-20 23:59:30',new DateTimeZone('Asia/Tehran')))->format('U')*1000;echo json_encode(progress_slices($s,$s+120000,120000));"""
slices=json.loads(cli(code));assert [(x['day'],x['week'],x['ms']) for x in slices]==[('2026-11-20','2026-11-14',30000),('2026-11-21','2026-11-21',90000)]
# Force one durable unaccounted delta and run independent PHP workers to exercise locking.
cli("query('UPDATE '.table('room_history').' SET active_ms=active_ms+100,last_seen=last_seen+100 WHERE visit_id=?',['"+solo['visitId']+"']);")
with tempfile.TemporaryDirectory() as folder:
 script=Path(folder)/'settle.php';script.write_text("<?php require $argv[1].'/app/bootstrap.php';progress_settle();")
 workers=[subprocess.Popen([os.environ['MIZ_TEST_PHP'],str(script),os.environ['MIZ_TEST_SITE']],stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(3)]
 for worker in workers:
  out,err=worker.communicate(timeout=20);assert worker.returncode==0,(out,err)
after=json.loads(cli("echo json_encode(progress_totals('"+uid+"'));"))['dailyMs'];assert after==before+100,(before,after)
print('PASS exact Tehran/Saturday boundaries and concurrent settlement with no duplicated credit')
