# LoyRoy Runbook

How to run locally, generate a test pass, install it on a device, and deploy.
All steps below were executed during the build — if one fails for you, stop
and fix it there; don't skip ahead.

## 1. Prerequisites

- Node.js 20+ (`cat .nvmrc`; `nvm use` if you use nvm)
- `certificates/signerCert.pem`, `certificates/signerKey.pem`, `certificates/wwdr.pem` in place
  (already provided — never commit, never paste their contents anywhere)
- A Supabase project (database + storage), a Firebase project (dashboard
  auth), an APNs Auth Key, a Render account — see §2 for which value goes where

## 2. Environment

```bash
cp .env.example .env
```

| Variable | Where to get it |
|---|---|
| `PORT`, `NODE_ENV` | local choice (`3000`, `development`) |
| `SIGNER_CERT_PATH/KEY_PATH/WWDR_PATH` | defaults already point at `certificates/` |
| `SIGNER_KEY_PASSPHRASE` | password used when the signer key PEM was exported |
| `PASS_TYPE_IDENTIFIER` | Apple Developer portal → Identifiers → Pass Type IDs (cert subject shows `pass.com.loyalty.royalty`) |
| `APPLE_TEAM_ID` | Developer portal → Membership (cert subject OU shows `P2HDHCNKV8`) |
| `SERVICE_API_KEY` | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PUBLIC_BASE_URL` | public URL of this API, e.g. `https://api.example.com` (embedded in passes as `<url>/apple`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase dashboard → project → Settings → API |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name you create for pass art |
| `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID` | Developer portal → Certificates, IDs & Profiles → Keys (APNs enabled); save `.p8` as `certificates/AuthKey_<KEYID>.p8` |
| `APNS_TOPIC` | your Pass Type Identifier (defaults to `PASS_TYPE_IDENTIFIER`) |

Dashboard (`dashboard/admin-panel/.env.local`, never committed):

| Variable | Where to get it |
|---|---|
| `BACKEND_URL` | backend origin, e.g. `http://localhost:3000` |
| `SERVICE_API_KEY` | same value as backend `.env` (server-side only) |
| `NEXT_PUBLIC_FIREBASE_API_KEY/_AUTH_DOMAIN/_PROJECT_ID` | Firebase console → project settings; enable Email/Password sign-in |

## 3. Backend

```bash
npm install
npm run dev        # boots on :3000
curl localhost:3000/health   # → {"status":"ok"}
npm test           # full suite (in-memory fakes; no credentials needed)
npm run lint
node scripts/smoke.js        # boot/auth/validation/config-error checks
```

Database (needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`):

```bash
# Apply database/schema.sql in Supabase → SQL editor (or psql $DATABASE_URL -f database/schema.sql)
node scripts/db-roundtrip.js # create → +100 pts → history → delete
```

## 4. Generate a test pass (needs `SIGNER_KEY_PASSPHRASE` + real IDs)

```bash
node scripts/generate-sample-pass.js   # writes tmp/sample.pkpass
unzip -l tmp/sample.pkpass             # must list manifest.json, signature, pass.json + art
```

Without the passphrase yet, the service fails fast with `PASS_KEY_ERROR`
instead of a crypto stack trace — that message tells you exactly what's missing.

### Install on an iPhone (manual — cannot be automated)

1. AirDrop `tmp/sample.pkpass` from a Mac to the iPhone, **or** email it to
   yourself and open the attachment on the iPhone.
2. Wallet shows an install sheet → Add.
3. Correct render: black/gold store card titled “LoyRoy”, header `TIER: GOLD`,
   primary `POINTS: 1250`, secondary member name, `MEMBER ID: C001`, scannable
   QR on the back-details screen, terms text on the back.

## 5. Dashboard

```bash
cd dashboard/admin-panel
npm install
npm run dev        # :3001 (set PORT=3100 to avoid clashes)
npm run lint && npm run build
```

Flows: Members (list/search) → member detail (adjust points, history, Wallet
push) → Issue pass (downloads `.pkpass`) → Scanner (camera via html5-qrcode,
or type/scan code manually; HID wedge scanners work by focusing anywhere and
scanning) → Assets (Supabase Storage upload via backend).

Auth note: the UI has a Firebase login wall; the `/api/loyroy/*` proxy still
needs Firebase **ID-token verification** (`firebase-admin` + service account)
before public exposure — see the TODO in
`dashboard/admin-panel/app/api/loyroy/[...slug]/route.js`.

## 6. Production (Render)

`render.yaml` defines two web services: `loyroy-api` (this repo root) and
`loyroy-admin` (`dashboard/admin-panel`). Set every variable from §2 in the
Render dashboard (secret files for the `.p8`). `/health` is the health-check
path. GitHub Actions (`.github/workflows/ci.yml`) runs backend
install/lint/test plus dashboard lint/build on every push and PR.
