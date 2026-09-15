# API Spec

Two separate route groups. Don't conflate them — they have different
callers and different auth models.

## A. Application API (your own business logic)

Called by the admin dashboard, the redemption/scanner UI, and internal
services. Protect all of these with your chosen auth (session/API key for
the dashboard; a service-level secret for scanner devices).

| Method | Path | Body (request) | Response | Notes |
|---|---|---|---|---|
| `POST` | `/create-pass` | `{ customerProfile, tier }` | `.pkpass` binary (`Content-Type: application/vnd.apple.pkpass`) or `{ downloadUrl }` | Creates the customer record if new, generates and signs the pass, persists the serial number against the member. |
| `POST` | `/update-points` | `{ memberId, pointsDelta, reason }` | `{ memberId, newBalance }` | Server computes the new balance — never accept a client-supplied absolute balance. Should trigger a pass-field update + push. |
| `POST` | `/redeem` | `{ memberId or serialNumber, rewardId }` | `{ success, newBalance, redemptionId }` | Validate reward eligibility and sufficient balance server-side before mutating anything. |
| `GET` | `/member/:id` | — | `{ memberId, tier, pointsBalance, passSerialNumber, lastVisit, ... }` | |
| `POST` | `/register-device` | `{ memberId, deviceToken, platform }` | `{ success }` | This is *your* app-level device/push-token record — distinct from Apple's own Wallet device registration in section B below. Used so you know who to notify on updates. |
| `POST` | `/push-update` | `{ memberId or serialNumber }` | `{ success }` | Triggers an APNs push telling Wallet to re-fetch the latest pass. Internal/admin-triggered, not public. |

## B. Apple Wallet Web Service (Apple-mandated protocol)

Apple Wallet itself calls these routes automatically once a pass is added
to a device — you don't call them from your own frontend. The required
operations, per Apple's PassKit Web Service Reference, are:

- **Register a device** for push notifications about a pass (device library
  identifier + pass type identifier + serial number, with a push token in
  the body).
- **Unregister a device** for a pass.
- **Return the serial numbers of passes that have changed** since a given
  tag, for a device.
- **Return the latest version of a pass** (signed `.pkpass`, matching the
  cert used to originally sign it).
- **Log errors** the device reports.

The exact route shapes, HTTP methods, and required headers
(`Authorization: ApplePass <token>`, `If-Modified-Since`, etc.) are part of
a fairly stable but precise Apple spec — **pull the current PassKit Web
Service Reference via Context7 or a web search before implementing this
section rather than guessing from memory**, and match it exactly. A
mismatched route or header here fails silently on-device, which is much
harder to debug than a normal HTTP error.

Auth for this section is Apple's own scheme (the `authenticationToken` you
embed in each pass at generation time), not your dashboard auth.

## Error handling (both groups)

- Consistent error shape: `{ error: { code, message } }`.
- 4xx for client/validation errors, 5xx only for genuine server faults.
- Never leak stack traces or internal identifiers in error responses.
