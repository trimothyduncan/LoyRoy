# Environment Matrix

Source: first-run audit 2026-09-30. Do not put secret values here.
Conventions: `PRESENT` / `MISSING` / `UNUSED` / `MISMATCH` / `UNKNOWN`.
Local `.env` exists but values were NOT inspected per policy (`opencode.json` deny + `agent/04-ENVIRONMENT-SYSTEM.md`); Dev column therefore reflects code references, not verified presence.
Staging service does not exist in `render.yaml`; Staging is `MISSING` unless noted.
Production reflects `render.yaml` declarations (`sync: false` = must be set in dashboard; live presence unverified — no Render tool access).

## Canonical schema variables

| Variable | Dev | Staging | Production | Consumer | Source | Secret | Validation |
|---|---|---|---|---|---|---|---|
| NODE_ENV | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml value `production`) | backend | deployment | No | enum(dev,staging,production) |
| APP_URL | MISMATCH (code uses `PUBLIC_BASE_URL`) | MISSING | MISMATCH | backend | deployment | No | valid_url |
| API_URL | MISMATCH (code uses `PUBLIC_BASE_URL`; dashboard uses `BACKEND_URL`) | MISSING | MISMATCH | app | deployment | No | valid_url |
| SUPABASE_URL | UNKNOWN (referenced `database/db.js`) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend | Supabase | No | valid_url |
| SUPABASE_ANON_KEY | MISSING (backend uses service key; dashboard uses Firebase public keys) | MISSING | MISSING | app | Supabase | Public | presence |
| SUPABASE_SERVICE_ROLE_KEY | MISMATCH (code + render.yaml use `SUPABASE_SERVICE_KEY`) | MISSING | MISMATCH (declared as `SUPABASE_SERVICE_KEY`) | backend | Supabase | Yes | presence_and_functional_auth_check |
| APPLE_TEAM_ID | UNKNOWN (referenced `config.js`) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend | Apple | No | presence |
| APPLE_PASS_TYPE_ID | MISMATCH (code + render.yaml use `PASS_TYPE_IDENTIFIER`) | MISSING | MISMATCH (declared as `PASS_TYPE_IDENTIFIER`) | backend | Apple | No | presence |
| APPLE_KEY_ID | MISSING (only `APNS_KEY_ID`, different credential) | MISSING | MISSING | backend | Apple | Protected | presence_if_architecture_requires |
| APPLE_PRIVATE_KEY | MISMATCH (file-based `SIGNER_CERT_PATH`/`SIGNER_KEY_PATH`/`WWDR_PATH` + `SIGNER_KEY_PASSPHRASE`) | MISSING | MISMATCH | backend | Apple | Yes | non_disclosing_signing_test |
| GOOGLE_WALLET_ISSUER_ID | MISSING (Google not implemented) | MISSING | MISSING | backend | Google | No | presence |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | MISSING | MISSING | MISSING | backend | Google | Protected | presence |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | MISSING | MISSING | MISSING | backend | Google | Yes | non_disclosing_google_auth_test |
| JWT_SECRET | MISSING (uses `SERVICE_API_KEY` instead) | MISSING | MISSING | backend | Generated | Yes | minimum_length |

## Implementation-specific variables (reconcile into schema deliberately — do not duplicate)

