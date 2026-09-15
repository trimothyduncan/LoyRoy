'use strict';

/**
 * services/qrService.js — server side of the QR / scanner system.
 *
 * The QR printed on every pass (see walletService) encodes LOYROY-<memberId>.
 * Hardware scanners in HID keyboard-wedge mode arrive as the same string
 * (often with trailing newline) into the redemption UI, which POSTs it here
 * via /redeem or /member/:id. Malformed payloads fail closed with 400 —
 * never an unhandled exception, never a blind DB lookup.
 */

const members = require('../database/members');

const QR_PREFIX = 'LOYROY-';
const MAX_PAYLOAD_LENGTH = 256;

function fail(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  throw err;
}

/** Canonical payload for a member. Single source of truth (walletService uses it too). */
function buildQrPayload(memberId) {
  if (memberId === undefined || memberId === null || String(memberId).trim() === '') {
    fail('memberId is required to build a QR payload');
  }
  return `${QR_PREFIX}${memberId}`;
}

/** Parse + strictly validate a scanned string. Trims wedge-scanner newlines. */
function parseQrPayload(raw) {
  if (typeof raw !== 'string') fail('Unrecognized QR payload');
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PAYLOAD_LENGTH) fail('Unrecognized QR payload');
  if (!trimmed.startsWith(QR_PREFIX)) fail('Unrecognized QR payload');
  const memberId = trimmed.slice(QR_PREFIX.length).trim();
  if (!memberId) fail('Unrecognized QR payload');
  return { memberId };
}

/** Parse a scan and resolve it to a member (404 when unknown). */
async function resolveScannedMember(db, raw) {
  const { memberId } = parseQrPayload(raw);
  return members.getMemberById(db, memberId);
}

module.exports = { QR_PREFIX, buildQrPayload, parseQrPayload, resolveScannedMember };
