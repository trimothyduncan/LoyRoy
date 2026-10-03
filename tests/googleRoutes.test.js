'use strict';

process.env.SERVICE_API_KEY = 'test-service-key';

const request = require('supertest');
const { createApp } = require('../app');
const { createFakeDb } = require('./fakeSupabase');
const members = require('../database/members');

const stubWallet = {
  generatePass: async (md) => ({
    buffer: Buffer.from('FAKEPKPASS'),
    serialNumber: md.serialNumber || `LOYROY-${md.memberId}`,
    authenticationToken: md.authenticationToken || 'test-auth-token',
  }),
};
const stubPush = { notifyPassUpdated: async () => ({ sent: false, reason: 'STUB' }) };

function makeFacade({ updated = [] } = {}) {
  return {
    created: [],
    updated,
    async createPass(memberData, { provider } = {}) {
      const result = {
        saveUrl: 'https://pay.google.com/gp/v/save/FAKEJWT',
        objectId: `ISSUER.${memberData.memberId}`,
        classId: 'ISSUER.loyaltyTierGold',
        serialNumber: `LOYROY-${memberData.memberId}`,
      };
      this.created.push({ memberData, provider, result });
      return result;
    },
    async updatePass(memberData, { provider } = {}) {
      this.updated.push({ memberData, provider });
      return { objectId: `ISSUER.${memberData.memberId}`, updated: true };
    },
  };
}

const auth = (req) => req.set('Authorization', 'Bearer test-service-key');
const googlePayload = (email) => ({
  customerProfile: { name: 'Gina', email },
  tier: 'gold',
  provider: 'google',
});

describe('POST /create-pass provider=google', () => {
  it('returns the signed save URL as JSON and records a google passes row', async () => {
    const db = createFakeDb();
    const facade = makeFacade();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: facade });

    const res = await auth(request(app).post('/create-pass').send(googlePayload('gina@x.co')));
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('google');
    expect(res.body.saveUrl).toContain('https://pay.google.com/gp/v/save/');
    expect(res.body.objectId).toContain('ISSUER.');
    expect(res.body.classId).toContain('ISSUER.');
    expect(res.headers['content-type']).toContain('application/json');

    const rows = db._tables.passes.filter((r) => r.platform === 'google');
    expect(rows).toHaveLength(1);
    expect(rows[0].member_id).toBe(res.body.memberId);
    expect(rows[0].provider_serial).toBe(res.body.objectId);
    expect(rows[0].provider_token).toBe(res.body.classId);

    // Apple-only member columns stay untouched by a Google issue.
    const member = await members.getMemberById(db, res.body.memberId);
    expect(member.pass_serial).toBeFalsy();
  });

  it('re-issuing updates the existing passes row instead of duplicating it', async () => {
    const db = createFakeDb();
    const facade = makeFacade();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: facade });

    const first = await auth(request(app).post('/create-pass').send(googlePayload('gina@x.co')));
    expect(first.status).toBe(200);
    const second = await auth(request(app).post('/create-pass').send(googlePayload('gina@x.co')));
    expect(second.status).toBe(200);
    expect(second.body.objectId).toBe(first.body.objectId);
    expect(db._tables.passes.filter((r) => r.platform === 'google')).toHaveLength(1);
  });

  it('reports 501 when no provider facade is wired', async () => {
    const db = createFakeDb();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: null });

    const res = await auth(request(app).post('/create-pass').send(googlePayload('gina@x.co')));
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('WALLET_PROVIDER_NOT_IMPLEMENTED');
  });

  it('rejects an unknown provider', async () => {
    const db = createFakeDb();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: makeFacade() });

    const res = await auth(
      request(app).post('/create-pass').send({ ...googlePayload('gina@x.co'), provider: 'passbook' })
    );
    expect(res.status).toBe(400);
  });
});

describe('Google pass sync on balance changes', () => {
  async function issueGoogle(db, app, email) {
    const res = await auth(request(app).post('/create-pass').send(googlePayload(email)));
    expect(res.status).toBe(200);
    return res.body.memberId;
  }

  it('update-points PATCHes the google object with the new balance', async () => {
    const db = createFakeDb();
    const facade = makeFacade();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: facade });
    const memberId = await issueGoogle(db, app, 'gina@x.co');

    const res = await auth(request(app).post('/update-points').send({ memberId, pointsDelta: 40 }));
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(40);
    expect(res.body.google).toEqual({ updated: 1 });
    expect(facade.updated).toHaveLength(1);
    expect(facade.updated[0]).toMatchObject({ provider: 'google' });
    expect(facade.updated[0].memberData).toMatchObject({ memberId, points: 40 });
  });

  it('update-points skips google sync when the member has no google pass', async () => {
    const db = createFakeDb();
    const facade = makeFacade();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: facade });
    const m = await members.createMember(db, { name: 'Hank' });

    const res = await auth(request(app).post('/update-points').send({ memberId: m.id, pointsDelta: 10 }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ memberId: m.id, newBalance: 10 });
    expect(facade.updated).toHaveLength(0);
  });

  it('redeem PATCHes the google object too', async () => {
    const db = createFakeDb();
    const facade = makeFacade();
    const app = createApp({ db, wallet: stubWallet, push: stubPush, walletService: facade });
    const memberId = await issueGoogle(db, app, 'gina@x.co');
    await members.addPoints(db, memberId, 500, 'earn');
    const reward = await members.createReward(db, { name: 'Treat', costPoints: 200 });

    const res = await auth(request(app).post('/redeem').send({ memberId, rewardId: reward.id }));
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(300);
    expect(res.body.google).toEqual({ updated: 1 });
    expect(facade.updated).toHaveLength(1);
    expect(facade.updated[0].memberData).toMatchObject({ memberId, points: 300 });
  });
});
