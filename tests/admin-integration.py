"""Admin HTTP and in-place upgrade checks against the same disposable test database."""
import os,json,re,time,urllib.parse,importlib.util,sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('suite',Path(__file__).with_name('integration.py'));suite=importlib.util.module_from_spec(spec);spec.loader.exec_module(suite)
Client=suite.Client
class AdminClient(Client):
 def admin(self,path,data=None,expected=200,token=True):
  route,_,query=path.partition('?');status,body=self.request('/admin-api.php?route='+urllib.parse.quote(route)+('&'+query if query else ''),data,token,True);assert status==expected,(path,status,body[:500]);return json.loads(body)
 def login(self,email,password):
  token=self.form_token('/login.php');status,body=self.request('/login.php',{'_csrf':token,'email':email,'password':password});assert status==200 and 'window.MIZ=' in body,(status,body[:500]);return self.bootstrap()['user']['id']
admin=AdminClient();aid=admin.login('admin@example.test','AdminPassword123!')
member=AdminClient();mid=member.login('member@example.test','ValidPassword123!')
visitor=AdminClient();visitor.admin('/overview',expected=401);member.admin('/overview',expected=403);assert member.request('/admin.php')[0]==403
assert 'مرکز مدیریت' in admin.request('/admin.php')[1]
for path in ['/overview','/users','/groups','/audit','/settings','/health']:assert admin.admin(path)
admin.admin('/settings',{'site_name':'میز','announcement':'','registration_open':True,'group_creation_open':True},expected=419,token=False)
admin.admin('/users/'+mid,{'action':'suspend'});member.api('/state',expected=401)
assert not admin.admin('/users/'+mid)['user']['disabled']==0
admin.admin('/users/'+mid,{'action':'activate'});member.login('member@example.test','ValidPassword123!')
admin.admin('/users/'+mid,{'action':'promote'});member.login('member@example.test','ValidPassword123!');assert member.admin('/health')['adminCount']>=2
admin.admin('/users/'+mid,{'action':'demote'});member.admin('/overview',expected=401);member.login('member@example.test','ValidPassword123!');member.admin('/overview',expected=403)
admin.admin('/users/'+aid,{'action':'suspend'},expected=422);admin.admin('/users/'+aid,{'action':'demote'},expected=422)
admin.admin('/users/'+mid,{'action':'signout'});member.api('/state',expected=401);member.login('member@example.test','ValidPassword123!')
settings={'site_name':'میز آزمایشی','announcement':'اطلاعیه <script>آزمایش</script>','registration_open':False,'group_creation_open':False};admin.admin('/settings',settings)
new=AdminClient();token=new.form_token('/register.php');status,body=new.request('/register.php',{'_csrf':token,'name':'آزمایش تازه','email':'blocked@example.test','password':'ValidPassword123!','password_repeat':'ValidPassword123!'});assert 'ثبت‌نام تازه موقتاً بسته' in body
member.api('/groups',{'name':'گروه بسته'},expected=403)
body=admin.request('/')[1];assert '&lt;script&gt;' in body and '<script>آزمایش</script>' not in body
admin.admin('/settings',dict(settings,registration_open=True,group_creation_open=True,announcement=''))
group=member.api('/groups',{'name':'اتاق کنترل مدیر'})['group'];gid=group['id'];member.api('/groups/'+gid+'/enter',{})
admin.admin('/groups/'+gid,{'action':'archive'});member.api('/groups/'+gid+'/enter',{},expected=403);assert admin.admin('/groups/'+gid)['group']['archived']
member.api('/groups/'+gid+'/restore',{},expected=409);member.api('/groups/'+gid+'/delete',{},expected=403)
admin.admin('/groups/'+gid,{'action':'restore'});member.api('/groups/'+gid+'/enter',{})
admin.admin('/groups/'+gid,{'action':'edit','name':'نام تازه اتاق','cameraRequired':True});assert admin.admin('/groups/'+gid)['group']['cameraRequired']
admin.admin('/groups/'+gid,{'action':'kick','userId':mid},expected=422)
third=AdminClient();tid,_=third.signup('admin-test-peer@example.test','همراه تازه');third.api('/groups/join',{'code':group['code']});admin.admin('/groups/'+gid,{'action':'approve','userId':tid});third.api('/groups/'+gid+'/enter',{})
admin.admin('/groups/'+gid,{'action':'kick','userId':tid});third.api('/groups/'+gid+'/enter',{},expected=403)
assert admin.admin('/audit')['total']>=12
assert admin.admin('/users?q=member')['total']>=1
assert 'password_hash' not in json.dumps(admin.admin('/users'))
assert 'thoughts' not in json.dumps(admin.admin('/users/'+mid))
print('PASS admin authorization, CSRF, role and session revocation, suspension, protected self, settings enforcement, announcement escaping, room management and audit')

# Optional isolated UI snapshot for local review; never part of the source package.
if os.environ.get('MIZ_ADMIN_PREVIEW'):
 import pathlib
 preview=pathlib.Path(os.environ['MIZ_ADMIN_PREVIEW']);preview.mkdir(exist_ok=True)
 responses={path:admin.admin(path) for path in ['/overview','/users','/groups','/audit','/settings','/health','/users/'+mid,'/groups/'+gid]}
 for item in responses['/users']['items']:responses['/users/'+item['id']]=admin.admin('/users/'+item['id'])
 for item in responses['/groups']['items']:responses['/groups/'+item['id']]=admin.admin('/groups/'+item['id'])
 status,html=admin.request('/admin.php');html=re.sub(r'"csrf":"[^"]+"','"csrf":"preview"',html)
 html=html.replace('/admin.css?v=60','/__admin-qa/admin.css?v=60').replace('/admin.js?v=60','/__admin-qa/admin.js?v=60')
 mock='<script>const qaResponses='+json.dumps(responses,ensure_ascii=False)+';const nativeFetch=window.fetch.bind(window);window.fetch=async(input,options={})=>{const url=new URL(input,location.href);if(!url.pathname.endsWith("admin-api.php"))return nativeFetch(input,options);return new Response(JSON.stringify(options.method==="POST"?{saved:true}:qaResponses[url.searchParams.get("route")]),{status:200,headers:{"content-type":"application/json"}})};</script>'
 html=html.replace('<script type="module"',mock+'<script type="module"');(preview/'index.html').write_text(html)
