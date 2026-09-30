# Supabase Operating Specification

## Role
Supabase/PostgreSQL is the system of record.

## Required capabilities
- database
- migrations
- authentication
- RLS
- storage when needed
- server-side functions when justified

## Rules
- Prefer migrations over manual production schema edits.
- Every tenant-owned table requires an authorization strategy.
- RLS is mandatory where client-accessible data could cross tenants.
- Service-role access is backend-only.
- Add indexes based on actual query patterns.
- Use foreign keys and constraints for integrity.
- Never use production as a scratch environment.

## Safe migration workflow
1. Inspect current schema.
2. Create migration.
3. Apply to development.
4. Run tests.
5. Apply to staging.
6. Verify.
7. Back up/confirm rollback strategy where appropriate.
8. Apply to production only after gate approval.

## Required verification
Test:
- tenant isolation
- role permissions
- CRUD
- constraints
- migrations
