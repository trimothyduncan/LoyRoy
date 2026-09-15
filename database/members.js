'use strict';

/**
 * database/members.js — member / points / rewards data access.
 *
 * Every function takes the Supabase client as its first argument so tests
 * can inject a fake; routes pass the real client via getDb().
 * Points math is always server-side: callers supply deltas/costs, never
 * absolute balances.
 */

const { getDb } = require('./db');

function dbError(err) {
  const e = new Error(`database: ${err.message || 'query failed'}`);
  e.status = 500;
  e.code = 'DB_ERROR';
  return e;
}

function notFound(what) {
  const e = new Error(`${what} not found`);
  e.status = 404;
  e.code = 'NOT_FOUND';
  return e;
}

function validation(message) {
  const e = new Error(message);
  e.status = 400;
  e.code = 'VALIDATION_ERROR';
  return e;
}

function withDb(db) {
  return db || getDb();
}

async function createMember(db, { name, email, phone, tier = 'bronze' }) {
  db = withDb(db);
  if (!name || typeof name !== 'string') throw validation('name is required');
  const { data, error } = await db
    .from('members')
    .insert({ name, email: email || null, phone: phone || null, tier })
    .select()
    .single();
  if (error) throw dbError(error);
  return data;
}

async function getMemberById(db, id) {
  db = withDb(db);
  const { data, error } = await db.from('members').select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw notFound('Member');
  return data;
}

async function getMemberBySerial(db, serialNumber) {
  db = withDb(db);
  const { data, error } = await db
    .from('members')
    .select('*')
    .eq('pass_serial', serialNumber)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw notFound('Member');
  return data;
}

async function resolveMember(db, { memberId, serialNumber }) {
  if (memberId) return getMemberById(db, memberId);
  if (serialNumber) return getMemberBySerial(db, serialNumber);
  throw validation('memberId or serialNumber is required');
}

async function updateMemberPass(db, id, { passSerial, authToken }) {
  db = withDb(db);
  const { data, error } = await db
    .from('members')
    .update({ pass_serial: passSerial, auth_token: authToken || null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw dbError(error);
  return data;
}

/** Server-computed balance change + ledger entry. Balance never goes below 0. */
async function addPoints(db, memberId, delta, reason = '') {
  db = withDb(db);
  if (!Number.isInteger(delta)) throw validation('pointsDelta must be an integer');
  const member = await getMemberById(db, memberId);
  const newBalance = Math.max(0, member.points_balance + delta);

  const { data, error } = await db
    .from('members')
    .update({ points_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw dbError(error);

  const { error: ledgerError } = await db.from('points_ledger').insert({
    member_id: memberId,
    delta,
    balance_after: newBalance,
    reason,
  });
  if (ledgerError) throw dbError(ledgerError);

  return { memberId, newBalance: data.points_balance };
}

async function recordVisit(db, memberId, note = '') {
  db = withDb(db);
  await getMemberById(db, memberId);
  const now = new Date().toISOString();
  const { error } = await db.from('visits').insert({ member_id: memberId, note });
  if (error) throw dbError(error);
  const { error: updateError } = await db
    .from('members')
    .update({ last_visit_at: now })
    .eq('id', memberId);
  if (updateError) throw dbError(updateError);
  return { memberId, visitedAt: now };
}

async function getHistory(db, memberId, limit = 50) {
  db = withDb(db);
  await getMemberById(db, memberId);
  const [ledger, visits, redemptions] = await Promise.all([
    db.from('points_ledger').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(limit),
    db.from('visits').select('*').eq('member_id', memberId).order('visited_at', { ascending: false }).limit(limit),
    db.from('redemptions').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(limit),
  ]);
  for (const r of [ledger, visits, redemptions]) {
    if (r.error) throw dbError(r.error);
  }
  return { points: ledger.data, visits: visits.data, redemptions: redemptions.data };
}

async function createReward(db, { name, description = '', costPoints, expiresAt = null }) {
  db = withDb(db);
  if (!name) throw validation('name is required');
  if (!Number.isInteger(costPoints) || costPoints <= 0) {
    throw validation('costPoints must be a positive integer');
  }
  const { data, error } = await db
    .from('rewards')
    .insert({ name, description, cost_points: costPoints, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw dbError(error);
  return data;
}

/**
 * Server-side eligibility + balance check, then mutate. Never trust a
 * client-supplied balance.
 */
async function redeemReward(db, { memberId, serialNumber, rewardId }) {
  db = withDb(db);
  if (!rewardId) throw validation('rewardId is required');
  const member = await resolveMember(db, { memberId, serialNumber });

  const { data: reward, error } = await db.from('rewards').select('*').eq('id', rewardId).maybeSingle();
  if (error) throw dbError(error);
  if (!reward) throw notFound('Reward');
  if (!reward.active) throw validation('Reward is not active');
  if (reward.expires_at && new Date(reward.expires_at) < new Date()) {
    throw validation('Reward has expired');
  }
  if (member.points_balance < reward.cost_points) {
    throw validation('Insufficient points balance');
  }

  const { newBalance } = await addPoints(db, member.id, -reward.cost_points, `redeem:${reward.id}`);

  const { data: redemption, error: redemptionError } = await db
    .from('redemptions')
    .insert({ member_id: member.id, reward_id: reward.id, points_spent: reward.cost_points })
    .select()
    .single();
  if (redemptionError) throw dbError(redemptionError);

  return { success: true, newBalance, redemptionId: redemption.id };
}

module.exports = {
  createMember,
  getMemberById,
  getMemberBySerial,
  resolveMember,
  updateMemberPass,
  addPoints,
  recordVisit,
  getHistory,
  createReward,
  redeemReward,
};
