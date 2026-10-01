# Project Audit Report

Status: COMPLETE (first-run audit, 2026-09-30)
Method: OBSERVE -> PLAN (no infra or app code modified; docs-only output)
Branch: `main` (tracking `origin/main`, working tree had pre-existing uncommitted agent-package changes — see § Repository)

## Executive summary

LoyRoy is a single-tenant loyalty-pass backend + Next.js admin panel with a **working, well-tested Apple Wallet flow** (signing, web service, APNs push) but **no multi-tenancy, no Google Wallet, and no provider abstraction**. The system of record is Supabase Postgres accessed service-role-only with no RLS/migrations. Deployment is defined by `render.yaml` (2 services) but live Render/Supabase state could not be inspected — no MCP/tool capability for either was available in this session. Environment naming diverges from `agent/ENVIRONMENT_SCHEMA.yaml` and must be reconciled deliberately before staging/production work.

No blocking runtime failure was found locally: `npm test` 8 suites / 47 tests pass, `npm run lint` clean on Node v26.8.1.

Recommended path: **REFACTOR toward spec** — keep Apple + domain logic, add org/tenant model + RLS + migrations, introduce `WalletService` provider boundary, then implement Google provider, then harden dashboard/auth and staging deploy. No clean rebuild or destructive reset justified by evidence.

## Repository

- Framework: Express `^5.2.1` (CommonJS), Next.js `16.3.5` admin panel (React 19.2.8, Tailwind 4, Firebase 12.19.0, html5-qrcode 2.3.8)
- Language: JavaScript (no TypeScript)
- Package manager: npm (`package-lock.json` present both at root and `dashboard/admin-panel/`)
- Runtime: `engines: node >=22 <27`; verified locally on Node v26.8.1 / npm 11.19.0
- Backend entry: `app.js` (`createApp({db, wallet, push, passTypeIdentifier})` factory — test-injectable; lazy DB proxy so boot works without credentials)
- Routes:
  - `routes/appApi.js` — Section A application API (create-pass, update-points, redeem, members search/detail/delete, register-device, push-update); all behind `serviceAuth`
  - `routes/appleWebService.js` — Section B Apple PassKit Web Service (`/apple/v1/...`), ApplePass auth, unauthenticated `/v1/log`
  - `routes/admin.js` — `/admin/upload-asset` (Supabase Storage), `/admin/diag-supabase` (presence/metadata probe only)
- Middleware: `serviceAuth.js` (Bearer SERVICE_API_KEY), `validate.js` (express-validator), `errorHandler.js`
- Database layer: `database/db.js` (lazy Supabase singleton), `members.js` (227 lines, server-side points math), `apple.js`, `devices.js`, `schema.sql`
- Services: `walletService.js` (Apple/passkit-generator wrapper), `pushService.js` (APNs via hapns, never-throw), `storageService.js` (Supabase Storage), `qrService.js`
- Dashboard: `dashboard/admin-panel/` (Next.js; `lib/backend.js` uses `BACKEND_URL` + `SERVICE_API_KEY`; `lib/firebase.js` uses `NEXT_PUBLIC_FIREBASE_*`; has own `.env.example`, `.env.local` (gitignored), `AGENTS.md` Next.js rules block)
- Tests: Jest `^30.5.1` + supertest; `tests/` 8 suites incl. `fakeSupabase.js`; `jest.testPathIgnorePatterns` excludes `/dashboard/`; **47/47 pass**
- Lint: eslint 10 (root) / eslint 9 + eslint-config-next (dashboard); `npm run lint` clean at root
- CI: `.github/` exists (not deep-inspected); recent log message notes "CI: run Node 22 to match engines"
- Render config: `render.yaml` — services `loyroy-api` (node, `npm install` / `node app.js`, health `/health`) + `loyroy-admin` (build/start via `cd dashboard/admin-panel`)
- Supabase config: `database/schema.sql` only; no migrations directory, no `supabase/` CLI config found
- Environment examples: `.env.example` and `env.example` are **byte-identical duplicates** — consolidate to one
- Pass template: `passes/vipMembership.pass/` (icon/logo/strip + `pass.json`)
- Certificates dir: `signerCert.pem` (2557 B), `signerKey.pem` (1981 B), `wwdr.pem` (1562 B), `AuthKey_JNLUR8WY7U.p8` (257 B) — sizes only, contents never read per `opencode.json` deny rules
- Scripts: `scripts/` — `check-env-names.py` (names-only scanner), `smoke.js`, `e2e-live.js`, `apns-probe.js`, `generate-sample-pass.js`, `db-roundtrip.js`
- Git history (last 15): active Apple/APNs work (`APNs: production-only pushes`, `PASS_FILE_ERROR`, `member deletion`, `Node 22`, `/etc/secrets` fallback, diag endpoints). Current branch `main`; `git status` shows pre-existing uncommitted changes: `M AGENTS.md`, `M routes/appleWebService.js`, `D API_SPEC.md PROJECT_PLAN.md RUNBOOK.md SECURITY.md TECH_STACK.md`, `?? agent/ diagnostics/ docs/ scripts/check-env-names.py README.md` — i.e. this agent package is not yet committed. No checkpoint tag was created in this audit (read-only session).

