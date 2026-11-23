"""Disposable upgrade recovery tests; run after the account/admin/policy suites.
Requires MIZ_TEST_SITE and MIZ_TEST_PHP. Optional MIZ_TEST_OLD_ZIP reproduces 6.0.
Never run against a production installation.
"""
import os,sys,json,tempfile,subprocess,shutil,zipfile,importlib.util
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('integration.py'));base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
site=Path(os.environ['MIZ_TEST_SITE']);php=os.environ['MIZ_TEST_PHP'];source=Path(__file__).resolve().parents[1]
def cli(code):
 with tempfile.TemporaryDirectory() as folder:
  script=Path(folder)/'check.php';script.write_text("<?php require $argv[1].'/app/bootstrap.php';"+code)
  result=subprocess.run([php,str(script),str(site)],capture_output=True,text=True)
  assert result.returncode==0,(result.stdout,result.stderr)
  return result.stdout
snapshot_code="""$result=[];foreach(['users','subjects','study_sessions','study_groups','group_members','room_history'] as $name)$result[$name]=rows('SELECT * FROM '.table($name).' ORDER BY 1,2');$result['settings']=rows('SELECT * FROM '.table('site_settings')." WHERE setting_key<>'_schema_version' ORDER BY setting_key");echo json_encode($result);"""
before=json.loads(cli(snapshot_code));config=site/'storage/config.php';original=config.read_bytes();client=base.Client()
if os.environ.get('MIZ_TEST_DRIVER')=='mysql':
 cli("foreach(['room_history','site_settings','admin_audit'] as $name)query('ALTER TABLE '.table($name).' CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');query('UPDATE '.table('site_settings').\" SET setting_value='5' WHERE setting_key='_schema_version'\");")
 if os.environ.get('MIZ_TEST_OLD_ZIP'):
  with zipfile.ZipFile(os.environ['MIZ_TEST_OLD_ZIP']) as old:old.extractall(site)
  status,body=client.request('/');assert status==503 and 'ارتقای دیتابیس کامل نشد' in body,(status,body)
  assert config.read_bytes()==original
  shutil.copytree(source,site,dirs_exist_ok=True)
 status,body=client.request('/');assert status==200,(status,body)
 assert config.read_bytes()==original and json.loads(cli(snapshot_code))==before
 print('PASS mixed-collation / interrupted 6.0 upgrade repaired by the source replacement with configuration and all existing records preserved')
 # A completed upgrade must not require CREATE/ALTER on each page or group poll.
 cli("$c=config();$name=$c['db']['name'];$secret=bin2hex(random_bytes(16));query(\"CREATE USER 'miz_runtime'@'127.0.0.1' IDENTIFIED BY '\".$secret.\"'\");query(\"GRANT SELECT,INSERT,UPDATE,DELETE ON `\".$name.\"`.* TO 'miz_runtime'@'127.0.0.1'\");$c['db']['user']='miz_runtime';$c['db']['password']=$secret;file_put_contents(MIZ_STORAGE.'/config.php','<?php return '.var_export($c,true).';');")
 try:
  token=client.form_token('/login.php');status,body=client.request('/login.php',{'_csrf':token,'email':'admin@example.test','password':'AdminPassword123!'});assert status==200
  client.bootstrap();assert client.api('/groups')['groups'];assert 'groups' in client.api('/ranking')
  cli("query('UPDATE '.table('site_settings').\" SET setting_value='5' WHERE setting_key='_schema_version'\");")
  status,body=client.request('/');assert status==503 and 'UPG-PERMISSION' in body and 'miz_runtime' not in body,(status,body)
 finally:config.write_bytes(original)
 status,body=client.request('/');assert status==200,(status,body)
 print('PASS normal runtime without schema privileges; genuine missing migration privilege returns a safe specific diagnostic and resumes after restoration')
 # Force the MySQL advisory-lock fallback for inaccessible legacy lock files.
 cli("query('UPDATE '.table('site_settings').\" SET setting_value='5' WHERE setting_key='_schema_version'\");")
 locks=[site/'storage/admin-upgrade.lock',site/'storage/room-upgrade.lock']
 try:
  for lock in locks:lock.chmod(0)
  status,body=client.request('/');assert status==200,(status,body)
 finally:
  for lock in locks:lock.chmod(0o600)
 print('PASS MySQL migration can recover from unwritable legacy filesystem locks')
else:
 cli("query('UPDATE '.table('site_settings').\" SET setting_value='5' WHERE setting_key='_schema_version'\");")
 status,body=client.request('/');assert status==200,(status,body)
assert json.loads(cli(snapshot_code))==before
assert config.read_bytes()==original
assert cli('echo migration_version();')=='7.0'
assert client.request('/')[0]==200 and json.loads(cli(snapshot_code))==before
print('PASS repeatable 7.0 upgrade preserves accounts, subjects, sessions, groups, memberships, history and settings')
