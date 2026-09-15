# Loyalty & Membership Platform — Agent Instructions

Node.js/Express backend (plus admin dashboard) that issues, updates, and
manages Apple Wallet loyalty/membership passes, built around
`passkit-generator` — specifically the package from
[alexandercerutti/passkit-generator](https://github.com/alexandercerutti/passkit-generator),
not a fork or rewrite. This file is your top-level operating manual. The full
detail lives in three files that are auto-loaded alongside this one — read
them, don't just skim:

- `docs/PROJECT_PLAN.md` — the phase-by-phase build plan and each phase's
  Definition of Done.
- `docs/TECH_STACK.md` — chosen libraries, folder layout, conventions.
- `docs/API_SPEC.md` — endpoint contracts.
- `docs/SECURITY.md` — the sensitive-data protocol. **Read this one first.**
  It is non-negotiable.

## Already done — do not redo, do not ask about

Apple Developer Program enrollment, the Pass Type Identifier, the Wallet
signing certificate, and the WWDR certificate were completed outside this
agent, before this session starts. The three exported PEM files already sit
in `certificates/` (`signerCert.pem`, `signerKey.pem`, `wwdr.pem`). Reference
them by file path from code and env vars. Per `docs/SECURITY.md`, never open
them with your read tool, never print or log their contents, never commit
them — your tool permissions already block reading or editing that folder,
so route any inspection through `bash` (e.g. `ls`, `test -f`) instead.

## Operating loop

Work through `docs/PROJECT_PLAN.md` one phase at a time:

1. **Plan** — add or update todo items (via the built-in todo list) for the
   phase's tasks and its Definition of Done, before writing code.
2. **Write** — implement the smallest coherent slice, following
   `docs/TECH_STACK.md` conventions.
3. **Review** — after every meaningful change, run the project's install,
   build, lint, type-check, and tests. Fix failures immediately; don't move
   on with a phase half-passing.
4. Only check off a phase's todos when its Definition of Done is fully met.

Don't jump ahead into a later phase to chase scope — finish the current one
first. If a later phase reveals the current one needs rework, go back and
fix it before continuing forward.

Before Phase 1, confirm the open architecture decisions listed at the top of
`docs/PROJECT_PLAN.md` (database, auth provider, hosting, JS vs TypeScript)
in a single batched question rather than asking piecemeal as you go.

## Stopping condition

Do not report the project complete until **all** of the following hold:

- Every phase in `docs/PROJECT_PLAN.md` is done and its Definition of Done
  is met.
- The whole repo installs, builds, lints, type-checks, and passes its test
  suite with zero errors (resolve warnings or explicitly justify why one is
  left).
- The server boots cleanly and its health-check endpoint responds.
- A sample `.pkpass` can be generated end-to-end with no manual patching,
  and validates as a well-formed pass (correct pass.json, signed manifest).

If you hit a genuine blocker — a missing credential, a step that requires a
physical iPhone, an ambiguous product decision — pause **only** for that
specific blocker, ask for it precisely per `docs/SECURITY.md`, and keep
making progress on everything else that isn't blocked by it. Don't stall the
whole session on one missing value.

## Non-negotiables

- Never invent a placeholder secret that looks real and wire it in as if
  functional. Obviously-fake placeholders belong only in `.env.example`,
  never in code paths that could run or ship.
- Never commit `.env`, `certificates/`, or any `*.pem` / `*.key` / `*.p8` /
  `*.p12` / `*.pfx` file. Verify `.gitignore` covers them before your first
  commit of the session.
- Points, tiers, and reward balances are computed and mutated server-side
  only. Never trust a client-supplied balance or apply a redemption without
  a server-side check against current state.
- Before implementing against `passkit-generator`, Apple's Wallet Web
  Service protocol, or APNs, use the Context7 MCP server (already
  configured) to pull current docs rather than relying on memory — these
  APIs move faster than training data, and a wrong field name in a signed
  pass fails silently on-device.
- Testing "on iPhone Wallet" (from the original plan) can't be automated by
  you. Instead: produce a downloadable, valid `.pkpass` file and clear
  instructions for the user to AirDrop or email it to a device themselves,
  and tell them what a correct render should look like.