## Current architecture

Single-tenant Express API + Supabase (service-role) + Apple Wallet + Next.js admin calling the API with a shared service key. There is **no organizations/memberships/roles layer, no JWT/session auth on the backend, no RLS, no analytics-events or audit-log tables, and no Google provider**. `walletService.js` is Apple-specific and imported directly by routes — the spec-required `WalletService -> AppleWalletProvider / GoogleWalletProvider` boundary does not exist yet.

## Existing components to KEEP

- Express app factory + lazy-DB boot (`app.js`, `config.js` incl. `/etc/secrets` fallback)
- `serviceAuth` gate + input validation + structured error codes (`VALIDATION_ERROR`, `DB_ERROR`, `PASS_*`, `AUTH_CONFIG_ERROR`, etc.)
- Member/points/rewards data access (`database/members.js` — delta-only writes, ledger, idempotent-safe patterns)
- Apple pass generation/signing (`services/walletService.js` — pure `buildPassJson`, tier styles, QR payload, `PASS_CONFIG_ERROR` / `PASS_FILE_ERROR` / `PASS_KEY_ERROR` contract)
- Apple Web Service protocol implementation (`routes/appleWebService.js` — register/unregister/serials/fetch/log with correct status codes 200/201/204/304/401, timing-safe token compare)
- APNs sender (`services/pushService.js` — empty background push, production-by-default, dead-token pruning, never-throw `notifyPassUpdated`, server-side count-only logging)
- Supabase Storage wrapper (`services/storageService.js` — 5 MB cap, allowlist png/jpeg/webp, sanitized filenames)
- Diag endpoint design (`/admin/diag-supabase` reports host/paths/existence/byte-sizes/flags only — no secret values)
- Test suite shape (factory injection + `fakeSupabase.js`; 47 passing)

## Components to REFACTOR

- Database schema -> multi-tenant target (`agent/09-DATABASE-SCHEMA.md` wants organizations, memberships, customers, pass_templates, passes, wallet_installations, loyalty_transactions, analytics_events, audit_logs; today: tiers/members/points_ledger/visits/rewards/redemptions/devices/apple_* /pass_updates only)
- RLS + migration workflow (today: explicitly no RLS, single `schema.sql`, no migrations; per `agent/05-SUPABASE-SPEC.md` every tenant table needs an authz strategy)
- AuthN/Z (today: one shared `SERVICE_API_KEY` + ApplePass tokens; dashboard Firebase is client-only with no backend session verification; no roles/tenant isolation)
- `render.yaml` env list (names diverge from canonical schema; no staging service; dashboard `SERVICE_API_KEY` sync semantics unclear)
- Env examples (duplicate `.env.example` / `env.example`; stale `MONGODB_URI`/`DATABASE_URL`/`CLERK_*` entries vs. actual stack)
- Dashboard admin-panel (exists but single-tenant assumptions; needs org switcher, role gating, Apple+Google delivery UI per `agent/11-DASHBOARD-SPEC.md`)

