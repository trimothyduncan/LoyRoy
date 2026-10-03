'use strict';

/**
 * services/qrService.js — server side of the QR / scanner system.
 *
 * The QR printed on every pass (see walletService) encodes a dashboard URL —
 * https://<dashboard>/members/<memberId> — so a native camera app can open
 * the member profile directly (scan → profile → add points) with no app code
 * involved. Passes issued before the URL switch carry LOYROY-<memberId> and
 * keep working: the parser accepts both.
 * Hardware scanners in HID keyboard-wedge mode arrive as the same string
 * (often with trailing newline) into the redemption UI, which POSTs it here
 * via /redeem or /member/:id. Malformed payloads fail closed with 400 —
 * never an unhandled exception, never a blind DB lookup.
 */

const members = require('../database/members');

const QR_PREFIX = 'LOYROY-';
const MAX_PAYLOAD_LENGTH = 256;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function fail(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  throw err;
}

/** Dashboard origin for QR links. Warns once per process when unconfigured. */
let warnedNoDashboardUrl = false;
function dashboardBase() {
  const base = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
  if (base) return base;
  if (!warnedNoDashboardUrl) {
    warnedNoDashboardUrl = true;
    console.warn('qrService: DASHBOARD_URL is not set — QR codes fall back to https://loyalty.e8square.shop');
  }
  return 'https://loyalty.e8square.shop';
}

/** Canonical payload for a member. Single source of truth (walletService uses it too). */
function buildQrPayload(memberId) {
  if (memberId === undefined || memberId === null || String(memberId).trim() === '') {
    fail('memberId is required to build a QR payload');
  }
  return `${dashboardBase()}/members/${String(memberId).trim()}`;
}

/** Parse + strictly validate a scanned string. Trims wedge-scanner newlines. */
function parseQrPayload(raw) {
  if (typeof raw !== 'string') fail('Unrecognized QR payload');
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PAYLOAD_LENGTH) fail('Unrecognized QR payload');
  // Legacy passes (and wedge scanners on old stock): LOYROY-<memberId>.
  if (trimmed.startsWith(QR_PREFIX)) {
    const memberId = trimmed.slice(QR_PREFIX.length).trim();
    if (!memberId) fail('Unrecognized QR payload');
    return { memberId };
  }
  // URL passes: the member id is the uuid in the path.
  const uuid = trimmed.match(UUID_RE);
  if (uuid) return { memberId: uuid[0] };
  fail('Unrecognized QR payload');
}

/** Parse a scan and resolve it to a member (404 when unknown). */
async function resolveScannedMember(db, raw) {
  const { memberId } = parseQrPayload(raw);
  return members.getMemberById(db, memberId);
}

module.exports = { QR_PREFIX, buildQrPayload, parseQrPayload, resolveScannedMember, dashboardBase };
