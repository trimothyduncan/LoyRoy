# Migration 002 — Multi-tenant extension (DRAFT, NOT APPLIED)

Status: proposed 2026-10-01, trialed on dev, APPLIED live 2026-10-01 (authorized "proceed").
Live result: 17 tables, 34 deny policies, tiers intact (5), default-org insert proven, test row removed.

Target: `agent/09-DATABASE-SCHEMA.md` domain model, reached incrementally from the live
single-tenant schema (migration 001) without breaking the working pilot backend.

## Mapping: what already exists vs what is new

| Spec entity | Verdict | Reasoning |
|---|---|---|
| organizations | NEW TABLE | Tenant root; everything tenant-owned hangs off `org_id`. |
| organization_memberships | NEW TABLE | user_id (future auth identity) + org_id + role (`owner`/`staff`), unique per pair. |
| customers | MAP to `members` | `members` already is the customer entity (name/email/phone/tier/points). No duplicate table; a rename is deferred to avoid breaking routes, tests, and Apple web-service lookups. |
| pass_templates | NEW TABLE | Template = reusable pass art + style + tier rules per org. `passes/vipMembership.pass/` becomes seed content later, not schema. |
| passes | NEW TABLE (lifecycle) | One row per issued pass: org, member, template, platform (`apple`/`google`), provider serial/token, status (`active`/`archived`/`revoked`), timestamps. Replaces ad-hoc `members.pass_serial` as the source of truth over time; `members.pass_serial` kept during transition. |
| wallet_installations | NEW TABLE | Generalizes `apple_devices`/`apple_registrations` across providers (device ref, platform, push token, pass ref). Apple tables kept during transition. |
| loyalty_accounts | MAP to `members.points_balance` | Balance cache column already exists; documented as the account. No new table. |
| loyalty_transactions | MAP to `points_ledger` | Append-only ledger with `balance_after` already exists. No new table. |
| analytics_events | NEW TABLE | Append-only event log (`CUSTOMER_CREATED`, `PASS_CREATED`, `PASS_UPDATED`, `PASS_DELIVERED`, `WALLET_ADDED`, `VISIT_RECORDED`, `REWARD_REDEEMED`, `PASS_ARCHIVED`, …). Dashboard metrics derive from this, not counters. |
| audit_logs | NEW TABLE | Who did what, when, to which org row (actor, action, entity, entity_id, metadata). |

## Compatibility strategy (why the pilot keeps working)

1. One seeded `organizations` row: "Default Organization". All new `org_id` columns are
   `NOT NULL DEFAULT <default-org-id>` — existing inserts (which supply no org) keep working unchanged.
2. No existing table is altered beyond `ADD COLUMN org_id` (+ index). No renames, no drops, no type changes.
3. New tables are additive and empty; nothing reads them until backend phases land (provider service, dashboard).
4. RLS is enabled everywhere but service-role traffic (the only current consumer) bypasses RLS by design;
   `anon`/`authenticated` get explicit deny-all until the dashboard session model exists.

## RLS posture

- `ENABLE ROW LEVEL SECURITY` on all `public` tables (old + new).
- Policies: `FOR ALL ... USING (false)` for `anon` and `authenticated` (deny by default).
- `service_role` bypasses RLS (Postgres default; no policy needed) — backend behavior unchanged.
- Future per-tenant policies (documented, not created): `auth.uid()` -> `organization_memberships` -> `org_id`
  equality on each tenant table, plus `TO authenticated` grants. To be added with the dashboard session work.

## Rollout plan (after approval)

1. Review this design + draft SQL (this step).
2. Trial on dev project (DONE 2026-10-01 on `loyroy` dev project `cwasokjmtcurrdwdlwin`):
   001 baseline applied, 002 draft applied, 17 tables + 34 deny policies verified, default-org
   insert proven (member without org_id lands in default org), check-constraint negatives rejected
   (bad role, bad platform), full new-table roundtrip (template -> pass -> installation -> event ->
   audit) with cascade cleanup to zero rows. Trial rows fully removed; dev holds only tier seeds +
   default org. Learnings folded back into the draft (full policy loop with rerun guards).
3. Apply to staging (to be created); verify.
4. Back up live (Supabase dashboard backup / `pg_dump`); apply to live during low-traffic window;
   verify via `/admin/diag-supabase` + smoke; rollback = restore backup + note in
   `diagnostics/incident-YYYY-MM-DD.md` if anything deviates.
5. Backend phases follow separately: tenant-scoped queries, `passes` lifecycle reads, event emission,
   dashboard session auth — each with its own tests.

## Rollback

Additive-only: drop new tables + `org_id` columns in reverse order. No pilot data is reshaped, so a
rollback loses only rows written to the new tables after cutover (none exist until backend phases land).
