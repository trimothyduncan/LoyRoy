'use strict';

/**
 * Full live end-to-end against real Supabase + real signing cert:
 * create-pass (binary) → member lookup → update-points → create reward →
 * redeem → push-update → cleanup. Needs .env credentials.
 * Usage: node scripts/e2e-live.js
 */

require('dotenv').config();
const request = require('supertest');
const { createApp } = require('../app');
const { getDb } = require('../database/db');

async function main() {
  const app = createApp();
  const key = process.env.SERVICE_API_KEY;
  const auth = (r) => r.set('Authorization', `Bearer ${key}`);
  const email = `e2e-${Date.now()}@test.local`;

  // 1. create-pass → real signed .pkpass
  const created = await auth(
    request(app).post('/create-pass').send({ customerProfile: { name: 'E2E', email }, tier: 'gold' })
  );
  if (created.status !== 200) throw new Error(`create-pass → ${created.status}: ${created.text.slice(0, 200)}`);
  const memberId = created.headers['x-member-id'];
  const serial = created.headers['x-pass-serial'];
  console.log(`create-pass OK: member=${memberId} serial=${serial} bytes=${created.body.length}`);

  // 2. member lookup
  const member = await auth(request(app).get(`/member/${memberId}`));
  if (member.status !== 200 || member.body.pointsBalance !== 0) throw new Error('member lookup mismatch');
  console.log(`member OK: tier=${member.body.tier} pass=${member.body.passSerialNumber}`);

  // 3. update-points
  const pts = await auth(request(app).post('/update-points').send({ memberId, pointsDelta: 500, reason: 'e2e' }));
  if (pts.body.newBalance !== 500) throw new Error('update-points mismatch');
  console.log('update-points OK: newBalance=500');

  // 4. reward + redeem by serial (QR path)
  const db = getDb();
  const { data: reward, error } = await db.from('rewards').insert({ name: 'E2E reward', cost_points: 200 }).select().single();
  if (error) throw new Error(error.message);
  const redeem = await auth(request(app).post('/redeem').send({ serialNumber: serial, rewardId: reward.id }));
  if (!redeem.body.success || redeem.body.newBalance !== 300) throw new Error(`redeem mismatch: ${JSON.stringify(redeem.body)}`);
  console.log(`redeem OK: newBalance=300 redemption=${redeem.body.redemptionId}`);

  // 5. push-update (no devices → reports via pushService, still 200)
  const push = await auth(request(app).post('/push-update').send({ memberId }));
  if (push.status !== 200) throw new Error('push-update failed');
  console.log('push-update OK');

  // 6. cleanup
  await db.from('redemptions').delete().eq('member_id', memberId);
  await db.from('members').delete().eq('id', memberId);
  await db.from('rewards').delete().eq('id', reward.id);
  console.log('cleanup OK — E2E LIVE PASS');
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
