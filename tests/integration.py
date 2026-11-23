#!/usr/bin/env python3
"""Run against a disposable, uninstalled checkout and a disposable MySQL database.
No external dependencies. Environment: MIZ_TEST_URL, MIZ_TEST_DB_HOST, _PORT,
_NAME, _USER, _PASSWORD. The installer will create tables in that database.
"""
import os,json,re,html,urllib.request,urllib.parse,http.cookiejar,time
BASE=os.environ.get('MIZ_TEST_URL','http://127.0.0.1:8899').rstrip('/')
ORIGIN=os.environ.get('MIZ_TEST_ORIGIN','http://terminal.local:4173')
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token=None
 def request(self,path,data=None,token=True,json_body=False,origin=ORIGIN):
  headers={};raw=None
  if data is not None:
   if json_body:
    raw=json.dumps(data).encode();headers['Content-Type']='application/json'
    if token and self.token:headers['X-CSRF-Token']=self.token
   else:raw=urllib.parse.urlencode(data).encode()
   headers['Origin']=origin
  try:r=self.opener.open(urllib.request.Request(BASE+path,data=raw,headers=headers),timeout=20)
  except urllib.error.HTTPError as e:r=e
  body=r.read().decode(errors='replace');return r.status,body
 def form_token(self,path):
  status,body=self.request(path);assert status==200,(status,body[:300]);return html.unescape(re.search(r'name="_csrf" value="([^"]+)"',body)[1])
 def bootstrap(self):
  status,body=self.request('/');assert status==200,(status,body[:200]);data=json.loads(re.search(r'window.MIZ=(.*?);</script>',body)[1]);self.token=data['csrf'];return data
 def api(self,path,data=None,expected=200,token=True,origin=ORIGIN):
  status,body=self.request('/api.php?route='+urllib.parse.quote(path),data,token,True,origin);assert status==expected,(path,status,expected,body[:600]);return json.loads(body)
 def signup(self,email,name):
  token=self.form_token('/register.php');status,body=self.request('/register.php',{'_csrf':token,'name':name,'email':email,'password':'ValidPassword123!','password_repeat':'ValidPassword123!'});assert status==200 and 'حساب تو آماده است' in body,(status,body[:600]);code=re.search(r'<code class="recovery-code">([^<]+)</code>',body)[1];data=self.bootstrap();return data['user']['id'],code

