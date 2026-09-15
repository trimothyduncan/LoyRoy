'use strict';

const { createFakeDb } = require('./fakeSupabase');
const members = require('../database/members');

let db;
beforeEach(() => {
  db = createFakeDb();
});

describe('members round-trip', () => {
  it('create → read → update points → ledger', async () => {
    const created = await members.createMember(db, { name: 'Ada', tier: 'gold' });
    expect(created.id).toBeDefined();
    expect(created.points_balance).toBe(0);

    const found = await members.getMemberById(db, created.id);
    expect(found.name).toBe('Ada');

    const { newBalance } = await members.addPoints(db, created.id, 200, 'signup bonus');
    expect(newBalance).toBe(200);

    const history = await members.getHistory(db, created.id);
    expect(history.points).toHaveLength(1);
    expect(history.points[0]).toMatchObject({ delta: 200, balance_after: 200 });

    const back = await members.addPoints(db, created.id, -50, 'correction');
    expect(back.newBalance).toBe(150);
  });

  it('floors balance at zero', async () => {
    const m = await members.createMember(db, { name: 'Bo' });
    const { newBalance } = await members.addPoints(db, m.id, -999, 'over-redeem');
    expect(newBalance).toBe(0);
  });

  it('validates input', async () => {
    await expect(members.createMember(db, {})).rejects.toMatchObject({ status: 400 });
    const m = await members.createMember(db, { name: 'Cy' });
    await expect(members.addPoints(db, m.id, 1.5, 'x')).rejects.toMatchObject({ status: 400 });
    await expect(members.getMemberById(db, 'missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('redeem', () => {
  it('checks eligibility server-side and mutates balance + ledger + redemption', async () => {
    const m = await members.createMember(db, { name: 'Dee' });
    await members.addPoints(db, m.id, 1000, 'earn');
    const reward = await members.createReward(db, { name: 'Free cut', costPoints: 400 });

    const res = await members.redeemReward(db, { memberId: m.id, rewardId: reward.id });
    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(600);
    expect(res.redemptionId).toBeDefined();

    const after = await members.getMemberById(db, m.id);
    expect(after.points_balance).toBe(600);
  });

  it('rejects insufficient balance without mutating', async () => {
    const m = await members.createMember(db, { name: 'Eli' });
    const reward = await members.createReward(db, { name: 'Shave', costPoints: 500 });
    await expect(members.redeemReward(db, { memberId: m.id, rewardId: reward.id })).rejects.toMatchObject({
      status: 400,
    });
    const after = await members.getMemberById(db, m.id);
    expect(after.points_balance).toBe(0);
    expect(db._tables.redemptions).toHaveLength(0);
  });

  it('rejects inactive rewards', async () => {
    const m = await members.createMember(db, { name: 'Fay' });
    await members.addPoints(db, m.id, 1000, 'earn');
    const reward = await members.createReward(db, { name: 'Old', costPoints: 10 });
    reward.active = false; // simulate dashboard deactivation
    await expect(members.redeemReward(db, { memberId: m.id, rewardId: reward.id })).rejects.toMatchObject({
      status: 400,
    });
  });
});
