# 7.1 — interface refactor

- Preserve the established #14121c dark background, #ffad92 coral action and #bfa4ff lilac detail palette.
- Replace the two-row header with a desktop navigation rail, compact app bar and mobile bottom navigation. Add keyboard-friendly quick navigation with Ctrl/Cmd+K and native dialog focus handling.
- Make room cards, states and actions consistent. Progressively disclose group creation, joining and advanced camera/background options, preserving form names and policy defaults.
- Rebuild focus timer sizing so the subject, daily total and current session remain visible on narrow screens. Keep manual and camera modes functional.
- Unify report filters, rankings, sharing controls, public profile, PHP authentication and administration typography, spacing, borders, depth and motion. Respect reduced-motion preferences.
- Improve ranking loading/error/retry states and immediate selected-period feedback.
- No database schema changes after 7.0. Full ZIP overlays the existing root while retaining storage/config.php, database and installed accounts.

# 7.0

- Single durable credit ledger shared by daily/weekly rankings, private companion rooms and opt-in public reports. Compare-and-set settlement (D1) / transactional row locks (PHP) prevent duplicate credit under concurrent polling.
- Split new credits at Tehran midnight and Saturday boundaries; preserve same-day/week legacy totals without inventing the distribution of multi-day old visits.
- Private groups are excluded from competitive ranks; one eligible private companion can mirror the primary presence and follows the primary policy. Detach after kick, settings/deletion/archive changes.
- Internal personal workspace records signed-in standalone study through the same single presence; it is hidden from community listings and ranks.
- Prominent subject selector, explicit per-session confirmation, persistent subject name, daily cumulative focus timer and separate session timer.
- Revocable/rotatable 256-bit public report links with server-enforced field allowlist, configurable alias and 7/30/90-day history. Never expose account email, thoughts, camera data or group names.
- Reject stale time updates; never move background settlement cursors backwards; remove per-heartbeat extra time allowance.
- Automatic additive schema 7.0 migration retains 6.1 configuration and records; earlier collation recovery remains included.

# 6.1 — upgrade recovery

- Explicit utf8mb4_unicode_ci for auxiliary MySQL tables; normalize existing auxiliary table collations before history comparisons or Persian settings writes.
- Read the completed schema marker before issuing DDL, recheck under the upgrade lock, and stop repeating room schema work on normal API requests.
- Reuse readable lock files and fall back to MySQL advisory locks when filesystem locks are inaccessible.
- Safe, specific failure codes and correlation IDs; private logs contain stage/SQLSTATE/driver code without credentials or SQL values.
- Reproduced 6.0 SQL error 1267 with a shared-host default collation, then verified recovery over the same database with all account/study/group/history/settings records retained.

# 6.0

- Owner-controlled background/offline elapsed-time policy with a 15/30/60/120-minute server lease; disabled by default for existing groups.
- Server-owned time in continuing rooms; hidden heartbeats cannot renew the lease, fabricated client counters are ignored, pause/end/kick/deletion stop it.
- Paused recovery of a prior visit on returning; wall-clock-aware foreground display and capped interrupted-draft recovery.
- Group-owner rename/settings, recoverable deletion and restore; existing owner-only kick retained.
- Group ranking uses persistent room history and approved membership; deleted/archived groups are excluded.
- PHP schema 6 upgrades existing 4.2/5.0 installations in place; widens MySQL mode fields for the background label without truncation.

# 5.0

- Protected PHP admin dashboard: overview, users, rooms, audit, site settings and health.
- Additive automatic upgrade on an installed 4.2 database; retain config, user accounts, sessions and study records.
- Role changes, account suspension and forced signout invalidate prior sessions; recheck actor authorization inside the mutation transaction.
- Admin audit of changes; reversible room archive; no private thought content in admin endpoints.
- Current-page CSV export with formula neutralization; search, pagination and detail dialogs.
- Tactile cards, layered surfaces, subtle patterns and reduced-motion-aware page transitions across the public workspace and PHP account screens.

# 4.2

- Persist room visit history and per-member totals across departure, reconnect and moderation.
- Creator selects optional or required camera policy; enforce the selected recording mode in the API.
- Show study/rest status, visit time and cumulative time in a collapsible companion rail.
- Nonmodal focus companion panel keeps timer, pause and stop controls available.
- Flush final counters on normal departure; cap accepted time by visit wall time, including repeated packets.
- Automatic, idempotent MySQL/SQLite schema upgrade without clearing existing accounts or study records.
- Versioned frontend assets and flat-root PHP source package.

# 4.1

- Dedicated group list and room pages without promotional banners.
- Camera-unavailable/denied/busy startup falls back to manual study without leaving the room.
- Camera interruption preserves the clock and pauses manual continuation until resume.
- Legacy invalid session dates cannot prevent workspace initialization.
- Added camera/time-handover and invalid-date regression tests; browser flow confirmed no room leave.

# 4.0

- Flattened web entrypoints and assets into the deployment root; removed /public redirects.
- Derive URL mount path from the entry script, including when upgrading legacy config.
- Install action remains available when prerequisites fail; display actionable errors.
- Select an available PDO driver by default; mbstring is optional through UTF-8 PCRE validation.
- Root deployment protection for private directories in Apache, Nginx and the PHP dev router.
- Typed PDO parameters and early SQLite write locking; global per-email login/recovery throttling alongside per-IP limits.
- Redesigned accessible login, signup, recovery and installer screens, password visibility, password-match validation, autofill support and responsive layouts.
- End-to-end PHP tests passed with SQLite and PDO MySQL/MariaDB, including installation and account/group/security paths.
