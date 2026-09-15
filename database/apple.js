'use strict';

/**
 * database/apple.js — Apple Wallet Web Service persistence (section B).
 * touchPassUpdate() is called on every pass-affecting mutation so the
 * "serials changed since <tag>" lookup (Phase 6) has something to answer.
 */

const crypto = require('node:crypto');
const { getDb } = require('./db');

function newTag() {
  return crypto.randomUUID();
}

/** Record that a serial changed; returns the new tag. */
async function touchPassUpdate(db, serialNumber, tag = newTag()) {
  db = db || getDb();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('pass_updates')
    .select('*')
    .eq('serial_number', serialNumber)
    .maybeSingle();
  if (existing) {
    const { error } = await db
      .from('pass_updates')
      .update({ updated_tag: tag, updated_at: now })
      .eq('serial_number', serialNumber);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('pass_updates')
      .insert({ serial_number: serialNumber, updated_tag: tag, updated_at: now });
    if (error) throw error;
  }
  return tag;
}

/**
 * Serials registered on this device that changed after `since` (an ISO
 * timestamp previously issued as lastUpdated; omit to get all serials).
 * Returns { serialNumbers, lastUpdated } — lastUpdated is fed back by the
 * device as passesUpdatedSince on the next poll.
 */
async function getSerialsUpdatedSince(db, deviceLibraryId, since) {
  db = db || getDb();
  const { data: regs, error } = await db
    .from('apple_registrations')
    .select('serial_number')
    .eq('device_library_id', deviceLibraryId);
  if (error) throw error;
  const serials = regs.map((r) => r.serial_number);

  const { data: updates, error: updatesError } = await db.from('pass_updates').select('*');
  if (updatesError) throw updatesError;
  const updatedAtBySerial = new Map(updates.map((u) => [u.serial_number, u.updated_at]));

  const hasSince = since !== undefined && since !== null && since !== '';
  const changed = hasSince
    ? serials.filter((s) => (updatedAtBySerial.get(s) || '') > since)
    : [...serials];
  const stamps = changed.map((s) => updatedAtBySerial.get(s) || '').filter(Boolean).sort();
  return {
    serialNumbers: changed,
    lastUpdated: stamps.length > 0 ? stamps[stamps.length - 1] : since || new Date().toISOString(),
  };
}

async function registerAppleDevice(db, { deviceLibraryId, passTypeId, serialNumber, pushToken }) {
  db = db || getDb();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('apple_devices')
    .select('*')
    .eq('device_library_id', deviceLibraryId)
    .maybeSingle();
  if (existing) {
    const { error } = await db
      .from('apple_devices')
      .update({ push_token: pushToken, updated_at: now })
      .eq('device_library_id', deviceLibraryId);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('apple_devices')
      .insert({ device_library_id: deviceLibraryId, push_token: pushToken });
    if (error) throw error;
  }
  const { error: regError } = await db.from('apple_registrations').insert({
    pass_type_id: passTypeId,
    serial_number: serialNumber,
    device_library_id: deviceLibraryId,
  });
  // Duplicate registration (same device+pass) is idempotent — ignore conflicts.
  if (regError && !/duplicate|unique|conflict/i.test(regError.message || '')) throw regError;
}

async function unregisterAppleDevice(db, { deviceLibraryId, passTypeId, serialNumber }) {
  db = db || getDb();
  const { error } = await db
    .from('apple_registrations')
    .delete()
    .eq('device_library_id', deviceLibraryId)
    .eq('pass_type_id', passTypeId)
    .eq('serial_number', serialNumber);
  if (error) throw error;
}

module.exports = {
  newTag,
  touchPassUpdate,
  getSerialsUpdatedSince,
  registerAppleDevice,
  unregisterAppleDevice,
};