## Components to REPLACE (greenfield behind new boundary)

- Wallet integration boundary: introduce provider-neutral `WalletService` (`create/update/archive/deliver/sync`) with `AppleWalletProvider` (extract current logic) + `GoogleWalletProvider` (new). Do not hard-code provider details in routes/dashboard.
- Google Wallet provider: no code, no env, no tests exist today.

## Components requiring further investigation (UNKNOWN, tool-limited)

- Live Supabase state (project, tables, RLS, auth, storage, functions) — no Supabase MCP/resource available (`list_mcp_resources` / `list_mcp_resource_templates` both empty); only `schema.sql` reviewed. `GET /admin/diag-supabase` is the approved non-disclosing probe once deployed.
- Live Render state (service health, deploys, logs, env presence, domains) — no Render capability available; only `render.yaml` blueprint reviewed.
- Apple credential validity (Team ID / Pass Type ID match to cert, passphrase, APNs key/team/topic, sandbox vs production) — files present (sizes above) but values never inspected per policy; needs non-disclosing signing + `scripts/apns-probe.js`/`generate-sample-pass.js` functional test with credentials loaded.
- Dashboard E2E against live backend (Firebase session -> backend auth mapping is designed but not implemented; Phase 8 item).

## Environment audit

Full matrix: `docs/ENVIRONMENT_MATRIX.md`. Canonical schema: `agent/ENVIRONMENT_SCHEMA.yaml`.

