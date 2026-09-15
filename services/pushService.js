'use strict';

/**
 * services/pushService.js — APNs sender via hapns.
 *
 * Wallet pass updates are empty background pushes: the device receives the
 * push and re-fetches the pass from the web service (Phase 6). Topic is the
 * pass type identifier.
 *
 * notifyPassUpdated() NEVER throws: routes await it after mutating state,
 * and a push failure must not fail the underlying points/redemption write.
 * Without APNs credentials (or devices) it reports { sent: false, reason }.
 *
 * Required env for real sends (see SECURITY.md for how to obtain):
 *   APNS_KEY_PATH (./certificates/AuthKey_<KEYID>.p8), APNS_KEY_ID,
 *   APNS_TEAM_ID, and APNS_TOPIC (defaults to PASS_TYPE_IDENTIFIER).
 * Sandbox is used unless NODE_ENV=production.
 */

const fs = require('node:fs');

let connectorCache = null;

function apnsConfigured() {
  return Boolean(process.env.APNS_KEY_PATH && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

async function loadConnector() {
  if (connectorCache) return connectorCache;
  const { TokenConnector } = await import('hapns/connectors/token');
  const keyPath = process.env.APNS_KEY_PATH;
  let keyBytes;
  try {
    keyBytes = new Uint8Array(fs.readFileSync(keyPath));
  } catch (err) {
    throw new Error(`APNs key unreadable at ${keyPath}: ${err.message}`);
  }
  connectorCache = TokenConnector({
    key: keyBytes,
    keyId: process.env.APNS_KEY_ID,
    teamIdentifier: process.env.APNS_TEAM_ID,
  });
  return connectorCache;
}

/** Push tokens of devices registered for this pass serial. Never logged. */
async function getPushTokens(db, serialNumber) {
  const { data: regs, error } = await db
    .from('apple_registrations')
    .select('device_library_id')
    .eq('serial_number', serialNumber);
  if (error) throw new Error(`database: ${error.message}`);
  const tokens = [];
  for (const { device_library_id } of regs) {
    const { data: device, error: deviceError } = await db
      .from('apple_devices')
      .select('push_token')
      .eq('device_library_id', device_library_id)
      .maybeSingle();
    if (deviceError) throw new Error(`database: ${deviceError.message}`);
    if (device && device.push_token) tokens.push(device.push_token);
  }
  return tokens;
}

async function realSend(connector, topic, pushToken, useSandbox) {
  const { BackgroundNotification } = await import('hapns/notifications/BackgroundNotification');
  const { Device } = await import('hapns/targets/device');
  const { send } = await import('hapns/send');
  // Empty background push: tells Wallet to re-fetch the pass. No alert body.
  return send(connector, BackgroundNotification(topic, { appData: {} }), Device(pushToken), {
    useSandbox,
  });
}

async function notifyPassUpdated(serialNumber, { db = null, sender = null } = {}) {
  const report = (result) => {
    // Server-side only (Render logs). Counts and reasons — never device tokens.
    console.log(`push ${serialNumber}: ${JSON.stringify(result)}`);
    return result;
  };
  try {
    if (!apnsConfigured()) return report({ sent: false, reason: 'APNS_NOT_CONFIGURED' });
    if (!db) return report({ sent: false, reason: 'NO_DATABASE' });

    const tokens = await getPushTokens(db, serialNumber);
    if (tokens.length === 0) return report({ sent: false, reason: 'NO_REGISTERED_DEVICES' });

    const topic = process.env.APNS_TOPIC || process.env.PASS_TYPE_IDENTIFIER;
    if (!topic) return report({ sent: false, reason: 'APNS_TOPIC_NOT_CONFIGURED' });
    const useSandbox = process.env.NODE_ENV !== 'production';
    const connector = sender ? null : await loadConnector();

    const results = await Promise.allSettled(
      tokens.map((token) =>
        sender
          ? sender(topic, token, useSandbox)
          : realSend(connector, topic, token, useSandbox)
      )
    );
    const delivered = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - delivered;
    const outcome = {
      sent: delivered > 0,
      delivered,
      failed,
      useSandbox,
      ...(failed > 0 ? { reason: 'SOME_DELIVERIES_FAILED' } : {}),
    };
    return report(outcome);
  } catch (err) {
    return report({ sent: false, reason: err.message });
  }
}

// Test-only: drop the cached connector between tests.
function _reset() {
  connectorCache = null;
}

module.exports = { notifyPassUpdated, _reset };
