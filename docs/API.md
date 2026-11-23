# API نسخهٔ PHP

این API برای رابط همین سایت طراحی شده و با نشست PHP و کوکی همان دامنه کار می‌کند. ثبت‌نام و ورود از فرم‌های `register.php` و `login.php` انجام می‌شوند؛ توکن مستقل یا ورود ChatGPT نیاز نیست.

مسیر واقعی درخواست‌ها به این شکل است؛ نصب در زیرپوشه نیز پشتیبانی می‌شود:

```text
GET /api.php?route=%2Fstate
POST /api.php?route=%2Fgroups
```

برای همهٔ POSTها، بدنهٔ JSON و هدر `X-CSRF-Token` لازم است. توکن از `window.MIZ.csrf` در صفحهٔ واردشده می‌آید. برای `sendBeacon` می‌توان آن را با کلید `_csrf` در همان بدنه فرستاد. مبدأ درخواست باید با `base_url` نصب برابر باشد. شناسهٔ کاربر از نشست خوانده می‌شود، نه از بدنهٔ درخواست.

| روش | مسیر منطقی | بدنه / نتیجه |
| --- | --- | --- |
| GET | `/me` | وضعیت ورود، شناسه و نام کاربر |
| POST | `/profile` | `{ "name": "رضا" }`؛ تغییر نام نمایشی |
| GET | `/state` | درس‌ها، هدف و جلسه‌های حساب |
| POST | `/state` | `{ "changes": [...] }`؛ تغییرات مستقل رکوردها |
| GET | `/groups` | گروه‌های عضو/سازنده و درخواست‌های کاربر |
| POST | `/groups` | `{ "name": "همراهان مطالعه", "cameraRequired": false }`؛ ساخت گروه |
| POST | `/groups/join` | `{ "code": "..." }`؛ درخواست عضویت |
| GET | `/groups/{id}` | اعضا با activeMs و totalMs، حضور، history و درخواست‌ها با کنترل دسترسی |
| POST | `/groups/{id}/members/{userId}/decision` | `{ "decision": "approve" }` یا `reject`؛ فقط سازنده |
| POST | `/groups/{id}/members/{userId}/kick` | `{}`؛ اخراج توسط سازنده |
| POST | `/groups/{id}/enter` | `{}`؛ شروع بازدید تازه با `visitId` و زمان صفر |
| POST | `/groups/{id}/heartbeat` | `{ "visitId": "...", "activeMs": 1000, "studying": true, "mode": "manual" }` |
| POST | `/groups/{id}/leave` | `{ "visitId": "...", "activeMs": 1000, "studying": false, "mode": "manual" }`؛ ذخیرهٔ مقدار نهایی و پایان همان حضور |

تغییرات `/state` از نوع `subject_upsert`، `subject_delete`، `goal` و `session_upsert` هستند. هر تغییر یک `type` و `value` دارد. نمونه:

```json
{
  "changes": [
    {"type":"subject_upsert","value":{"id":"physics","name":"فیزیک","color":"#bde875","position":0}},
    {"type":"goal","value":120}
  ]
}
```

جلسه شامل شناسهٔ یکتا، مشخصات درس، `start`/`end` به میلی‌ثانیه، `activeMs`، `elapsedMs`، بازه‌های `segments` و افکار `thoughts` است. نمونهٔ کامل در `tests/integration.py` موجود است. سرور ترتیب و مجموع بازه‌ها و طول داده را اعتبارسنجی می‌کند. حذف درس، جلسه‌های قبلی را حذف نمی‌کند.

خطاها JSON با کلید `error` هستند. کدهای اصلی: `401` ورود لازم، `403` دسترسی یا مبدأ نامجاز، `409` بازدید منقضی/قدیمی، `413` درخواست بزرگ، `419` CSRF نامعتبر، `422` دادهٔ نامعتبر، `429` محدودیت تلاش، `503` نصب‌نشده. سقف JSON دو مگابایت است. در حالت توقف بیرون صفحه، حضور گروه پس از ۴۵ ثانیه بی‌خبری معتبر نیست؛ بازهٔ heartbeat رابط کوتاه‌تر از این مقدار است.

