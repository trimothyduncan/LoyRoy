# Product Specification

## Product
Multi-tenant merchant SaaS for loyalty/membership cards on Apple Wallet and Google Wallet.

## Actors
### Platform admin
Platform-wide organizations, health, integrations, analytics, and billing configuration.

### Organization owner
Organization profile, staff, customers, pass templates, passes, loyalty, analytics, settings.

### Staff
Only explicitly authorized operational actions such as customer lookup, customer creation, loyalty activity, and redemption.

## Core features
1. Authentication
2. Multi-tenancy
3. Customer CRM
4. Pass templates
5. Apple Wallet
6. Google Wallet
7. Loyalty activity
8. Analytics
9. Audit logs
10. Team/roles
11. Settings
12. Deployment/operations

## Product architecture
Business logic must use a provider-neutral wallet service.

Conceptually:
WalletService
- AppleWalletProvider
- GoogleWalletProvider

Typical domain operations:
- create pass
- update pass
- archive/revoke pass
- generate wallet delivery
- synchronize wallet state

Do not hard-code provider details into unrelated dashboard/business logic.
