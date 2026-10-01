# Environment Matrix

Source: first-run audit 2026-09-30; verified Phase 1 (read-only) 2026-09-30 on branch `refactor/phase1-env-foundation`.
Do not put secret values here. Conventions: `PRESENT` / `MISSING` / `UNUSED` / `MISMATCH` / `UNKNOWN`.
Local `.env` values were NEVER read or printed. Presence-only signals used: `scripts/check-env-names.py` (name enumeration),
`node scripts/smoke.js` outcomes (PASS/FAIL only), file existence + byte sizes, `render.yaml` declarations, code references.
No live Supabase/Render API access exists in this session (MCP resource lists empty); Production presence is declaration-based.

## Live Render verification (2026-09-30, via One CLI `render` connection — key names only, values never fetched)

- Services live: `loyroy-admin` (`srv-dakcjlnqj5pc73amh42g`), `loyroy-api` (`srv-dakcjlvqj5pc73amh440`),
  plus undocumented `LoyRoy` (`srv-dakbtlnqj5pc73ak2l3g`, same repo, `npm install`/`node app.js`, NO env vars, NO health check).
  All `web_service`, branch `main`, `not_suspended`.
- Deploys: all three `live` on commit `a01c877` (current `main` HEAD); older deploys `deactivated`. No failed live deploy.
- Env keys live on `loyroy-api` (16): APNS_KEY_ID, APNS_KEY_PATH, APNS_TEAM_ID, NODE_ENV, PASS_TYPE_IDENTIFIER,
  PORT, PUBLIC_BASE_URL, SERVICE_API_KEY, SIGNER_CERT_PATH, SIGNER_KEY_PASSPHRASE, SIGNER_KEY_PATH,
  SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET, SUPABASE_URL, WWDR_PATH, APPLE_TEAM_ID — exact match to `render.yaml`.
- Env keys live on `loyroy-admin` (6): BACKEND_URL, NODE_ENV, SERVICE_API_KEY, NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID — exact match to `render.yaml`.
- `APNS_TOPIC` / `APNS_USE_SANDBOX` confirmed ABSENT live (fallback-dependent, as designed).
- `loyroy-api` logs: steady `GET /health 200` from Render health checker — service healthy.
- Supabase live state: still no direct tool access (no Supabase connection in `one`); probe path unchanged
  (`/admin/diag-supabase` + `scripts/db-roundtrip.js`, the latter not run — writes rows).

## Live Supabase verification (2026-10-01, via One CLI `supabase` connection — read-only SELECTs only)

- Project `qaltolfejxgazwuxwnpr` ("oweyeahk@gmail.com's Project"), us-east-1, ACTIVE_HEALTHY.
- **`public` schema has 0 tables — `database/schema.sql` was never applied.** 39 tables exist, all system
  (`auth.*`, `realtime.*`, `storage.*`, `vault.secrets`). No members/tiers/ledger/rewards/apple_* tables.
- 0 storage buckets (none created; `SUPABASE_STORAGE_BUCKET` has nothing to point at yet).
- 0 `auth.users` rows.
- Consequence: every live `loyroy-api` database path (members, points, redeem, storage upload, Apple
  registrations) currently fails with `DB_ERROR`; only `/health` and `/apple/v1/log` succeed.
  Fix (requires approval, Phase 2 scope): apply `database/schema.sql` to this project, create the storage
  bucket, then run `scripts/db-roundtrip.js` + `/admin/diag-supabase` to confirm.
- RESOLVED 2026-10-01 (Phase 2): schema applied (10 public tables, tiers seeded with 5 rows),
  roundtrip verified with full cleanup. Record: `database/migrations/001-initial-schema-record.sql`.
  CORRECTION: applied to project `qaltolfe…` (only API-visible project), NOT the app database
  (`clepxujvgyhdahwhpsmx`, Forbidden to tooling). Redo pack for the app DB:
  `database/migrations/APPLY-TO-REAL-PROJECT.sql` (needs dashboard SQL editor).
- RESOLVED 2026-10-01: 002 multi-tenant applied live — 17 tables, RLS on all, 34 deny policies
  (anon/authenticated), service-role path verified with cleanup. Design + record in
  `database/migrations/002-*`. Per-tenant session policies deferred to dashboard-auth phase.
- RESOLVED 2026-10-01: storage bucket `wallet-pass` (public) created; `SUPABASE_STORAGE_BUCKET=wallet-pass`
  set on live `loyroy-api` (takes effect on next deploy — none triggered yet as of check).
  Local `.env` still needs `SUPABASE_STORAGE_BUCKET=wallet-pass` (untouched: `.env` files are never read/edited here).
  RLS intentionally absent (service-role backend-only).
- Note: two `supabase` connections exist in `one`, both pointing at this same project (duplicate, harmless).

## Per-service consumption (from source-code references)

