'use strict';

/**
 * database/devices.js — app-level device push-token records (section A
 * /register-device). Distinct from Apple's own Wallet device registration
 * (section B, database/apple.js).
 */

const { getDb } = require('./db');

function validation(message) {
  const e = new Error(message);
  e.status = 400;
  e.code = 'VALIDATION_ERROR';
  return e;
}

/** Idempotent: registering the same token twice returns the existing row. */
async function registerDevice(db, { memberId, deviceToken, platform = 'ios' }) {
  db = db || getDb();
  if (!memberId) throw validation('memberId is required');
  if (!deviceToken) throw validation('deviceToken is required');

  const { data: member, error: memberError } = await db
    .from('members')
    .select('id')
    .eq('id', memberId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) {
    const e = new Error('Member not found');
    e.status = 404;
    e.code = 'NOT_FOUND';
    throw e;
  }

  const { data: existing } = await db
    .from('devices')
    .select('*')
    .eq('member_id', memberId)
    .eq('device_token', deviceToken)
    .maybeSingle();
  if (existing) return { device: existing, created: false };

  const { data, error } = await db
    .from('devices')
    .insert({ member_id: memberId, device_token: deviceToken, platform })
    .select()
    .single();
  if (error) {
    const e = new Error(`database: ${error.message}`);
    e.status = 500;
    e.code = 'DB_ERROR';
    throw e;
  }
  return { device: data, created: true };
}

module.exports = { registerDevice };
