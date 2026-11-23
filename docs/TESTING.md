# Verification — interface release 7.1

This release changes presentation and form organization. The database schema remains 7.0. Current checks: 54 hosted Node tests and 39 portable Node tests passed; JavaScript syntax checks passed for the changed modules. Browser review uses disposable synthetic study/group records, never production-account mutations. Reviewed desktop and 390px group navigation, creation disclosure, subject confirmation, member visibility, daily/weekly tabs, quick navigation and manual focus start/stop. Additional checks: all 19 PHP files passed PHP 8.3 syntax validation; actual PHP authentication templates rendered for desktop/320px review. Main navigation and ranking reviewed at 320px, 390px and 768px; no horizontal document overflow was observed. CSS parsed successfully with PostCSS. The focused timer was corrected after an observed clipped subject and reviewed again.

The historical PHP/MySQL/SQLite runtime checks below belong to the 7.0 release. They describe the retained storage/upgrade behavior, not a new 7.1 database migration.

# Verification — root-layout release 7.0

Tested with PHP 8.3.6 without mbstring, SQLite through pdo_sqlite, and MariaDB 10.11 through pdo_mysql. The production package requires PHP 8.2+ and one of these PDO drivers.

Use a disposable copy and disposable database only. Start `php -S 127.0.0.1:8899 -t . router.php` from the extracted root. Run `tests/integration.py` with MIZ_TEST_URL and MIZ_TEST_ORIGIN set to http://127.0.0.1:8899. Choose MIZ_TEST_DRIVER=sqlite or mysql. For MySQL set MIZ_TEST_DB_HOST, MIZ_TEST_DB_PORT, MIZ_TEST_DB_NAME, MIZ_TEST_DB_USER and MIZ_TEST_DB_PASSWORD; the installer must have access to create that disposable database.

The suite installs the app and tests root routing, an enabled install button, protection of private paths, static assets, installer CSRF/lock, registration, profile/session isolation, CSRF/origin rejection, persistence/idempotency, membership approval and owner-only moderation, bounded room time, stale-visit handling, login, one-use recovery, session invalidation and POST-only logout.

Run `node --test tests/*.test.js` for the 39 browser-accounting/data/queue tests. Node is only needed for these tests, not for production.

Additional release checks passed: root URLs with a legacy /public base_url, failed prerequisites without disabling the install button (no PDO, read-only storage), and PHP syntax checks for every PHP entry and module. Login/registration layouts were checked at desktop and 375px widths. The password visibility control was checked in the browser.

Apache .htaccess and Nginx examples are supplied; private-path runtime tests used the bundled PHP development router. Verify the corresponding rules on the target host before public use. No independent penetration test is claimed.

4.1: Added 8 cases for camera fallback, preserving the time handover gap, and legacy invalid dates. An isolated browser fixture verified group entry, missing-camera start, manual timer, pause, finish and returning to the same room with zero leave requests. Fixture data and camera mocks are not published.

4.2 verification: 44 hosted Node tests and 36 portable Node tests passed. PHP syntax passed for all 14 PHP files. Real HTTP integration passed for SQLite and MySQL/MariaDB: root installation, auth/CSRF/isolation, persistent history, final time on departure, required-camera rejection and manual recording in optional rooms. Disposable legacy schemas were upgraded twice, preserving accounts; old /public config remained on root URLs.

Camera behavior and responsive room controls were exercised using an isolated local UI fixture; no fixture, mock identity, account password, installed config, database, or runtime log is distributed. Camera-disabled hardware was simulated; no real hardware/cross-browser camera certification is claimed.

5.0: Full HTTP admin checks for 401/403, CSRF, role elevation/revocation, session invalidation, suspension, self protection, registration/group creation switches, escaped announcements, archive/restore, room policy, moderation and audit. Fresh install and direct source replacement over an installed 4.2 database were exercised on SQLite and MySQL/MariaDB. Configuration bytes were preserved, additive migration repeated safely, and prior accounts/study session counts remained. Browser layout review uses a disposable snapshot of test data; no production administrator is impersonated.


6.0: 48 hosted and 39 portable Node tests cover hidden-page continuation, wall-clock sleep, fixed caps, pause, owner-only management, recovery and private group rankings in addition to earlier cases. Real PHP HTTP checks cover foreground-to-offline server leases, ignored forged counters, a non-renewing hidden heartbeat, cap expiry, paused recovery, owner-only rename/delete/restore/kick, preserved history and ranking privacy. MySQL mode columns are widened during upgrade (background is longer than the previous mode width). Direct source replacement was exercised over installed 4.2 and 5.0 databases, with existing config bytes and account/session counts preserved. Fresh installs were also tested with SQLite and MySQL/MariaDB.

Run tests/policy-integration.py after the account/admin suites on a DISPOSABLE installed copy. Set MIZ_TEST_SITE to that copy's absolute path and MIZ_TEST_PHP to the PHP executable; these enable controlled lease timestamp shifts without changing the system clock. Never target a production database. The policy suite uses the test accounts from integration.py.

Browser review used an isolated API fixture: manager name and policy save, 375px settings sheet, recoverable deletion/restore and ranking tabs. A manual timer kept counting while a second tab was used and saved the interval on return. Device power-off is covered by server timestamp simulations, not a claim that JavaScript runs on powered-off hardware. Test fixtures are removed before publication.


6.1: Real HTTP tests reproduce 6.0 upgrade failure with MySQL auxiliary tables using utf8mb4_general_ci and core tables using utf8mb4_unicode_ci (driver error 1267). Replacing source with 6.1 repairs that same installed database. Exact user, subject, session, group, membership, history and non-version setting rows, and config bytes are compared before/after. Tests also verify runtime with SELECT/INSERT/UPDATE/DELETE privileges only, a genuine migration permission failure returning UPG-PERMISSION without account names/SQL, safe retry after privileges are restored, inaccessible legacy file-lock fallback, repeated upgrade, and SQLite migration. Run tests/upgrade-recovery.py after the other HTTP suites with the same disposable MIZ_TEST_SITE/MIZ_TEST_PHP environment. MIZ_TEST_OLD_ZIP optionally points to the original 6.0 archive for the reproduction. No production host or production credentials are used.


7.0: 54 hosted Node tests include real D1 migrations, midnight/Saturday attribution, cumulative re-entry, private companion equivalence, forged/stale counters, simultaneous settlement, private rank exclusion, hidden personal workspace, report allowlists and token disable/rotation. PHP HTTP integration passes on SQLite and MariaDB with a shared-host utf8mb4_general_ci database default, for fresh installs and direct replacement over installed 6.1. Tests/progress-integration.py additionally launches concurrent PHP settlement workers and checks exactly one credit, profile privacy and revocation, daily persistence and matching primary/companion times. Every PHP file is syntax-checked. Portable accounting/data tests remain available through node --test tests/*.test.js.

Browser review uses disposable fixtures for two subjects, explicit confirmation and visible focus subject/daily/session clocks; daily/weekly rank tabs; companion selection; sharing options and public report display at desktop and 375px width. Fixtures, test identities, installed config, databases and logs are excluded from publication. There is no claim of certified fraud detection: presence/manual study still follow the selected room policy; these changes prevent repeated credit for the same recorded interval.
