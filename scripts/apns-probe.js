'use strict';

/**
 * APNs sandbox auth probe. Sends an empty Wallet pass push to an
 * all-zeros device token in SANDBOX and reports what Apple returns:
 *   - 400/BadDeviceToken => key + IDs authenticate (expected: token is fake)
 *   - 403               => auth rejected (wrong Key ID / Team ID / key file)
 *   - network error     => sandbox unreachable from here
 * Usage: node scripts/apns-probe.js
 */

require('dotenv').config();
const fs = require('node:fs');

async function main() {
  const key = new Uint8Array(fs.readFileSync(process.env.APNS_KEY_PATH));
  const { TokenConnector } = await import('hapns/connectors/token');
  const { BackgroundNotification } = await import('hapns/notifications/BackgroundNotification');
  const { Device } = await import('hapns/targets/device');
  const { send } = await import('hapns/send');

  const connector = TokenConnector({
    key,
    keyId: process.env.APNS_KEY_ID,
    teamIdentifier: process.env.APNS_TEAM_ID,
  });
  const topic = process.env.APNS_TOPIC || process.env.PASS_TYPE_IDENTIFIER;
  try {
    const res = await send(
      connector,
      BackgroundNotification(topic, { appData: {} }),
      Device('0'.repeat(64)),
      { useSandbox: true }
    );
    console.log('APNs response:', JSON.stringify(res).slice(0, 300));
  } catch (err) {
    console.log('APNs threw:', (err.message || String(err)).slice(0, 300));
  }
}

main().then(() => process.exit(0));
