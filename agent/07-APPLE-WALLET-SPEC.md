# Apple Wallet Specification

## Goal
Generate and maintain signed Apple Wallet passes for merchant loyalty/membership programs.

## Credentials/configuration
The implementation may require values such as:
- Team ID
- Pass Type ID
- certificate/key identifiers
- private signing material
- web-service configuration

Use the actual implementation and current Apple documentation to determine exact requirements.

## Security
Private signing material is backend-only.

Never:
- put private keys in client code
- commit certificate private material
- print private keys
- expose signing credentials through API responses

## Provider boundary
Expose domain-level operations rather than Apple-specific calls throughout the application.

## Verification
Test:
- pass package generation
- manifest/signature generation
- MIME/download behavior
- serial/identifier uniqueness
- update flow where implemented
- authorization for pass-related endpoints
