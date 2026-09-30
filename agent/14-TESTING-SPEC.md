# Testing Specification

## Unit
Test:
- configuration validation
- domain logic
- wallet providers
- validation
- analytics calculations

## Integration
Test:
- API/database
- auth
- RLS
- Apple provider
- Google provider

## E2E
At minimum:
1. merchant login
2. create customer
3. create pass/template
4. generate Apple delivery
5. generate Google delivery
6. record loyalty event
7. view analytics

## Infrastructure
Verify:
- environment variables
- service health
- database connection
- deployment
- wallet credentials/functionality

## Regression rule
Every bug fixed should gain a regression test when practical.
