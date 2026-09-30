# Execution Plan

## Phase 0 — Audit
Deliver repository, infrastructure, dependency, environment, wallet, and failure audits.

Gate: `docs/AUDIT_REPORT.md` complete.

## Phase 1 — Foundation
Implement/verify:
- app structure
- configuration loader
- environment validation
- logging
- error handling
- authentication
- tenant/role model

Gate: authenticated tenant isolation tests pass.

## Phase 2 — Database
Implement/verify:
- organizations
- memberships
- customers
- pass templates
- passes
- wallet installations
- loyalty transactions
- analytics events
- audit logs
- indexes/constraints
- RLS

Gate: authorization tests pass.

## Phase 3 — Wallet domain
Implement provider-neutral wallet service and contracts.

Gate: provider-neutral tests pass.

## Phase 4 — Apple
Implement/verify pass generation, signing, identifiers, update/registration behavior where applicable, and download/update endpoints.

Gate: signed test pass generated and validated.

## Phase 5 — Google
Implement/verify issuer/class/object flow, JWT generation, and wallet delivery.

Gate: test loyalty object can be created/delivered using non-production/test configuration.

## Phase 6 — Merchant dashboard
Implement:
- overview
- customers
- passes/templates
- loyalty
- analytics
- team
- integrations
- settings

Gate: end-to-end merchant workflow works.

## Phase 7 — Analytics/CRM
Track events and derive dashboard metrics.

Gate: generated test events appear correctly.

## Phase 8 — Deployment
Validate local -> staging -> production configuration.

Gate: staging smoke tests pass before production.

## Phase 9 — Hardening
Run:
- unit tests
- integration tests
- E2E
- authorization tests
- secret scan
- dependency audit
- build
- deployment verification

Gate: Definition of Done passes.
