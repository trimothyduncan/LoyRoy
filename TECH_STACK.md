# Tech Stack & Conventions

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | Node.js + Express | Pin Node to an LTS version in `.nvmrc` / `engines`. |
| Wallet pass generation | `passkit-generator` — **use only** the package published from [alexandercerutti/passkit-generator](https://github.com/alexandercerutti/passkit-generator) (npm: `npm install passkit-generator`, currently v3.x, author Alexander Patrick Cerutti). Do **not** substitute a fork, a rewrite, or a similarly-named package (e.g. `passkit-generator.js`) even if one turns up in a search — only this repo/package. | Actively maintained. Pull current API docs via Context7 before writing pass-generation code — the constructor/signing API has changed across major versions. |
| Push notifications | [`hapns`](https://github.com/alexandercerutti/hapns) | Also by Alexander Cerutti, built specifically to pair with `passkit-generator` for APNs push. Prefer it over a generic APNs library unless the user has a reason not to. |
| Database | Supabase (Postgres) **or** MongoDB — ask the user, see `PROJECT_PLAN.md` | Don't default silently; the schema and query code differ enough that guessing wrong wastes a phase. |
| Admin dashboard | Next.js + Tailwind CSS | Separate app/workspace from the API, talks to it over HTTP. |
| Authentication | Clerk **or** Firebase Auth — ask the user | Used for the dashboard; the public wallet endpoints (device registration, pass fetch) follow Apple's own auth scheme instead (see `API_SPEC.md`). |
| QR / scanner | [`html5-qrcode`](https://www.npmjs.com/package/html5-qrcode) | Covers webcam and iPhone-camera scanning in-browser. Dedicated hardware scanners typically emit keystrokes (HID keyboard-wedge mode) — no SDK needed, just an input listener on the redemption screen. |
| Hosting (compute) | Railway or Render — ask the user | Runs the Express app itself (API + Apple Wallet Web Service + APNs sender). Decided separately from storage below — Supabase doesn't host a long-running Express process the way these do. |
| File storage | **Supabase Storage** (decided) | S3-compatible object storage for pass assets (icon/logo/strip art) and any member-uploaded images. Uses the Supabase project's URL + service role key, same as the database if Supabase was also picked for that — otherwise it's a Supabase project used for storage only. |
| Notifications | Apple APNs (via `hapns`) | |
| Version control | Git, GitHub | Plain `git` over `bash` covers this; the GitHub MCP server in `opencode.json` is optional and disabled by default — enable it only if the user wants PR/issue automation beyond what `git` CLI gives you. |

Ask once, up front (see `PROJECT_PLAN.md`), for: database choice, auth
provider, compute hosting target, and JavaScript vs TypeScript. File
storage is already decided (Supabase Storage) — don't re-ask that one.
Don't re-litigate any of these mid-build.

## Folder structure

```
project-root/
├── certificates/
│   ├── signerCert.pem
│   ├── signerKey.pem
│   └── wwdr.pem
│
├── passes/
│   └── vipMembership.pass/
│       ├── icon.png
│       ├── icon@2x.png
│       ├── logo.png
│       ├── strip.png
│       └── pass.json
│
├── routes/
│   ├── createPass.js
│   ├── updatePass.js
│   └── members.js
│
├── database/
│   └── schema.js
│
├── services/
│   ├── walletService.js      # passkit-generator wrapper
│   ├── pushService.js        # hapns wrapper
│   ├── qrService.js
│   └── storageService.js     # Supabase Storage wrapper (pass assets, uploads)
│
├── dashboard/
│   └── admin-panel/          # separate Next.js app
│
├── app.js
├── package.json
├── .env
├── .env.example
└── .gitignore
```

Adjust freely (e.g. `src/` layout, TypeScript paths) but keep the same
separation of concerns: pass generation, push, and QR/redemption logic each
stay in their own service module rather than living inline in route
handlers — you'll need to call `walletService` from multiple routes
(create, update-points, redeem) and want one place that owns cert loading.

## Conventions

- Load certificate paths from env vars (`SIGNER_CERT_PATH`,
  `SIGNER_KEY_PATH`, `WWDR_PATH`, and a `SIGNER_KEY_PASSPHRASE` if the key
  is encrypted), defaulting to the `certificates/` paths above — don't
  hardcode absolute paths.
- Every pass mutation (points update, redemption, tier change) should bump
  the pass's version/serial state and enqueue a push, not just update the
  database silently — otherwise the Wallet app on-device goes stale.
- Validate all external input (route bodies, QR payloads) before touching
  the database or generating a pass; malformed QR data should fail closed,
  not throw an unhandled exception.
