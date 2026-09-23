'use strict';

/**
 * APNs auth probe. Sends an empty Wallet pass push to an
 * all-zeros device token and reports what Apple returns:
 *   - 400/BadDeviceToken => key + IDs authenticate (expected: token is fake)
 *   - 403               => auth rejected (wrong Key ID / Team ID / key file)
 *   - network error     => APNs unreachable from here
 * Wallet passes use PRODUCTION APNs only (Apple docs), so this probes
 * production by default; APNS_USE_SANDBOX=true overrides for comparison.
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
  const useSandbox = process.env.APNS_USE_SANDBOX === 'true';
  console.log(`APNs probe: topic=${topic} useSandbox=${useSandbox}`);
  try {
    const res = await send(
      connector,
      BackgroundNotification(topic, { appData: {} }),
      Device('0'.repeat(64)),
      { useSandbox }
    );
    console.log('APNs response:', JSON.stringify(res).slice(0, 300));
  } catch (err) {
    console.log('APNs threw:', (err.message || String(err)).slice(0, 300));
  }
}

main().then(() => process.exit(0));
