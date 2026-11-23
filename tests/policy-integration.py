"""Run after integration.py/admin-integration.py on a disposable installed copy only.
MIZ_TEST_SITE and MIZ_TEST_PHP enable controlled server-time simulation, never production.
"""
import os,json,time,sys,subprocess,tempfile,importlib.util
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('integration.py'));base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
class Client(base.Client):
 def login(self,email,password):
  token=self.form_token('/login.php');status,body=self.request('/login.php',{'_csrf':token,'email':email,'password':password});assert status==200 and 'window.MIZ=' in body
  return self.bootstrap()['user']['id']
owner=Client();uid=owner.login('admin@example.test','AdminPassword123!')
member=Client();mid=member.login('member@example.test','ValidPassword123!')
outsider=Client();outsider.login('other@example.test','ValidPassword123!')
group=owner.api('/groups',{'name':'گروه ادامهٔ زمان','backgroundContinue':True,'backgroundMinutes':15})['group'];gid=group['id'];path='/groups/'+gid
member.api('/groups/join',{'code':group['code']});owner.api(path+'/members/'+mid+'/decision',{'decision':'approve'})
member.api(path+'/settings',{'name':'غیرمجاز','backgroundContinue':True,'backgroundMinutes':15},expected=403)
member.api(path+'/delete',{},expected=403);member.api(path+'/restore',{},expected=403)
visit=owner.api(path+'/enter',{})['visitId'];beat={'visitId':visit,'activeMs':0,'studying':True,'mode':'manual'}
owner.api(path+'/heartbeat',beat)
def shift(ms):
 site=Path(os.environ['MIZ_TEST_SITE']);php=os.environ['MIZ_TEST_PHP']
 # Move the complete lease backwards without changing the host or database clock.
 code="""<?php require $argv[1].'/app/bootstrap.php';query('UPDATE '.table('room_presence').' SET entered_at=entered_at-?,last_seen=last_seen-?,run_from=run_from-?,run_until=run_until-? WHERE user_id=?',array_fill(0,4,(int)$argv[3])+[4=>$argv[2]]);"""
 with tempfile.TemporaryDirectory() as folder:
  script=Path(folder)/'shift.php';script.write_text(code);subprocess.run([php,str(script),str(site),uid,str(ms)],check=True)
shift(120000)
room=owner.api('/room')['room'];assert 120000<=room['activeMs']<123000,room
self_member=next(x for x in room['members'] if x['isSelf']);assert self_member['background'] and self_member['studying']
rank=owner.api('/ranking')['groups'];assert next(x for x in rank if x['id']==gid)['totalMs']>=120000
assert gid not in [x['id'] for x in outsider.api('/ranking')['groups']]
forged=owner.api(path+'/heartbeat',dict(beat,activeMs=999999999999,background=True,mode='background'))
assert next(x for x in forged['members'] if x['isSelf'])['activeMs']<124000
shift(1200000)
room=owner.api('/room')['room'];assert 899000<=room['activeMs']<904000,room['activeMs']
resumed=owner.api(path+'/resume',{'visitId':visit});assert resumed['visitId']==visit and 899000<=resumed['activeMs']<904000
assert owner.api('/room')['room'] is None
assert not next(x for x in resumed['members'] if x['isSelf'])['studying']
before=max(int(x['activeMs']) for x in resumed['history'] if x['visitId']==visit)
time.sleep(.05);after=owner.api(path);assert max(int(x['activeMs']) for x in after['history'] if x['visitId']==visit)==before
owner.api(path+'/settings',{'name':'نام تازهٔ گروه','backgroundContinue':False,'backgroundMinutes':30})
snapshot=member.api(path);assert snapshot['group']['name']=='نام تازهٔ گروه' and not snapshot['group']['backgroundContinue']
assert all(not x['online'] for x in snapshot['members'])
owner.api(path+'/delete',{});member.api(path,expected=404);owner.api('/groups/join',{'code':group['code']},expected=404)
assert gid not in [x['id'] for x in owner.api('/ranking')['groups']]
assert gid in [x['id'] for x in owner.api('/groups')['deletedGroups']]
owner.api(path+'/restore',{});assert any(x['visitId']==visit and int(x['activeMs'])==before for x in owner.api(path)['history'])
owner.api(path+'/members/'+mid+'/kick',{});member.api(path,expected=403)
print('PASS manager-only timer/settings/delete/restore/kick; offline server lease, non-renewing hidden heartbeat, cap, paused recovery, private group ranking and persistent history')
