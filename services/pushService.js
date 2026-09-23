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
 * Apple Wallet pass pushes work ONLY in production APNs
 * (https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes).
 * This module therefore always uses production unless APNS_USE_SANDBOX=true
 * is set explicitly (local manual probing only — never for real devices).
 */

const fs = require('node:fs');
const config = require('../config');

let connectorCache = null;

function apnsConfigured() {
  return Boolean(process.env.APNS_KEY_PATH && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

async function loadConnector() {
  if (connectorCache) return connectorCache;
  const { TokenConnector } = await import('hapns/connectors/token');
  const keyPath = config.apnsKeyPath;
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

/** Push targets registered for this pass serial. Tokens are never logged. */
async function getPushTargets(db, serialNumber) {
  const { data: regs, error } = await db
    .from('apple_registrations')
    .select('device_library_id')
    .eq('serial_number', serialNumber);
  if (error) throw new Error(`database: ${error.message}`);
  const targets = [];
  for (const { device_library_id } of regs) {
    const { data: device, error: deviceError } = await db
      .from('apple_devices')
      .select('push_token')
      .eq('device_library_id', device_library_id)
      .maybeSingle();
    if (deviceError) throw new Error(`database: ${deviceError.message}`);
    if (device && device.push_token) {
      targets.push({ token: device.push_token, deviceLibraryId: device_library_id });
    }
  }
  return targets;
}

/**
 * hapns error names whose meaning is "this token will never work again —
 * stop sending to it" (Apple: "Delete a device if APNs returns an error
 * that the push token is invalid"). Anything else (auth, throttling,
 * network, server errors) must NOT prune: retrying is correct there.
 */
const INVALID_TOKEN_ERRORS = new Set([
  'BadDeviceTokenError',
  'UnregisteredError',
  'ExpiredTokenError',
]);

function describeSendError(err) {
  const name = (err && (err.name || err.code)) || 'Error';
  const message = String((err && err.message) || err).slice(0, 160);
  return `${name}: ${message}`;
}

/** Drop one dead registration; remove the device row if nothing references it. */
async function pruneInvalidToken(db, serialNumber, deviceLibraryId) {
  await db
    .from('apple_registrations')
    .delete()
    .eq('serial_number', serialNumber)
    .eq('device_library_id', deviceLibraryId);
  const { data: remaining } = await db
    .from('apple_registrations')
    .select('serial_number')
    .eq('device_library_id', deviceLibraryId);
  if (!remaining || remaining.length === 0) {
    await db.from('apple_devices').delete().eq('device_library_id', deviceLibraryId);
  }
}

/**
 * Apple Wallet pass-update notification: empty payload ({}), background
 * push type, priority 5, topic = pass type identifier. Built directly
 * because hapns's BackgroundNotification injects aps.content-available.
 * Synchronous (no imports) so it stays unit-testable under Jest/CJS —
 * hapns's send() only reads these fields. The bitmask is hapns's public
 * Connector.Token value (0b010); a mismatch fails loudly at send time.
 */
function buildPassUpdateNotification(topic) {
  return {
    topic,
    pushType: 'background',
    priority: 5,
    expiration: 0,
    collapseID: undefined,
    supportedConnectors: 0b010,
    body: {},
  };
}

async function realSend(connector, topic, pushToken, useSandbox) {
  const { Device } = await import('hapns/targets/device');
  const { send } = await import('hapns/send');
  return send(connector, buildPassUpdateNotification(topic), Device(pushToken), {
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

    const targets = await getPushTargets(db, serialNumber);
    if (targets.length === 0) return report({ sent: false, reason: 'NO_REGISTERED_DEVICES' });

    const topic = process.env.APNS_TOPIC || process.env.PASS_TYPE_IDENTIFIER;
    if (!topic) return report({ sent: false, reason: 'APNS_TOPIC_NOT_CONFIGURED' });
    // Pass updates MUST go to production APNs — sandbox pushes never wake Wallet.
    const useSandbox = process.env.APNS_USE_SANDBOX === 'true';
    const connector = sender ? null : await loadConnector();

    const results = await Promise.allSettled(
      targets.map((t) =>
        sender
          ? sender(topic, t.token, useSandbox)
          : realSend(connector, topic, t.token, useSandbox)
      )
    );
    const delivered = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - delivered;
    // Surface Apple's actual rejection reasons (names + messages only —
    // never device tokens). Without these, every failure looks identical.
    const errors = [
      ...new Set(
        results
          .filter((r) => r.status === 'rejected')
          .map((r) => describeSendError(r.reason))
      ),
    ];
    // Drop registrations Apple says are dead tokens so the next push
    // doesn't waste sends on them (and NO_REGISTERED_DEVICES eventually
    // tells the truth instead of masking rot).
    let pruned = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected' && INVALID_TOKEN_ERRORS.has(r.reason?.name)) {
        try {
          await pruneInvalidToken(db, serialNumber, targets[i].deviceLibraryId);
          pruned++;
        } catch {
          // Best-effort: a prune failure must not fail the push report.
        }
      }
    }
    const outcome = {
      sent: delivered > 0,
      delivered,
      failed,
      useSandbox,
      ...(failed > 0 ? { reason: 'SOME_DELIVERIES_FAILED', errors } : {}),
      ...(pruned > 0 ? { pruned } : {}),
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

module.exports = { notifyPassUpdated, buildPassUpdateNotification, _reset };
