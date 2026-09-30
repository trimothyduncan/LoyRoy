# Deployment Specification

## Pipeline
local -> staging -> production

## Before staging
- tests
- typecheck
- lint if configured
- build
- migration review
- secret scan

## Staging
Deploy and verify:
- health
- auth
- database
- customer flow
- pass generation
- analytics

## Production
Only after staging gate passes.

## Rollback
Every production deployment must have a rollback/recovery plan appropriate to the change.

Do not claim deployment success based only on a platform status indicator.
