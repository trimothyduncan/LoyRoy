# Task Ledger

| ID | Status | Objective | Dependencies | Affected Areas | Verification | Evidence | Blocker |
|---|---|---|---|---|---|---|---|
| AUDIT-001 | DONE | Complete first-run audit | None | Repo/Infra | Audit report exists | docs/AUDIT_REPORT.md complete 2026-09-30; Phase 1 authorized on that basis; checkpoint `audit-baseline-2026-09-30` on branch `refactor/phase1-env-foundation` | Live Supabase/Render API unverified (no MCP capability; file-based verification only) |
| ENV-001 | DONE | Reconcile environment variables (Phase 1 docs-level; code renames deferred) | AUDIT-001 | Config/Render | Environment validation passes | Matrix verified 2026-09-30: smoke 4/5 (5th explained — local Supabase creds present), tests 47/47, lint clean, `env.example` duplicate removed, compat mappings preserved. Live Render (via One CLI): 3 services all live on a01c877, api/admin env keys match blueprint exactly, api /health 200 | Code renames deferred; legacy `LoyRoy` Render service (zero env vars) needs suspend/delete approval; Supabase live unverified; APNS local filename mismatch open |
| DB-001 | DONE | Multi-tenant schema + RLS live (per-tenant session policies follow with dashboard auth) | AUDIT-001 | Supabase | Schema/RLS tests pass | 002 applied live 2026-10-01: 17 tables, 34 deny policies, tiers intact, default-org compat + cleanup verified; trial record in 002 design doc | Per-tenant policies await session-auth phase (APP-001) |
| DB-002 | TODO | Apply 001+bucket+002 to the APP database (clepxujvgyhdahwhpsmx; Phase 2 went to wrong visible project) | DB-001 | Supabase | 17 tables + bucket verified on app DB | Pack ready: database/migrations/APPLY-TO-REAL-PROJECT.sql (paste into dashboard SQL editor) | No API path (Forbidden); needs dashboard access |
| APP-002 | DONE | Deploy Apple fixes (idempotent unregister + serials/fetch logging) to Render | AUDIT-001 | Render/API | Live logs show new lines; retry storm ends | Merged + pushed to main; deploy dep-daurhno473hc73a1lm90 (b6dd463) live | Verify retry storm ends after device cleanup |
| WALLET-001 | DONE | Verify wallet provider architecture | AUDIT-001 | Apple/Google | Provider tests pass | services/wallet/ facade (WalletService + AppleWalletProvider) + tests/walletFacade.test.js (9 tests); suite 56/56, lint clean; existing Apple routes untouched | Google provider still unimplemented by design (501 contract) |
| APP-001 | TODO | Complete dashboard foundation | DB-001 | Web/API | E2E smoke test | | |
| DEP-001 | TODO | Deploy staging | ENV-001, APP-001 | Render | Staging health/smoke | | |

## Status values
TODO / IN_PROGRESS / BLOCKED / DONE / CANCELLED

Update this ledger as work progresses.
