# API Specification

## Principles
- authenticated by default
- tenant-aware
- validated inputs
- structured errors
- server-side authorization
- idempotent operations where appropriate
- audit significant mutations

## Domains
- auth
- organizations
- members
- customers
- pass templates
- passes
- wallet delivery
- loyalty
- analytics
- integrations
- health

## Example operations
POST customer
GET customers
POST pass template
POST pass
GET pass
PATCH pass
POST wallet/apple/delivery
POST wallet/google/delivery
POST loyalty/transaction
GET analytics/overview

Exact routes must follow the framework already used or the architecture selected during audit.

## Health endpoints
Provide safe health/readiness checks that do not expose secrets.
