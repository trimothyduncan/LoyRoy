# First-Run Audit Protocol

## Goal
Determine what exists before changing it.

### A. Repository
Inspect:
- framework/language
- package manager
- frontend/backend
- database layer
- auth
- wallet integrations
- tests
- Docker/CI
- Render configuration
- Supabase configuration
- environment examples
- Git history and current branch

### B. Dependencies
Record runtime and major package versions. Identify conflicts/deprecations. Do not perform broad upgrades during audit.

### C. Environment variables
Search the entire repository for environment-variable references. Build a matrix:
- canonical name
- consumer
- environment
- source
- secret/non-secret
- required/optional
- validation method

Compare against `agent/ENVIRONMENT_SCHEMA.yaml`.

### D. Supabase
Using authorized tools if available, inspect:
- project/environment
- migrations
- tables
- RLS
- auth
- storage
- functions
- relevant configuration

Never expose secret values.

### E. Render
Inspect:
- services
- service type
- build/start commands
- health checks
- environment-variable names/presence
- deployment state
- recent logs
- domains

Do not print secret values.

### F. Apple
Determine:
- Pass Type ID
- Team ID
- certificate/key approach
- signing implementation
- pass package structure
- update/web-service implementation

### G. Google
Determine:
- issuer
- service account approach
- loyalty class/object implementation
- JWT/API implementation

### H. Decision
Classify each major subsystem:
- KEEP
- REFACTOR
- REPLACE
- UNKNOWN

Then write `docs/AUDIT_REPORT.md`.

Do not modify infrastructure during the audit. Application code may only be changed if absolutely required for diagnostics and the change is reversible and documented.

## Audit completion gate
Do not proceed to build until:
- environment matrix exists
- Render state is known
- Supabase state is known
- Apple state is known
- Google state is known
- current failures are documented
- architecture recommendation exists
- migration/reset strategy exists
