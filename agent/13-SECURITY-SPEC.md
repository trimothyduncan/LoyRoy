# Security Specification

## Secrets
Never commit or display:
- private keys
- API tokens
- database passwords
- service-role keys
- signing secrets
- Render/GitHub access tokens

## Authentication
Use secure session/token handling appropriate to the selected stack.

## Authorization
Enforce:
- tenant isolation
- role permissions
- server-side checks
- database RLS where applicable

## API security
Use:
- input validation
- rate limiting where appropriate
- secure headers
- safe error messages
- audit logging

## Logging
Logs must be useful without exposing credentials or personal data unnecessarily.

## Dependency/security checks
Run available secret scanners and dependency audits before release.
