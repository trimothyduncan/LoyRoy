'use strict';

process.env.SERVICE_API_KEY = 'test-service-key';

const request = require('supertest');
const { createApp } = require('../app');
const { createFakeDb } = require('./fakeSupabase');
const { buildSummary } = require('../routes/analytics');

const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

function seed(db) {
  db._tables.members.push(
    { id: 'm-a', name: 'Active Ann', email: 'a@x.co', tier: 'gold', points_balance: 500, created_at: daysAgo(5), last_visit_at: daysAgo(1) },
    { id: 'm-b', name: 'Quiet Bob', email: 'b@x.co', tier: 'silver', points_balance: 900, created_at: daysAgo(40), last_visit_at: daysAgo(40) },
    { id: 'm-c', name: 'Dormant Cat', email: 'c@x.co', tier: 'bronze', points_balance: 50, created_at: daysAgo(100), last_visit_at: daysAgo(100) }
  );
  db._tables.points_ledger.push(
    { member_id: 'm-a', delta: 200, balance_after: 500, created_at: daysAgo(2) },
    { member_id: 'm-a', delta: -50, balance_after: 450, created_at: daysAgo(1) },
    { member_id: 'm-b', delta: 300, balance_after: 900, created_at: daysAgo(40) }
  );
  db._tables.rewards.push({ id: 'rw1', name: 'Coffee', cost_points: 100 });
  db._tables.redemptions.push(
    { member_id: 'm-a', reward_id: 'rw1', created_at: daysAgo(1) },
    { member_id: 'm-a', reward_id: 'rw1', created_at: daysAgo(1) }
  );
  db._tables.apple_registrations.push(
    { device_library_id: 'D1', serial_number: 'LOYROY-m-a', pass_type_id: 'p' },
    { device_library_id: 'D2', serial_number: 'LOYROY-m-a', pass_type_id: 'p' }
  );
}

const auth = (req) => req.set('Authorization', 'Bearer test-service-key');

describe('buildSummary', () => {
  it('aggregates totals, tiers, retention and win-back targets', async () => {
    const db = createFakeDb();
    seed(db);
    const s = await buildSummary(db);

    expect(s.totals).toMatchObject({
      members: 3,
      installedPasses: 2,
      pointsIssued: 500,
      pointsRedeemed: 50,
      redemptions: 2,
    });

    const silver = s.tierMix.find((t) => t.tier === 'silver');
    expect(silver).toMatchObject({ members: 1, avgBalance: 900 });

    expect(s.daily).toHaveLength(30);
    const inWindow = s.daily.reduce((acc, d) => ({ issued: acc.issued + d.issued, redeemed: acc.redeemed + d.redeemed }), { issued: 0, redeemed: 0 });
    expect(inWindow).toEqual({ issued: 200, redeemed: 50 });

    expect(s.topRewards[0]).toMatchObject({ name: 'Coffee', count: 2, points: 200 });

    expect(s.atRisk).toMatchObject({ active: 1, quiet30: 1, quiet60: 0, dormant90: 1 });

    expect(s.winback).toHaveLength(2);
    expect(s.winback[0].name).toBe('Quiet Bob');
    expect(s.winback[0].daysQuiet).toBeGreaterThanOrEqual(30);
  });
});

describe('GET /analytics/summary', () => {
  it('requires the service key and returns the summary shape', async () => {
    const db = createFakeDb();
    seed(db);
    const app = createApp({ db, push: {} });

    const anon = await request(app).get('/analytics/summary');
    expect(anon.status).toBe(401);

    const res = await auth(request(app).get('/analytics/summary'));
    expect(res.status).toBe(200);
    expect(res.body.totals.members).toBe(3);
    expect(res.body.daily).toHaveLength(30);
    expect(Array.isArray(res.body.tierMix)).toBe(true);
    expect(Array.isArray(res.body.winback)).toBe(true);
  });
});