| Variable | Dev | Staging | Production | Consumer | Source | Secret | Validation |
|---|---|---|---|---|---|---|---|
| PUBLIC_BASE_URL | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend (webServiceURL) | deployment | No | valid_url |
| SERVICE_API_KEY | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `generateValue:true` api / `sync:false` admin) | backend/dashboard/scanner | generated | Yes | presence |
| PORT | UNKNOWN (default 3000) | MISSING | UNKNOWN (render.yaml value `10000`) | backend | deployment | No | port |
| SIGNER_CERT_PATH | UNKNOWN (default `./certificates/signerCert.pem`, `/etc/secrets` fallback) | MISSING | UNKNOWN (render.yaml value `./certificates/signerCert.pem`) | backend/signing | deployment | No (path) | file exists |
| SIGNER_KEY_PATH | UNKNOWN (default `./certificates/signerKey.pem`, fallback) | MISSING | UNKNOWN (render.yaml) | backend/signing | deployment | No (path) | file exists |
| WWDR_PATH | UNKNOWN (default `./certificates/wwdr.pem`, fallback) | MISSING | UNKNOWN (render.yaml) | backend/signing | Apple WWDR | No (path) | file exists |
| SIGNER_KEY_PASSPHRASE | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend/signing | Apple | Yes | optional |
| PASS_TYPE_IDENTIFIER | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend + APNs topic fallback | Apple | No | presence |
| SUPABASE_SERVICE_KEY | UNKNOWN (referenced; canonical mismatch) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend | Supabase | Yes | functional auth check |
| SUPABASE_STORAGE_BUCKET | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend storage | Supabase | No | presence |
| DATABASE_URL | UNUSED (documented only, no code ref) | MISSING | MISSING | backend (direct PG, optional) | Supabase | Yes | valid_url |
| MONGODB_URI | UNUSED (documented only) | MISSING | MISSING | backend (unused path) | deployment | Yes | valid_url |
| APNS_KEY_PATH | UNKNOWN (referenced; `/etc/secrets` fallback) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend push | Apple | No (path) | file exists |
| APNS_KEY_ID | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend push | Apple | Protected | presence |
| APNS_TEAM_ID | UNKNOWN (referenced) | MISSING | UNKNOWN (render.yaml `sync:false`) | backend push | Apple | Protected | presence |
| APNS_TOPIC | UNKNOWN (referenced; defaults to `PASS_TYPE_IDENTIFIER`) | MISSING | UNKNOWN (not in render.yaml — uses fallback) | backend push | Apple | No | presence |
| APNS_USE_SANDBOX | UNKNOWN (referenced; default production) | MISSING | UNKNOWN (not in render.yaml) | backend push | deployment | No | enum(true,unset) |
| BACKEND_URL | UNKNOWN (dashboard `lib/backend.js`, default localhost:3000) | MISSING | UNKNOWN (render.yaml `sync:false` on admin) | dashboard server | deployment | No | valid_url |
| NEXT_PUBLIC_FIREBASE_API_KEY | UNKNOWN (dashboard client) | MISSING | UNKNOWN (render.yaml `sync:false` on admin) | dashboard browser | Firebase | Public | presence |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | UNKNOWN | MISSING | UNKNOWN (render.yaml `sync:false`) | dashboard browser | Firebase | Public | presence |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | UNKNOWN | MISSING | UNKNOWN (render.yaml `sync:false`) | dashboard browser | Firebase | Public | presence |
| FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY | UNUSED (in `.env.example` only; dashboard uses `NEXT_PUBLIC_*` client keys) | MISSING | MISSING | — | Firebase | Yes | TBD |
| CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY | UNUSED (in `.env.example` only, no code ref) | MISSING | MISSING | — | Clerk | Yes/Public | TBD |
| GITHUB_PAT | UNUSED (MCP opt-in only) | MISSING | MISSING | tooling | GitHub | Yes | presence_if_enabled |

## Reconciliation notes

1. `SUPABASE_SERVICE_KEY` vs `SUPABASE_SERVICE_ROLE_KEY`, `PASS_TYPE_IDENTIFIER` vs `APPLE_PASS_TYPE_ID`, `PUBLIC_BASE_URL`/`BACKEND_URL` vs `APP_URL`/`API_URL` — pick one canonical name each and alias-then-cutover; never carry both.
2. Cert-file model (`SIGNER_*`/`WWDR_*`) vs `APPLE_PRIVATE_KEY` string model — decide and reflect in schema + `render.yaml` + docs.
3. `DATABASE_URL` / `MONGODB_URI` / `CLERK_*` / server-side `FIREBASE_*` are documented but unreferenced — remove or mark explicitly optional before staging.
4. `APNS_TOPIC` / `APNS_USE_SANDBOX` missing from `render.yaml` — add (or document intentional fallback) before push verification.
5. Scanner: `python3 scripts/check-env-names.py` from repo root reproduces the referenced-name list without printing values.
