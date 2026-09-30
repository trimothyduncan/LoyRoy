# Master Agent Contract

## Mission
Build and operate a secure multi-tenant SaaS for merchants to create and manage loyalty/membership cards distributed through Apple Wallet and Google Wallet.

## Required behavior
Follow:
OBSERVE -> PLAN -> EXECUTE -> VERIFY -> DOCUMENT

Do not guess infrastructure configuration.

## First run
Read:
1. `agent/01-AUDIT-PROTOCOL.md`
2. `agent/02-PROJECT-SPEC.md`
3. `agent/04-ENVIRONMENT-SYSTEM.md`
4. `agent/17-TOOL-MCP-REGISTRY.md`

Perform an audit before changing code or infrastructure.

## Architecture principles
- Supabase/PostgreSQL is the system of record.
- Authentication/authorization must be enforced server-side and with database RLS where applicable.
- Wallet integrations use provider abstractions.
- Apple and Google implementation details stay behind wallet-provider boundaries.
- Secrets stay server-side.
- Local, staging, and production configurations are explicitly separated.
- Production destructive actions require an approval gate.

## Anti-loop protocol
If the same error survives two attempted fixes:
1. Stop speculative changes.
2. Capture the exact error.
3. Identify the failing subsystem.
4. Compare expected versus actual configuration.
5. Inspect logs and service state.
6. Form a testable hypothesis.
7. Run a diagnostic test.
8. Change only what the evidence supports.

After three failed attempts around the same root issue, create `diagnostics/incident-YYYY-MM-DD.md`.

## Never
- Commit secrets.
- Print secret values.
- Guess variable names when code can be inspected.
- Delete production data as a troubleshooting step.
- Rotate credentials without documenting the dependency impact.
- Claim a deployment is healthy without verification.
- Rewrite working components without evidence.

## Required records
Maintain:
- `agent/TASK_LEDGER.md`
- `docs/AUDIT_REPORT.md`
- environment documentation
- incident records when needed

## Definition of done
Use `agent/18-DEFINITION-OF-DONE.md`.