def run():
 visitor=Client();visitor.api('/state',expected=503)
 # Root URLs and install controls must work without JavaScript.
 status,root_body=visitor.request('/');assert status==200 and 'id="installButton"' in root_body
 button=re.search(r'<button[^>]*id="installButton"[^>]*>',root_body)[0];assert 'disabled' not in button
 assert 'value="'+ORIGIN+'"' in root_body
 for path in ['/storage/.htaccess','/storage/config.php','/storage/miz.sqlite','/app/bootstrap.php','/database/schema.sql','/tests/integration.py','/.gitignore']:
  assert visitor.request(path)[0] in (403,404),path
 for path in ['/account-design.css','/auth-ui.js','/fonts/Vazirmatn-Regular.woff2']:
  assert visitor.request(path)[0]==200,path
 print('PASS root installer, enabled install button, assets and private path protection')
 token=visitor.form_token('/install.php')
 fields={'driver':os.environ.get('MIZ_TEST_DRIVER','mysql'),'_csrf':token,'db_host':os.environ.get('MIZ_TEST_DB_HOST','127.0.0.1'),'db_port':os.environ.get('MIZ_TEST_DB_PORT','3307'),'db_name':os.environ.get('MIZ_TEST_DB_NAME','miz_integration'),'db_user':os.environ.get('MIZ_TEST_DB_USER','root'),'db_password':os.environ.get('MIZ_TEST_DB_PASSWORD',''),'prefix':'miz_','base_url':ORIGIN,'name':'مدیر میز','email':'admin@example.test','password':'AdminPassword123!','password_repeat':'AdminPassword123!','create_database':'1'}
 # Installer CSRF and initial successful installation.
 bad=dict(fields,_csrf='wrong');status,_=visitor.request('/install.php',bad);assert status==200
 wrong_path=dict(fields,base_url=ORIGIN+'/public');status,body=visitor.request('/install.php',wrong_path);assert 'برای نصب روت فقط دامنه' in body
 status,body=visitor.request('/install.php',fields);assert status==200 and 'نصب کامل شد' in body,(status,body[-1400:]);assert '<code class="recovery-code">' in body
 status,_=visitor.request('/install.php');assert status==403
 print('PASS installer creates schema and account, then locks itself')
 owner=Client();owner_id,owner_recovery=owner.signup('owner@example.test','رضا');member=Client();member_id,_=member.signup('member@example.test','سارا');other=Client();other_id,_=other.signup('other@example.test','مینا')
 assert owner.api('/me')['userId']==owner_id
 assert owner.bootstrap()['base']==''
 assert other.api('/ranking')['members']==[]
 status,body=owner.request('/login.php');assert status==200 and 'window.MIZ=' in body
 status,body=owner.request('/register.php');assert status==200 and 'window.MIZ=' in body
 owner.api('/profile',{'name':'رضا تازه'})
 assert owner.api('/me')['profile']['name']=='رضا تازه'
 owner.api('/state',{'changes':[]},expected=419,token=False)
 owner.api('/state',{'changes':[]},expected=403,origin='https://attacker.invalid')
 print('PASS registration, profile, sessions and CSRF/origin protections')
 start=1793448000000
 record={'id':'session-1','subjectId':'physics','subjectName':'فیزیک','color':'#bde875','start':start,'end':start+120000,'activeMs':90000,'elapsedMs':120000,'segments':[{'from':start,'to':start+90000,'type':'present'},{'from':start+90000,'to':start+120000,'type':'away'}],'thoughts':[{'text':'بعد از مطالعه پیام بدهم.','createdAt':start+10000}]}
 changes=[{'type':'subject_upsert','value':{'id':'physics','name':'فیزیک','color':'#bde875'}},{'type':'goal','value':180},{'type':'session_upsert','value':record}]
 owner.api('/state',{'changes':changes});owner.api('/state',{'changes':changes})
 state=owner.api('/state')['state'];assert len(state['subjects'])==1 and len(state['sessions'])==1 and state['goal']==180;assert state['sessions'][0]['thoughts'][0]['text']==record['thoughts'][0]['text'];assert other.api('/state')['state']['sessions']==[]
 owner.api('/state',{'changes':[{'type':'subject_delete','value':'physics'}]});assert owner.api('/state')['state']['subjects']==[];assert len(owner.api('/state')['state']['sessions'])==1
 owner.api('/state',{'changes':[{'type':'subject_upsert','value':{'id':'bad','name':'bad','color':'url(evil)'}}]},expected=422)
 owner.api('/state',{'changes':[{'type':'session_upsert','value':dict(record,id='bad-session',activeMs=120001)}]},expected=422)
 print('PASS database record persistence, private thoughts, idempotency, subject deletion and isolation')
 group=owner.api('/groups',{'name':'گروه مطالعه'})['group'];gid=group['id'];code=group['code'];base='/groups/'+gid
 member.api('/groups/join',{'code':code});member.api(base+'/enter',{},expected=403);other.api(base,expected=403)
 member.api(base+'/members/'+member_id+'/decision',{'decision':'approve'},expected=403)
 snap=owner.api(base+'/members/'+member_id+'/decision',{'decision':'approve'});assert not snap['requests']
 entered=member.api(base+'/enter',{});visit=entered['visitId'];assert next(m for m in entered['members'] if m['isSelf'])['activeMs']==0
 snap=member.api(base+'/heartbeat',{'visitId':visit,'activeMs':999999999,'studying':True});value=next(m for m in snap['members'] if m['isSelf'])['activeMs'];assert value<5000
 member.api(base+'/leave',{'visitId':visit});entered=member.api(base+'/enter',{});new_visit=entered['visitId'];assert new_visit!=visit;assert next(m for m in entered['members'] if m['isSelf'])['activeMs']==0
 member.api(base+'/leave',{'visitId':visit});member.api(base+'/heartbeat',{'visitId':new_visit,'activeMs':0,'studying':False})
 member.api(base+'/heartbeat',{'visitId':visit,'activeMs':10,'studying':True},expected=409)
 owner.api(base+'/members/'+member_id+'/kick',{});member.api(base,expected=403);member.api(base+'/heartbeat',{'visitId':new_visit,'activeMs':10,'studying':True},expected=403)
 member.api('/groups/join',{'code':code});owner.api(base+'/members/'+member_id+'/decision',{'decision':'reject'});member.api(base+'/enter',{},expected=403)
 owner.api(base+'/members/'+owner_id+'/kick',{},expected=422)
 print('PASS group approval, rejection, kick, server time limits and stale-visit reset')
 # Both approved participants can read their own and the other's current time.
 member.api('/groups/join',{'code':code});owner.api(base+'/members/'+member_id+'/decision',{'decision':'approve'})
 own_visit=owner.api(base+'/enter',{})['visitId'];member_visit=member.api(base+'/enter',{})['visitId']
 time.sleep(1.1)
 owner.api(base+'/heartbeat',{'visitId':own_visit,'activeMs':800,'studying':True})
 member.api(base+'/heartbeat',{'visitId':member_visit,'activeMs':1000,'studying':True})
 for client,self_id in ((owner,owner_id),(member,member_id)):
  snapshot=client.api(base);present={m['userId']:m for m in snapshot['members'] if m['online']}
  assert set(present)=={owner_id,member_id};assert present[owner_id]['activeMs']==800;assert present[member_id]['activeMs']==1000
  assert present[self_id]['isSelf'] and all(m['studying'] for m in present.values());assert len([m for m in present.values() if m['isSelf']])==1
 member.api(base+'/leave',{'visitId':member_visit});assert not next(m for m in owner.api(base)['members'] if m['userId']==member_id)['online']
 fresh_visit=member.api(base+'/enter',{})['visitId'];assert next(m for m in owner.api(base)['members'] if m['userId']==member_id)['activeMs']==0
 assert len(owner.api(base)['history'])>=2
 assert next(m for m in owner.api(base)['members'] if m['userId']==member_id)['totalMs']>=1000
 required=owner.api('/groups',{'name':'اتاق دوربینی','cameraRequired':True})['group'];rb='/groups/'+required['id'];rv=owner.api(rb+'/enter',{})['visitId']
 time.sleep(.7)
 owner.api(rb+'/heartbeat',{'visitId':rv,'activeMs':500,'studying':True,'mode':'manual'},expected=422)
 camera=owner.api(rb+'/heartbeat',{'visitId':rv,'activeMs':500,'studying':True,'mode':'camera'});assert camera['history'][0]['mode']=='camera'
 time.sleep(.12)
 owner.api(rb+'/leave',{'visitId':rv,'activeMs':600,'studying':False,'mode':'camera'});assert int(owner.api(rb)['history'][0]['activeMs'])==600
 print('PASS persistent history, final time on leave and camera policy')
 print('PASS both participants see self and peer study times, departure and zero-time re-entry')

 # Fresh login reads the same persisted records.
 fresh=Client();token=fresh.form_token('/login.php');status,body=fresh.request('/login.php',{'_csrf':token,'email':'owner@example.test','password':'wrong'});assert 'ایمیل یا رمز عبور درست نیست' in body
 token=fresh.form_token('/login.php');status,body=fresh.request('/login.php',{'_csrf':token,'email':'owner@example.test','password':'ValidPassword123!'});assert status==200 and 'window.MIZ=' in body,(status,body[:500]);fresh.bootstrap();assert len(fresh.api('/state')['state']['sessions'])==1
 recovery=Client();token=recovery.form_token('/recover.php');status,body=recovery.request('/recover.php',{'_csrf':token,'email':'owner@example.test','recovery':owner_recovery,'password':'ChangedPassword123!','password_repeat':'ChangedPassword123!'});assert 'رمز تغییر کرد' in body,(status,body[-500:]);owner.api('/state',expected=401);fresh.api('/state',expected=401)
 token=recovery.form_token('/recover.php');status,body=recovery.request('/recover.php',{'_csrf':token,'email':'owner@example.test','recovery':owner_recovery,'password':'ChangedPassword456!','password_repeat':'ChangedPassword456!'});assert 'ایمیل یا کد بازیابی درست نیست' in body
 token=recovery.form_token('/login.php');recovery.request('/login.php',{'_csrf':token,'email':'owner@example.test','password':'ChangedPassword123!'});recovery.bootstrap();assert len(recovery.api('/state')['state']['sessions'])==1
 print('PASS login, one-use recovery codes and invalidation of previous sessions')
 status,_=recovery.request('/logout.php');assert status==405
 token=recovery.token;recovery.request('/logout.php',{'_csrf':token});recovery.api('/state',expected=401)
 print('PASS POST-only logout and private API access')
 print('ALL PHP + '+os.environ.get('MIZ_TEST_DRIVER','mysql').upper()+' INTEGRATION CHECKS PASSED')
if __name__=='__main__':run()