`loyroy-api` (Express: `app.js`, `config.js`, `routes/*`, `services/*`, `database/*`, `scripts/*`):
PORT, NODE_ENV, PUBLIC_BASE_URL, SERVICE_API_KEY, SIGNER_CERT_PATH, SIGNER_KEY_PATH, WWDR_PATH,
SIGNER_KEY_PASSPHRASE, PASS_TYPE_IDENTIFIER, APPLE_TEAM_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY,
SUPABASE_STORAGE_BUCKET, APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC, APNS_USE_SANDBOX.

`loyroy-admin` (Next.js: `lib/backend.js`, `lib/firebase.js`, API proxy route):
Server-only: BACKEND_URL, SERVICE_API_KEY (must equal the api value — copy, never generate separately).
Browser-public: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID.
Build: NODE_ENV.

Referenced nowhere in code (documented only): DATABASE_URL, MONGODB_URI, CLERK_SECRET_KEY,
CLERK_PUBLISHABLE_KEY, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, GITHUB_PAT (tooling opt-in).

## Canonical schema variables (verified state)

| Variable | Dev (local) | Staging | Production (render.yaml) | Consumer | Source | Secret | Validation |
|---|---|---|---|---|---|---|---|
| NODE_ENV | PRESENT (name referenced; value not inspected) | MISSING (no staging service) | DECLARED value `production` (live unverified) | backend | deployment | No | enum(dev,staging,production) |
| APP_URL | MISMATCH (code uses `PUBLIC_BASE_URL`) | MISSING | MISMATCH | backend | deployment | No | valid_url |
| API_URL | MISMATCH (api uses `PUBLIC_BASE_URL`; admin uses `BACKEND_URL`) | MISSING | MISMATCH | app | deployment | No | valid_url |
| SUPABASE_URL | PRESENT (name set; smoke reached DB layer → `DB_ERROR`, not `DB_CONFIG_ERROR`) | MISSING | DECLARED `sync:false` (live unverified) | backend | Supabase | No | valid_url |
| SUPABASE_ANON_KEY | MISSING (backend uses service key; admin uses Firebase public keys) | MISSING | MISSING | app | Supabase | Public | presence |
| SUPABASE_SERVICE_ROLE_KEY | MISMATCH — code + blueprint use `SUPABASE_SERVICE_KEY` (compat preserved; do not duplicate) | MISSING | MISMATCH (declared as `SUPABASE_SERVICE_KEY`) | backend | Supabase | Yes | functional auth check |
| APPLE_TEAM_ID | PRESENT (name referenced) | MISSING | DECLARED `sync:false` | backend | Apple | No | presence |
| APPLE_PASS_TYPE_ID | MISMATCH — code + blueprint use `PASS_TYPE_IDENTIFIER` (compat preserved) | MISSING | MISMATCH (declared as `PASS_TYPE_IDENTIFIER`) | backend | Apple | No | presence |
| APPLE_KEY_ID | MISSING (only `APNS_KEY_ID`, a different credential) | MISSING | MISSING | backend | Apple | Protected | presence_if_required |
| APPLE_PRIVATE_KEY | MISMATCH — file-based `SIGNER_CERT_PATH`/`SIGNER_KEY_PATH`/`WWDR_PATH` + `SIGNER_KEY_PASSPHRASE` (cert trio present locally; sizes 2557/1981/1562 B) | MISSING | MISMATCH | backend | Apple | Yes | non-disclosing signing test |
| GOOGLE_WALLET_ISSUER_ID | MISSING (Google not implemented) | MISSING | MISSING | backend | Google | No | presence |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | MISSING | MISSING | MISSING | backend | Google | Protected | presence |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | MISSING | MISSING | MISSING | backend | Google | Yes | non-disclosing auth test |
| JWT_SECRET | MISSING (uses `SERVICE_API_KEY` instead) | MISSING | MISSING | backend | Generated | Yes | minimum_length |

## Implementation-specific variables (verified state)

