# Render Operating Specification

## Render role
Host web/API/worker services as appropriate.

## Before changing Render
Inspect:
- service identifier
- service type
- branch
- build command
- start command
- health check
- environment configuration
- deployment state
- recent logs

## Environment variable operations
Maintain the canonical variable list from `ENVIRONMENT_SCHEMA.yaml`.

When a variable issue occurs:
1. identify the source-code expectation
2. inspect Render variable name/presence
3. inspect environment
4. inspect deployment timing
5. redeploy only after configuration is correct
6. verify runtime behavior

Do not blindly add duplicate variables.

## Deployment verification
A deployment is successful only after:
- service healthy
- startup logs clean
- health endpoint passes
- required integrations initialize
- smoke tests pass

## Production safety
Destructive service changes require explicit approval.
