<?php
declare(strict_types=1);require __DIR__.'/app/bootstrap.php';if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);exit;}try{verify_csrf($_POST['_csrf']??null);if($u=user())query('DELETE FROM '.table('room_presence').' WHERE user_id=?',[$u['id']]);logout_user();redirect('login.php');}catch(ApiError $e){http_response_code($e->status);echo e($e->getMessage());}
