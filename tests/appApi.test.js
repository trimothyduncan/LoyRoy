'use strict';

process.env.SERVICE_API_KEY = 'test-service-key';

const request = require('supertest');
const { createApp } = require('../app');
const { createFakeDb } = require('./fakeSupabase');
const members = require('../database/members');

const stubWallet = {
  generatePass: async (md) => ({
    buffer: Buffer.from('FAKEPKPASS'),
    serialNumber: `LOYROY-${md.memberId}`,
    authenticationToken: 'test-auth-token',
  }),
};
const stubPush = { notifyPassUpdated: async () => ({ sent: false, reason: 'STUB' }) };

let db;
let app;
beforeEach(() => {
  db = createFakeDb();
  app = createApp({ db, wallet: stubWallet, push: stubPush });
});

const auth = (req) => req.set('Authorization', 'Bearer test-service-key');

describe('auth', () => {
  it('rejects requests without a service key', async () => {
    const res = await request(app).get('/member/x');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /create-pass', () => {
  it('creates a member and returns a .pkpass binary', async () => {
    const res = await auth(
      request(app).post('/create-pass').send({ customerProfile: { name: 'Gus', email: 'g@x.co' }, tier: 'gold' })
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.apple.pkpass');
    expect(res.headers['x-member-id']).toBeDefined();
    expect(res.headers['x-pass-serial']).toContain('LOYROY-');

    const member = await members.getMemberById(db, res.headers['x-member-id']);
    expect(member.pass_serial).toBe(res.headers['x-pass-serial']);
  });

  it('rejects a missing customer name', async () => {
    const res = await auth(request(app).post('/create-pass').send({ customerProfile: {} }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /members', () => {
  it('lists and searches members', async () => {
    await members.createMember(db, { name: 'Zed Zee', email: 'zed@x.co' });
    await members.createMember(db, { name: 'Amy', email: 'amy@x.co' });
    const all = await auth(request(app).get('/members'));
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(2);
    const search = await auth(request(app).get('/members?search=zed'));
    expect(search.body.count).toBe(1);
    expect(search.body.members[0].name).toBe('Zed Zee');
  });
});

describe('POST /update-points', () => {
  it('computes the new balance server-side', async () => {
    const m = await members.createMember(db, { name: 'Hal' });
    const res = await auth(
      request(app).post('/update-points').send({ memberId: m.id, pointsDelta: 75, reason: 'visit' })
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ memberId: m.id, newBalance: 75 });
  });

  it('rejects a non-integer delta', async () => {
    const res = await auth(request(app).post('/update-points').send({ memberId: 'x', pointsDelta: 'lots' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /redeem', () => {
  it('redeems by serial number', async () => {
    const m = await members.createMember(db, { name: 'Ivy' });
    await members.addPoints(db, m.id, 500, 'earn');
    await members.updateMemberPass(db, m.id, { passSerial: 'LOYROY-1', authToken: 't' });
    const reward = await members.createReward(db, { name: 'Treat', costPoints: 200 });

    const res = await auth(
      request(app).post('/redeem').send({ serialNumber: 'LOYROY-1', rewardId: reward.id })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, newBalance: 300 });
    expect(res.body.redemptionId).toBeDefined();
  });

  it('rejects redemptions with insufficient balance', async () => {
    const m = await members.createMember(db, { name: 'Jay' });
    const reward = await members.createReward(db, { name: 'Big', costPoints: 999 });
    const res = await auth(request(app).post('/redeem').send({ memberId: m.id, rewardId: reward.id }));
    expect(res.status).toBe(400);
  });
});

describe('GET /member/:id', () => {
  it('returns the member shape with history', async () => {
    const m = await members.createMember(db, { name: 'Kay', tier: 'silver' });
    const res = await auth(request(app).get(`/member/${m.id}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ memberId: m.id, tier: 'silver', pointsBalance: 0 });
    expect(res.body.history).toBeDefined();
  });

  it('404s unknown members', async () => {
    const res = await auth(request(app).get('/member/nope'));
    expect(res.status).toBe(404);
  });
});

describe('POST /register-device', () => {
  it('records an app-level device token', async () => {
    const m = await members.createMember(db, { name: 'Lou' });
    const res = await auth(
      request(app).post('/register-device').send({ memberId: m.id, deviceToken: 'tok-1', platform: 'ios' })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, created: true });
  });

  it('rejects a missing device token', async () => {
    const res = await auth(request(app).post('/register-device').send({ memberId: 'x' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /push-update', () => {
  it('triggers a pass refresh for members with a pass', async () => {
    const m = await members.createMember(db, { name: 'Moe' });
    await members.updateMemberPass(db, m.id, { passSerial: 'LOYROY-9', authToken: 't' });
    const res = await auth(request(app).post('/push-update').send({ memberId: m.id }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('rejects members with no pass yet', async () => {
    const m = await members.createMember(db, { name: 'Ned' });
    const res = await auth(request(app).post('/push-update').send({ memberId: m.id }));
    expect(res.status).toBe(400);
  });
});
