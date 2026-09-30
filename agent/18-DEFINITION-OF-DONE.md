# Definition of Done

A milestone is complete only when all applicable items are true.

## Code
- implementation exists
- no known dead-end path
- errors handled
- types/build pass

## Security
- secrets not committed
- authorization enforced
- tenant isolation verified
- sensitive logs reviewed

## Database
- migration exists
- constraints/RLS verified
- tests pass

## Wallet
- Apple flow verified where enabled
- Google flow verified where enabled
- provider errors handled

## Dashboard
- authorized users can perform intended workflow
- tenant isolation verified
- analytics reflect test events

## Infrastructure
- environment matrix current
- Render deployment healthy
- Supabase state verified

## Testing
- unit tests
- integration tests
- E2E/smoke tests where applicable

## Documentation
- architecture updated
- environment docs updated
- deployment notes updated
- known limitations documented

## Evidence
The agent must be able to point to commands, logs, tests, or service state supporting completion.