Key divergences (deliberate reconciliation required — do NOT create duplicates):
| Canonical | Actual code | Finding |
|---|---|---|
| `APP_URL` / `API_URL` | `PUBLIC_BASE_URL` (+ dashboard `BACKEND_URL`) | MISMATCH — rename mapping needed |
| `SUPABASE_ANON_KEY` | absent in backend; dashboard uses `NEXT_PUBLIC_FIREBASE_*` | MISMATCH — decide Supabase-auth vs Firebase-auth path |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_KEY` (`database/db.js`, `render.yaml`) | MISMATCH — canonical rename or alias |
| `APPLE_PASS_TYPE_ID` | `PASS_TYPE_IDENTIFIER` (`config.js`, `render.yaml`, Apple routes, APNs topic fallback) | MISMATCH |
| `APPLE_PRIVATE_KEY` | file-based `SIGNER_CERT_PATH`/`SIGNER_KEY_PATH`/`WWDR_PATH` + `SIGNER_KEY_PASSPHRASE` | ARCHITECTURE MISMATCH — cert-file model vs key-string model |
| `APPLE_KEY_ID` | no equivalent (`APNS_KEY_ID` is a different credential) | MISSING |
| `GOOGLE_WALLET_ISSUER_ID` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | none referenced anywhere | MISSING (expected — Google not implemented) |
| `JWT_SECRET` | `SERVICE_API_KEY` used instead | MISSING / different auth model |
| (extra) `SUPABASE_STORAGE_BUCKET`, `APNS_*`, `SIGNER_*`, `WWDR_PATH`, `SERVICE_API_KEY`, `DATABASE_URL`, `MONGODB_URI`, `CLERK_*`, `FIREBASE_*`, `BACKEND_URL`, `NEXT_PUBLIC_FIREBASE_*` | — | Implementation-specific; fold into schema deliberately |

Local `.env` file exists but was **not read** (policy + `opencode.json` deny). `scripts/check-env-names.py` enumerates 18 referenced names (see matrix doc). `.env.example` contains placeholders only — compliant. `.gitignore` correctly excludes `.env*`, `certificates/`, `*.pem/*.p8/*.p12/*.key` — compliant. No secret values appear in logs reviewed; diag endpoint is presence/metadata-only by design.

## Supabase audit

- `database/schema.sql` reviewed: tiers (5 seeded rows), members (uuid, tier FK, points_balance >= 0, pass_serial unique), points_ledger (append-only + balance_after), visits, rewards/redemptions, devices (member+token unique), apple_devices/apple_registrations (composite PK), pass_updates. Indexes on natural query paths. FKs + checks present.
- Deliberately **no RLS** (comment: all access via backend service key). Compliant with current single-tenant design; **non-compliant** with multi-tenant target — must add tenant FKs + RLS before any client-direct access.
- No migrations, no seed rollback, no analytics_events/audit_logs tables.
- Live project state: UNKNOWN (no tool access). Verification path: run `database/schema.sql` in fresh dev project, then `scripts/db-roundtrip.js` + `/admin/diag-supabase` (host + row count + error prefix only).

## Render audit

- Blueprint reviewed (`render.yaml`): `loyroy-api` + `loyroy-admin`, health `/health`, secret-file fallback to `/etc/secrets` implemented in `config.js`.
- `render.yaml` env names reflect actual code (`SUPABASE_SERVICE_KEY`, `PASS_TYPE_IDENTIFIER`, etc.), NOT canonical schema — reconcile before adding staging.
- No `Dockerfile`; no staging service defined; pipeline is local -> (staging missing) -> production.
- Live deployment state, logs, domains, env presence: UNKNOWN (no Render capability in this session). Verification path per `agent/06-RENDER-SPEC.md`: inspect service/branch/commands/health/env/deploys/logs, then health + smoke.

## Apple Wallet audit

- Pass Type / Team ID: expected via `PASS_TYPE_IDENTIFIER` + `APPLE_TEAM_ID`; must match signing cert (validity not tested in audit — needs non-disclosing signing test).
- Key approach: file-based cert trio + optional passphrase (`SIGNER_CERT_PATH`, `SIGNER_KEY_PATH`, `WWDR_PATH`, `SIGNER_KEY_PASSPHRASE`), Render secret-file fallback supported. APNs `.p8` at `certificates/AuthKey_JNLUR8WY7U.p8` (257 B) + `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_TOPIC` (fallback to pass type) + `APNS_USE_SANDBOX` escape hatch.
- Signing: `passkit-generator@3.6.0` in `walletService.js`; structural tests pass without credentials; device-installable output requires real IDs + certs.
- Package structure: `passes/vipMembership.pass/` assets + per-member `pass.json` override (storeCard fields, QR `PKBarcodeFormatQR`, `webServiceURL <PUBLIC_BASE_URL>/apple` when known).
- Update/web-service: full PassKit Web Service (`routes/appleWebService.js`) + `touchPassUpdate`/`pass_updates` bump tracking + APNs empty background push (`hapns@1.0.2`).
- State: implementation KEEP; credential validity UNKNOWN pending functional test.

## Google Wallet audit

- Issuer: none configured. Service account approach: none. Class/object/JWT/API implementation: none (zero `google` references outside specs/docs).
- State: NOT IMPLEMENTED — greenfield under future `GoogleWalletProvider` per `agent/08-GOOGLE-WALLET-SPEC.md`.

## Current errors

1. None blocking locally: tests 47/47 pass, lint clean.
2. Pre-existing working-tree drift (agent package uncommitted, 5 legacy root docs deleted, 2 routes/agents modified) — needs commit/tag decision, not a runtime bug.
3. Spec-vs-implementation gaps (multi-tenancy, RLS, provider boundary, Google, staging) — planned work, not regressions.
4. No incident file required (anti-loop protocol not triggered; fewer than 3 failed attempts on any issue — zero fix attempts made during read-only audit).

## Root-cause findings

- The codebase grew as a single-merchant Apple-only pilot; the SaaS/multi-tenant/provider-neutral requirements in `agent/` are newer than the implementation. Gaps are architectural drift, not defects.
- Env naming predates `ENVIRONMENT_SCHEMA.yaml`; both must be reconciled by mapping, not by adding parallel variables.

## Security findings

- Good: service-role key backend-only, browser receives only `NEXT_PUBLIC_*` Firebase keys; `.gitignore` + `.env.example` hygiene; timing-safe ApplePass compare; push-token/device-token never logged; diag endpoint metadata-only; validation on all Section A routes; lazy DB avoids credential-echo on boot.
- To fix before multi-tenant/staging: no RLS (accepted today, required later); single shared service key with no rotation doc; Firebase client auth with no backend verification; member search does in-memory filtering (fine at pilot scale, needs DB-side scoping with tenants); no rate-limit/secure-headers audit yet; dependency audit (`npm audit`) and secret scan not run in this session — scheduled for hardening phase.

## Recommended implementation path (per agent/03-EXECUTION-PLAN.md)

1. Phase 0 gate: accept this report + environment matrix (this document).
2. Phase 1 Foundation: canonicalize env (single `.env.example`, mapping table, `scripts/check-env-names.py` in CI), config loader validation, commit/tag checkpoint.
3. Phase 2 Database: add organizations/memberships/customers/pass_templates/passes/wallet_installations/loyalty_transactions/analytics_events/audit_logs design; migrations; RLS; tenant-isolation tests.
4. Phase 3 Wallet domain: `WalletService` interface + extract `AppleWalletProvider`; provider-neutral tests.
5. Phase 4 Apple: re-verify signed pass + web-service E2E with non-prod credentials.
6. Phase 5 Google: issuer/service-account/test class+object/JWT/delivery NON-prod only.
7. Phase 6–7 Dashboard + analytics/CRM per specs.
8. Phase 8 Staging deploy (new staging service) with smoke; production only after gate.
9. Phase 9 Hardening: unit/integration/E2E + authz + secret scan + `npm audit` + build + deploy verification per `agent/18-DEFINITION-OF-DONE.md`.

## Reset/rebuild recommendation

**No reset, no rebuild, no destructive action.** Preserve working Apple/domain/tests/dashboard shell. Refactor incrementally per `agent/19-RESET-STRATEGY.md`. If a clean rebuild is ever selected, follow the 11-step preserve-and-extract procedure there — not deletion.

## Migration risks

- Env rename without mapping breaks Render deploys — use alias-then-cutover with redeploy verification.
- Adding tenant FKs/RLS to live `members` data needs backfill + migration review (dev -> staging -> prod with rollback plan).
- Apple cert/ID mismatch silently yields non-installable passes — verify with structural test first, device test second.
- Google greenfield must stay non-production until JWT/delivery verified.
- Dashboard auth-model change (service key -> session + service credential) must keep scanner flows working.

## Next actions

- [ ] Review/accept this report + `docs/ENVIRONMENT_MATRIX.md`
- [ ] Commit or checkpoint current tree (including agent package) with a tag
- [ ] Authorize Phase 1 (env canonicalization + foundation), tracked in `agent/TASK_LEDGER.md` (AUDIT-001 -> DONE pending acceptance)
- [ ] Provide read-only Supabase/Render access for live-state verification, or accept UNKNOWNs with probe-based verification later

## Audit completion gate (agent/01-AUDIT-PROTOCOL.md)

- [x] environment matrix exists (`docs/ENVIRONMENT_MATRIX.md`)
- [~] Render state known — blueprint known, live state UNKNOWN (no tool capability; verification path documented)
- [~] Supabase state known — schema known, live state UNKNOWN (no tool capability; verification path documented)
- [x] Apple state known (implementation KEEP; credential validity pending functional test)
- [x] Google state known (not implemented)
- [x] current failures documented (none blocking; gaps listed)
- [x] architecture recommendation exists (refactor, no rebuild)
- [x] migration/reset strategy exists (incremental; no destructive action)

Gate judgment: audit COMPLETE as a repository audit; live-infrastructure verification remains open and must precede any staging/production gate.

## Phase 1 verification addendum (2026-09-30, branch `refactor/phase1-env-foundation`)

Read-only verification only. No app code modified, no infra changed, no credentials rotated,
no migrations, no production actions, no secret values exposed/printed/committed.
Checkpoint: commit `8fca1c3` + tag `audit-baseline-2026-09-30` (local only, not pushed).
Working tree was clean at checkpoint; this addendum + matrix/ledger updates are the only delta since.

### Supabase live-state findings

- File-based verification only (no Supabase API capability in session; MCP resource lists empty).
- `database/schema.sql`: 9 tables (tiers/members/points_ledger/visits/rewards/redemptions/devices/apple_devices/apple_registrations/pass_updates), FKs + checks + indexes present, RLS deliberately absent (service-role backend-only). No migrations directory.
- Consumption: `database/db.js` reads `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` lazily (`DB_CONFIG_ERROR` only on touch); `storageService.js` adds `SUPABASE_STORAGE_BUCKET`. No other Supabase consumers.
- Presence-only signal: `node scripts/smoke.js` reached the DB layer (`DB_ERROR` on bogus uuid instead of `DB_CONFIG_ERROR`), confirming local Supabase vars are set — values never inspected.
- `scripts/db-roundtrip.js` + `/admin/diag-supabase` (host/row-count/error-prefix only) remain the approved functional probes; db-roundtrip was NOT run (it writes test rows — prohibited this phase).
- Live project tables/RLS/auth/storage/functions: still UNKNOWN. The pre-existing `RUNBOOK.md` (in history at `a01c877`) documents the intended flow: apply `schema.sql` in a fresh project, then db-roundtrip.

### Render live-state findings

- Blueprint verification only (no Render API capability in session).
- `render.yaml`: `loyroy-api` (`npm install` / `node app.js`, health `/health`, 16 env keys) + `loyroy-admin` (`cd dashboard/admin-panel && npm install && npm run build` / `npm start`, 6 env keys). No staging service; pipeline is local -> production.
- `APNS_TOPIC` and `APNS_USE_SANDBOX` are absent from the blueprint (fallback-dependent: topic falls back to `PASS_TYPE_IDENTIFIER`, sandbox defaults off/production). Either declare them or document the fallback as intentional before push verification.
- `SERVICE_API_KEY` is `generateValue:true` on api but `sync:false` (manual copy) on admin — desync yields admin 502/401 or backend 401 with no code change. Copy procedure must be documented/runbooked.
- `SIGNER_*_PATH`/`APNS_KEY_PATH` values point at `./certificates/...` (absent on Render); `config.js` `resolveCertPath` basename-fallback to `/etc/secrets` compensates — but only when basenames match what was uploaded as secret files.
- Live deploy state/logs/domains/env presence: still UNKNOWN.

### Environment-variable discrepancies (verified)

- Per-service consumption mapped in `docs/ENVIRONMENT_MATRIX.md` (api: 18 names; admin: 2 server + 3 public + NODE_ENV; 8 documented-but-unreferenced names).
- Canonical mismatches confirmed and PRESERVED (no code renames): `SUPABASE_SERVICE_KEY`, `PASS_TYPE_IDENTIFIER`, `PUBLIC_BASE_URL`/`BACKEND_URL`, cert-file model. Mapping documented in matrix; future rename must be alias-then-cutover.
- Redundant `env.example` was byte-identical to `.env.example` (`cmp` → IDENTICAL) and has been removed (`git rm env.example`). Single canonical example remains: `.env.example` (root) + `dashboard/admin-panel/.env.example` (admin).
- Local discrepancy (presence-only): resolved `APNS_KEY_PATH` targets `AuthKey_H569J8DH3N.p8` (missing) while `certificates/` holds `AuthKey_JNLUR8WY7U.p8` (257 B) — filename key-IDs differ. Local APNs sends would fail safe via `notifyPassUpdated` report path (never throws; writes unaffected). Align PATH or file before any APNs device test; same mismatch class as the Render secret-file problem below.
- `.nvmrc` pins Node 22 (CI matches); local ran 26.8.1 clean — no action, noted.

### Root cause of the existing Render configuration problem

Determinable from repo evidence (git history + code + blueprint, no live API needed).
The deployment failures were secret-file path mismatches compounded by blind spots, in order:

1. Primary: Render mounts secret files at `/etc/secrets/<basename>`, but `SIGNER_*_PATH`/`APNS_KEY_PATH` defaulted to `./certificates/...`, which does not exist on Render. Any fresh Render deploy without corrected paths failed pass signing/push with file errors. Fixed in code by the `resolveCertPath` basename fallback (commits `8f20cdd`, `97a783b`); blind spot closed by diag reporting effective paths + existence + byte sizes (commits `f911279`, `cf5d622`, `5a6fd3e`) and CI-safe `PASS_FILE_ERROR` (`65909f1`).
2. Secondary (still open): `SERVICE_API_KEY` generated on api only; admin requires a manual identical copy. Nothing in the blueprint enforces or verifies the match.
3. Tertiary (latent): canonical-schema vs code naming drift tempts operators to set the wrong name (e.g. `SUPABASE_SERVICE_ROLE_KEY` instead of the consumed `SUPABASE_SERVICE_KEY`), producing a "set but not read" failure. Matrix mapping now documents the consumed names.

### Changes made (this phase)

- Git: branch `refactor/phase1-env-foundation`, commit `8fca1c3`, tag `audit-baseline-2026-09-30` (local only).
- Removed redundant `env.example` (identical duplicate confirmed by `cmp`).
- Rewrote `docs/ENVIRONMENT_MATRIX.md` with verified per-service consumption, declaration-vs-live status, and compat policy.
- Updated `agent/TASK_LEDGER.md` (AUDIT-001 DONE, ENV-001 DONE for docs-level scope with blockers noted).
- This addendum. No application code touched; Apple Wallet implementation untouched.

### Changes deliberately NOT made

### Live Render verification addendum (2026-09-30, via One CLI — read-only, key names + statuses only)

- Services: `loyroy-admin` + `loyroy-api` match the blueprint; third service `LoyRoy`
  (`srv-dakbtlnqj5pc73ak2l3g`) is NOT in `render.yaml` — same repo/branch, api-style start command,
  zero env vars, no health check. With no `SERVICE_API_KEY`/`SUPABASE_*`/signing vars it can only
  answer `/health` and `/apple/v1/log`; every authenticated/DB/signing route 500s by design.
  Recommendation: suspend or delete the duplicate ONLY with explicit approval (destructive action),
  after confirming nothing (DNS, dashboard `BACKEND_URL`, scanners) points at `loyroy.onrender.com`.
- Deploys: all live on `a01c877` (= local `main` HEAD); history shows orderly supersedes, no stuck failure.
- Env keys live match `render.yaml` exactly on both blueprint services (api 16, admin 6);
  `APNS_TOPIC`/`APNS_USE_SANDBOX` confirmed absent (fallback path active).
- Health: `loyroy-api` serving steady `GET /health 200` to Render's checker.
- The earlier file-path root cause (E.1) is confirmed mitigated live: api has all four `*_PATH` keys
  set and the service is healthy. Remaining live risks: legacy duplicate service, manual
  `SERVICE_API_KEY` copy between api/admin, and `APNS_KEY_PATH` basename correctness on Render
  (secret-file byte-sizes checkable via `/admin/diag-supabase` when needed).
- Supabase live state remains unverified (no Supabase tool connection); unchanged probe path applies.

### Points-not-updating incident (2026-10-01) — root cause + correction

- Symptom: issued pass (LOYROY-6d16…) never reflected added points.
- Server evidence (Render logs): register 201, update-points 200 ×2, APNs pushes delivered 1/1 ×2.
  Server write path correct. `addPoints` bumps `updated_at`, `touchPassUpdate` writes — 304-stale theory ruled out.
- Device evidence (`/apple/v1/log`): `Get serial #s ... 401` and endless
  `Unregister task ... LOYROY-8fd2… : Authentication failure`. The iPhone holds a stale/deleted
  pass (8fd2…) whose token matches nothing server-side, poisoning serials polling so the new pass
  never pulls updates. Fix user-side: delete ALL LoyRoy passes from Wallet, re-issue exactly one.
- Code fixes on branch (58/58 tests, lint clean, NOT YET DEPLOYED — needs merge/push approval):
  1. Idempotent unregister: valid-token DELETE for an unknown serial → 200 (was 401), ending
     iOS's infinite Authentication-failure retry loop. Unknown tokens still 401; reads unchanged.
  2. Observability: `apple-serials ... 200/204` and `apple-fetch ... 304` server lines (200 fetch
     already logged) so the next diagnosis is never blind.
- CORRECTION — wrong-database disclosure: the Phase 2 schema/002/`wallet-pass` work targeted
  Supabase project `qaltolfe…` (the only project visible to the `one` connection), but the diag
  endpoint proves the app runs on `clepxujvgyhdahwhpsmx.supabase.co` — a project the `one` token
  cannot see (`Forbidden`). That work was harmless (empty project) but did NOT serve the app.
  The app's real database evidently already had the pilot schema (all flows 200/201).
  Redo pack (not executed): `database/migrations/APPLY-TO-REAL-PROJECT.sql` — one idempotent file
  (001 + bucket + 002) to paste into the real project's SQL editor, since I have no API path to it.

### Live Supabase verification addendum (2026-10-01, via One CLI — read-only SELECTs only; see correction above: this verified the WRONG project `qaltolfe…`, not the app database)

- Project `qaltolfejxgazwuxwnpr`, us-east-1, ACTIVE_HEALTHY. **0 tables in `public` — the schema was never
  applied.** Only system schemas exist (auth/realtime/storage/vault). 0 storage buckets, 0 auth users.
- Live `loyroy-api` is therefore up but dataless: every DB-backed route fails `DB_ERROR` today.
- Approval-gated next step (Phase 2): apply `database/schema.sql`, create the storage bucket named by
  `SUPABASE_STORAGE_BUCKET`, verify with `db-roundtrip` + diag endpoint. No writes were made in this phase.
- RESOLVED 2026-10-01 (Phase 2, authorized): schema applied to the empty project in ordered chunks
  (additive only — 0 tables/rows/users existed beforehand). Verified: 10 public tables, 5 tier seeds,
  insert -> points_ledger -> balance update -> cascade delete roundtrip with 0 rows remaining.
  Migration record: `database/migrations/001-initial-schema-record.sql`. Open: storage bucket creation,
  multi-tenant extension + RLS (proposal below, approval required before data-layer changes).

### Changes deliberately NOT made (continued)

- No renames of `SUPABASE_SERVICE_KEY`, `PASS_TYPE_IDENTIFIER`, `PUBLIC_BASE_URL`/`BACKEND_URL`, or cert-file model (would break working services; compat preserved).
- No `.env.example` content edits; no `.env`/secret reads; no credential rotation.
- No migrations (`scripts/db-roundtrip.js` not run), no production changes, no staging service creation.
- No dashboard `firebase-admin` ID-token verification (tracked TODO in proxy route; Phase 6–8 scope).
- No Google Wallet work; no Apple logic changes; no functionality removed.
- No push to origin (checkpoint/tag local only).
- `opencode.json` still references deleted root docs (`PROJECT_PLAN.md` etc.) — pre-existing drift, out of Phase 1 env scope, noted for a later docs pass.
