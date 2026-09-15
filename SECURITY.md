# Sensitive Data & Secrets Protocol

This is the rulebook for anything credential-shaped. It applies for the
entire session, not just at setup.

## Already provided — never ask for these

`certificates/signerCert.pem`, `certificates/signerKey.pem`, and
`certificates/wwdr.pem` are placed on disk before you start. Your tool
permissions (`opencode.json`) already deny your read/edit tools inside
`certificates/` and on `*.pem`/`*.key`/`*.p8`/`*.p12`/`*.pfx` files anywhere
in the project — that's intentional, not a bug. Application code can still
`fs.readFileSync` these paths fine at runtime when you run it through
`bash`; what's blocked is *you* pulling the raw key bytes into your own
context. If you need to confirm a file exists, use `bash` (`ls certificates/`,
`test -f certificates/signerKey.pem`) rather than your read tool.

## The stop-and-ask rule

Whenever a task needs a credential, API key, token, connection string,
account ID, or any file you don't already have, **stop before writing code
that depends on it** and ask the user for exactly three things:

1. **What** — the precise name of the value or file. "APNs Auth Key (.p8),
   its Key ID, and your Team ID" — not "Apple credentials."
2. **How** — if it isn't obvious how to obtain it, the concrete steps. E.g.
   "Apple Developer portal → Certificates, IDs & Profiles → Keys → create a
   new key with Apple Push Notifications service (APNs) enabled."
3. **Where** — the exact file path or `.env` variable name to place it. E.g.
   "save the file as `certificates/AuthKey_<KEYID>.p8`, and set
   `APNS_KEY_ID=` and `APNS_TEAM_ID=` in `.env`."

Do not fabricate a plausible-looking value and continue as though it were
real — that produces code that looks correct but fails silently later, and
much later than when it should have been caught. Obviously-fake placeholders
(`your-api-key-here`) belong only in `.env.example`, never in a code path
that could actually run.

## What you'll likely need to ask for, by phase

| Phase | Likely ask |
|---|---|
| 1 — Backend bootstrap | None, unless the user hasn't picked a hosting target for env parity. |
| 2 — Pass generation | Pass Type Identifier string and Team ID for `pass.json` — the cert alone doesn't tell you these; confirm the exact strings even though the cert already exists. |
| 3 — Database | Supabase project URL + service role key, **or** MongoDB connection URI, depending on which the user picked. |
| 5 — QR/scanner | Only if a specific hardware scanner needs a vendor SDK key (uncommon — most scanners just emit keystrokes). |
| 6 — Wallet web service | None new, reuses Phase 2/3 credentials. |
| 7 — Push notifications | APNs Auth Key (.p8) + Key ID + Team ID, or a push certificate + passphrase if the user prefers that route instead. |
| 8 — Admin dashboard | Clerk or Firebase Auth project keys (whichever the user picked); Supabase Storage credentials (project URL + service role key + bucket name) if not already collected in Phase 3. |
| 10 — Deployment | Hosting provider token (Railway/Render), domain/DNS access, any CI/CD secrets (e.g. a `GITHUB_PAT` if you enable the GitHub MCP server for PR automation). |

## Handling a secret once you receive it

- It goes in `.env` (already git-ignored). Never hardcode it in a source
  file, a comment, or a commit message.
- Before the first commit of the session, confirm `.gitignore` excludes
  `.env`, `certificates/`, `*.pem`, `*.key`, `*.p8`, `*.p12`, `*.pfx`.
- If the user pastes a secret directly into chat, use it to write the
  `.env` entry and don't echo it back in full in your response — confirm
  by variable name, not by value.
- If a `bash` command you want to run would print a secret to stdout (e.g.
  `cat .env`, `echo $APNS_KEY_ID`), avoid it; check presence with something
  that doesn't reveal the value (`test -n "$VAR"`, or grep for the key name
  only).
