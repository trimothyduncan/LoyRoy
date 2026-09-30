# Environment and Secret System

## Environments
Use distinct configuration for:
- development/local
- staging
- production

Never assume a staging secret is valid for production.

## Configuration lifecycle
For every variable:
SOURCE -> STORAGE -> INJECTION -> CONSUMER -> VALIDATION

Example:
Apple Developer credential
-> secret manager/Render environment
-> backend process
-> Apple signing module
-> signed pass verification

## Rules
- `.env.example` contains names/placeholders only.
- Real `.env` files remain ignored.
- Browser code receives only public variables.
- Service-role/admin credentials are backend-only.
- Never print secret values.
- Never commit secret material.
- Never copy production secrets into staging.
- If a secret is suspected compromised, stop and document rotation requirements.

## Diagnosing variable failures
Do not merely check whether a variable exists.

Check:
1. exact name expected by source code
2. environment in which it is expected
3. service receiving it
4. whether it is present
5. whether format is valid
6. whether the consumer actually reads it
7. whether the credential is authorized for the target resource
8. whether the deployment loaded the updated configuration

If a secret cannot safely be read, verify presence/metadata and perform a non-disclosing functional test.

## Environment matrix
Maintain `docs/ENVIRONMENT_MATRIX.md`.

## Canonical schema
Use `agent/ENVIRONMENT_SCHEMA.yaml`.