`mode` یکی از `manual`، `camera` یا `background` است؛ مقدار آخر فقط با اجازهٔ مدیر معتبر است. اتاق دارای `cameraRequired=true` زمان دستی مثبت را با 422 رد می‌کند. در تاریخچه مقدار `mixed` هم برای حضوری که روش آن تغییر کرده ممکن است. تاریخچه در snapshot فقط برای اعضای تأییدشده و محدود به ۱۰۰ حضور اخیر بازگردانده می‌شود؛ مجموع عضو از کل سوابق اتاق محاسبه می‌شود.

## Admin API (PHP 6.0)

`admin-api.php?route=/overview`, `/users`, `/users/{id}`, `/groups`, `/groups/{id}`, `/audit`, `/settings`, `/health` accept GET only after an authenticated active admin check. Lists support page/q/status query parameters. POST uses the same CSRF token header as the account API. User actions: suspend, activate, promote, demote, signout. Group actions: archive, restore, delete (recoverable), edit, approve, reject, kick. Edit also accepts backgroundContinue (boolean) and backgroundMinutes (15/30/60/120). Settings POST accepts site_name, announcement and boolean registration_open/group_creation_open. User passwords, recovery hashes and private thoughts are not returned.


## Group policy (6.0)

POST `/groups` additionally accepts `backgroundContinue` (boolean, default false) and `backgroundMinutes` (15/30/60/120, default 60). Owner-only POST `/groups/{id}/settings` requires name and both policy fields; active visits end and history is kept. Owner-only POST `/groups/{id}/delete` soft-deletes, `/restore` restores. GET `/groups` adds owner-only `deletedGroups`.

With the policy enabled, heartbeat `activeMs` is ignored: the server settles the interval from run_from to min(serverNow, run_until). `studying:true` arms a lease; `background:true` preserves an existing deadline, while foreground study renews it. `studying:false` disarms it. GET `/room` returns a previous armed visit (including one that has reached its limit). POST `/groups/{id}/resume` with visitId settles it and pauses it, preserving the visit and history. Snapshot members add background/runUntil; group adds backgroundContinue/backgroundMinutes/deletedAt.

GET `/ranking` adds `groups` with id/name/totalMs/memberCount, ordered by cumulative room_history time. Only the caller's approved, undeleted, unarchived groups are returned. `members` remains the current-visit ranking. No camera video or private thoughts are shared.


## Progress, private companion and public sharing (7.0)

GET `/ranking` now adds `daily`, `weekly` and period metadata (Asia/Tehran, Saturday). Each person is aggregated once across approved shared competitive groups; private-only time is excluded. `groups` also excludes private groups; `members` remains an alias of daily for compatibility. GET `/progress` returns only the authenticated caller's canonical overall dailyMs/weeklyMs and period keys.

POST `/groups` accepts boolean isPrivate. The choice is immutable; personal workspaces cannot be joined through codes. POST `/groups/{primaryId}/companion` accepts current visitId and groupId (empty detaches). The target must be a distinct, approved, undeleted private group. Snapshot includes per-member dailyMs/weeklyMs and self overallDailyMs/overallWeeklyMs/companionId. Heartbeat accepts subjectName (up to 40 characters). GET group snapshots can show the same presence in the companion group; credit is never duplicated. POST `/personal/enter` creates/reuses a hidden personal workspace and replaces any prior primary visit.

GET/POST `/share-settings` require authentication and normal POST CSRF/origin protection. POST requires enabled/name/showDaily/showWeekly/showSubjects/showSessions/rangeDays; all show fields and enabled are booleans, rangeDays is 7/30/90. rotate=true replaces the token. GET `/public-profile/{64-character hex token}` is anonymous, no-store and noindex; disabled/unknown/old tokens return 404. The JSON only includes the chosen report sections and alias. Session output has start/end/activeMs without internal visit/user/group identifiers. Public reads can settle only that share owner's pre-authorized capped timer.