| Variable | Dev (local) | Staging | Production (render.yaml) | Consumer | Source | Secret | Validation |
|---|---|---|---|---|---|---|---|
| PUBLIC_BASE_URL | PRESENT (name referenced) | MISSING | DECLARED `sync:false` | backend (webServiceURL) | deployment | No | valid_url |
| SERVICE_API_KEY | PRESENT (smoke auth gates behaved as configured) | MISSING | DECLARED api `generateValue:true` / admin `sync:false` — MUST be copied, desync risk | backend/admin/scanner | generated | Yes | presence |
| PORT | default 3000 (name referenced) | MISSING | DECLARED `10000` | backend | deployment | No | port |
| SIGNER_CERT_PATH | PRESENT files, 2557 B | MISSING | DECLARED `./certificates/signerCert.pem` + `/etc/secrets` fallback in code | backend/signing | deployment | No (path) | file exists |
| SIGNER_KEY_PATH | PRESENT files, 1981 B | MISSING | DECLARED + fallback | backend/signing | deployment | No (path) | file exists |
| WWDR_PATH | PRESENT files, 1562 B | MISSING | DECLARED + fallback | backend/signing | Apple WWDR | No (path) | file exists |
| SIGNER_KEY_PASSPHRASE | PRESENT (name referenced; set-state confirmed by diag design, value never read) | MISSING | DECLARED `sync:false` | backend/signing | Apple | Yes | optional |
| PASS_TYPE_IDENTIFIER | PRESENT (name referenced) | MISSING | DECLARED `sync:false` | backend + APNs topic fallback | Apple | No | presence |
| SUPABASE_SERVICE_KEY | PRESENT (smoke reached DB layer) | MISSING | DECLARED `sync:false` | backend | Supabase | Yes | functional check |
| SUPABASE_STORAGE_BUCKET | PRESENT (name referenced) | MISSING | DECLARED `sync:false` | backend storage | Supabase | No | presence |
| DATABASE_URL | UNUSED (documented only) | MISSING | MISSING | backend opt. direct PG | Supabase | Yes | valid_url |
| MONGODB_URI | UNUSED (documented only) | MISSING | MISSING | — | deployment | Yes | valid_url |
| APNS_KEY_PATH | MISMATCH — resolves to `AuthKey_H569J8DH3N.p8` (not found); `certificates/` holds `AuthKey_JNLUR8WY7U.p8` (257 B). Filename IDs differ — local APNs send would fail safe (reported, not thrown). | MISSING | DECLARED `sync:false` (+ `/etc/secrets` fallback in code) | backend push | Apple | No (path) | file exists |
| APNS_KEY_ID | PRESENT (name referenced) | MISSING | DECLARED `sync:false` | backend push | Apple | Protected | presence |
| APNS_TEAM_ID | PRESENT (name referenced) | MISSING | DECLARED `sync:false` | backend push | Apple | Protected | presence |
| APNS_TOPIC | PRESENT (name referenced; falls back to `PASS_TYPE_IDENTIFIER`) | MISSING | NOT DECLARED (relies on fallback) — add or document | backend push | Apple | No | presence |
| APNS_USE_SANDBOX | name referenced (default production) | MISSING | NOT DECLARED — intentional (prod-only pushes) | backend push | deployment | No | enum(true,unset) |
| BACKEND_URL | admin default localhost:3000 | MISSING | DECLARED `sync:false` on admin | admin server | deployment | No | valid_url |
| NEXT_PUBLIC_FIREBASE_API_KEY | admin client (names only) | MISSING | DECLARED `sync:false` on admin | admin browser | Firebase | Public | presence |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | admin client | MISSING | DECLARED `sync:false` | admin browser | Firebase | Public | presence |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | admin client | MISSING | DECLARED `sync:false` | admin browser | Firebase | Public | presence |
| Server `FIREBASE_*` / `CLERK_*` | UNUSED (`.env.example` only; admin proxy TODO notes `firebase-admin` not yet added) | MISSING | MISSING | — | Firebase/Clerk | Yes | TBD |
| GITHUB_PAT | UNUSED (MCP opt-in, disabled) | MISSING | MISSING | tooling | GitHub | Yes | if enabled |

## Verification evidence (Phase 1, read-only, no values printed)

- `cmp .env.example env.example` → IDENTICAL → redundant `env.example` removed (`git rm env.example`).
- `node scripts/smoke.js` → 4/5 PASS (health 200, no-key 401, bad-body 400, apple-log 200 PASS; `DB_CONFIG_ERROR` expectation FAIL because local `.env` supplies Supabase creds — smoke reached the DB layer and returned `DB_ERROR` for the bogus uuid, confirming Supabase vars present without inspecting values).
- `npm test` → 8 suites / 47 pass (unchanged). `npm run lint` → clean.
- Signing trio exist locally with expected byte sizes; APNs `.p8` filename mismatch noted above (presence-only).
- `render.yaml` declares api: 16 keys, admin: 6 keys; `APNS_TOPIC`/`APNS_USE_SANDBOX` absent (fallback-dependent); no staging service.
- Scanner: `python3 scripts/check-env-names.py` reproduces the 18 referenced names without printing values.

## Reconciliation policy (compat preserved)

Code renames are DEFERRED — `SUPABASE_SERVICE_KEY`, `PASS_TYPE_IDENTIFIER`, `PUBLIC_BASE_URL`/`BACKEND_URL`,
and the cert-file model stay as-is because the blueprint, code, and working Apple flow all agree on them.
Canonical names from `agent/ENVIRONMENT_SCHEMA.yaml` are mapped here, not duplicated as new variables.
Any future rename must be alias-then-cutover with redeploy verification, never a flag-day.
