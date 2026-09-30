# Database Domain Model

The final schema must be based on the audited codebase and product requirements. The following is the target domain model, not a command to blindly create every field.

## Core entities
- organizations
- users/auth identities
- organization_memberships
- customers
- pass_templates
- passes
- wallet_installations
- loyalty_accounts
- loyalty_transactions
- analytics_events
- audit_logs

## Relationships
organization
-> memberships
-> customers
-> templates
-> passes
-> loyalty activity
-> analytics
-> audit logs

## Pass model
A pass should identify:
- organization
- customer
- template
- platform/provider
- provider-specific identifiers
- lifecycle status
- timestamps

## Analytics
Use event records rather than hard-coded counters as the sole source of truth.

Example events:
- CUSTOMER_CREATED
- PASS_CREATED
- PASS_UPDATED
- PASS_DELIVERED
- WALLET_ADDED
- VISIT_RECORDED
- REWARD_REDEEMED
- PASS_ARCHIVED

## Data integrity
Use:
- foreign keys
- unique constraints
- check constraints where useful
- indexes based on access patterns
- RLS
