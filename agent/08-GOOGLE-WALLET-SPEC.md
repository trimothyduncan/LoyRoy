# Google Wallet Specification

## Goal
Create and manage loyalty cards using Google Wallet APIs.

## Credentials/configuration
Use a server-side Google service account or current Google-supported credential mechanism.

Never expose service-account private keys to clients.

## Provider boundary
Keep issuer/class/object and JWT/API details inside the Google provider.

## Verification
Test:
- class configuration
- object creation/update
- JWT generation
- delivery link/flow
- authorization
- error handling
