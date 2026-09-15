# Project Plan

Source: the original architecture flow (Apple Developer Approval → ... →
Production Deployment). Steps 1–4 (Apple Developer Approval, Pass Type ID,
Wallet certificate generation, PEM export) are already done by the user —
this plan starts at step 5.

## Open decisions — confirm before Phase 1

Ask these together, once, as a single batched question, not one at a time
as you hit each phase:

1. Database: Supabase (Postgres) or MongoDB?
2. Auth provider for the dashboard: Clerk or Firebase Auth?
3. Compute hosting target: Railway or Render?
4. JavaScript or TypeScript for the backend?

File storage is already decided — **Supabase Storage** — see
`TECH_STACK.md`. That's true regardless of what's picked for the database
in question 1; if MongoDB is chosen for the database, a Supabase project is
still created for storage only.

If the user has no preference on the remaining questions, pick Supabase
(for both database and storage, so they share one project) and TypeScript
— but say so explicitly rather than deciding silently.

---

## Phase 1 — Backend Bootstrap

- Initialize the Node.js + Express project per `TECH_STACK.md`'s folder
  layout.
- `dotenv`-based env config; `.env.example` with every variable name this
  plan will eventually need, no real values.
- Basic middleware: JSON body parsing, request logging, error-handling
  middleware, CORS if the dashboard will be a separate origin.
- `GET /health` returning `200 { status: "ok" }`.
- `.gitignore` covering `.env`, `certificates/`, `node_modules/`, build
  output, and secret file extensions.

**Definition of done:** `npm install && npm run dev` starts the server with
no errors; `GET /health` returns 200; lint/build (if TS) passes clean.

## Phase 2 — Pass Generation Core

- Install `passkit-generator` — specifically the package from
  [alexandercerutti/passkit-generator](https://github.com/alexandercerutti/passkit-generator)
  (`npm install passkit-generator`). Do not use a fork or a differently-named
  rewrite. Pull current usage docs via Context7 first.
- Build the `.pass` template folder(s) under `passes/` (start with
  `vipMembership.pass/`) with icon/logo/strip placeholders — actual brand
  assets can come later; use minimal valid placeholders for now so
  generation is testable.
- `services/walletService.js`: loads the three certs from `certificates/`
  via env-configured paths, exposes `generatePass(memberData)` returning a
  signed `.pkpass` buffer, parameterized by tier/points/serial number.
- A `pass.json` builder function, not a static file, since fields (points
  balance, tier, barcode payload) are per-member.

**Definition of done:** a script or test generates a `.pkpass` from mock
member data with no thrown errors; the output is a valid zip containing a
`manifest.json`, `signature`, and `pass.json` with the required top-level
fields (`formatVersion`, `passTypeIdentifier`, `serialNumber`,
`teamIdentifier`, `organizationName`, `description`).

## Phase 3 — Database & Models

- Apply the database choice from the open-decisions step.
- Models: customer profiles, membership tiers, points balances, visit
  history, rewards tracking, expiration dates.
- Migrations (or schema setup) that run cleanly against a fresh local/dev
  instance.

**Definition of done:** schema applies with no errors; basic create/read/
update for a member round-trips correctly in a quick script or test.

## Phase 4 — Core API Endpoints

- Implement the six application endpoints from `API_SPEC.md` section A:
  `POST /create-pass`, `POST /update-points`, `POST /redeem`,
  `GET /member/:id`, `POST /register-device`, `POST /push-update`.
- Input validation on every route; consistent error shape.
- Wire `/create-pass` to `walletService` from Phase 2 and the models from
  Phase 3.

**Definition of done:** each endpoint matches its `API_SPEC.md` contract;
integration tests (e.g. `supertest`) cover the happy path and at least one
validation-failure path per endpoint; all pass.

## Phase 5 — QR & Scanner System

- `html5-qrcode` integration for webcam and iPhone-camera scanning in the
  redemption UI.
- Support dedicated hardware scanners as plain keystroke input (no SDK
  needed in the common case) into the same redemption flow.
- Wire scans to `/redeem` and `/member/:id`.

**Definition of done:** scanning a QR/barcode from a pass generated in
Phase 2 correctly resolves to a member and completes a redemption through
the Phase 4 endpoints.

## Phase 6 — Apple Wallet Web Service

- Implement the Apple-mandated routes from `API_SPEC.md` section B (device
  registration/unregistration, changed-serials lookup, latest-pass fetch,
  error logging). Verify the exact spec via Context7/web search before
  writing this section — don't implement from memory.

**Definition of done:** each route matches Apple's required method, path
shape, and status codes; can be exercised with mock requests matching the
spec's expected headers.

## Phase 7 — Push Notifications (APNs)

- Integrate `hapns` (or the user's preferred alternative). Requires the
  APNs Auth Key — ask for it per `SECURITY.md` if not yet provided.
- Store push tokens (from Phase 6 device registration) against passes.
- On `/update-points`, `/redeem`, or any pass-affecting mutation, bump the
  pass version and send a push telling Wallet to re-fetch.

**Definition of done:** triggering a points update results in a push sent
to APNs sandbox without error, and the underlying pass data reflects the
change on next fetch.

## Phase 8 — Admin Dashboard

- Next.js + Tailwind app under `dashboard/admin-panel/`: member list/search,
  issue a pass, adjust points, view redemption/visit history.
- Auth via the provider chosen in the open-decisions step.
- Any asset upload (custom pass art, brand images) goes through
  `storageService.js` to Supabase Storage — ask for the Supabase project
  URL + service role key here if not already provided in Phase 3.
- Talks to the Phase 4 API over HTTP.

**Definition of done:** dashboard builds and runs; the core flows (view
member, adjust points, view history) work end-to-end against the real API.

## Phase 9 — Hardening & Bug Sweep

- Fill test coverage gaps across all phases.
- Run install, build, lint, type-check, and the full test suite for the
  whole repo (backend + dashboard) and fix everything red.
- Re-check `SECURITY.md` compliance: no secrets in git history, `.gitignore`
  correct, no hardcoded credentials anywhere.
- Produce a short `RUNBOOK.md`: how to run locally, how to generate a test
  pass, how to install it on a device for manual testing.

**Definition of done:** clean install/build/lint/type-check/test across the
whole repo; `RUNBOOK.md` exists and its steps actually work as written.

## Phase 10 — Deployment

- Prepare the backend for the chosen host (Railway/Render): build config,
  HTTPS, domain. Ask for the relevant hosting/DNS credentials per
  `SECURITY.md` when you reach this point.
- Optional CI/CD pipeline (GitHub Actions) running install/build/lint/test
  on push — only wire real deploy credentials in if the user confirms they
  want auto-deploy, not just CI checks.
- Basic production monitoring/logging hook (even a simple uptime/log
  endpoint is fine to start).

**Definition of done:** the app is reachable over HTTPS at the configured
domain, `/health` responds in production, and CI (if requested) is green.

---

## Manual step this plan can't do for you

"Test on iPhone Wallet" from the original architecture requires a physical
device and can't be automated. At the end of Phase 2 (and again after any
`pass.json` change), produce a `.pkpass` file and tell the user how to get
it onto a device (AirDrop from a Mac, or email/host it and open the link on
the iPhone) and what a correctly rendered pass should look like.
