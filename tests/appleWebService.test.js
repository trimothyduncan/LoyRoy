'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const { createFakeDb } = require('./fakeSupabase');
const members = require('../database/members');
const { touchPassUpdate } = require('../database/apple');

const PASS_TYPE = 'pass.test.webservice';
const stubWallet = {
  generatePass: async () => ({ buffer: Buffer.from('FAKEPKPASS'), serialNumber: 'S', authenticationToken: 'T' }),
};

let db;
let app;
let member;
beforeEach(async () => {
  db = createFakeDb();
  app = createApp({ db, wallet: stubWallet, push: {}, passTypeIdentifier: PASS_TYPE });
  member = await members.createMember(db, { name: 'Wallet Walt' });
  await members.updateMemberPass(db, member.id, { passSerial: 'WS-1', authToken: 'secret-token' });
});

const appleAuth = (req) => req.set('Authorization', 'ApplePass secret-token');
const regPath = `/apple/v1/devices/DEV-1/registrations/${PASS_TYPE}/WS-1`;

describe('Apple Wallet Web Service', () => {
  it('POST register → 201 first time, 200 when already registered', async () => {
    const mk = () =>
      request(app).post(regPath).set('Authorization', 'ApplePass secret-token').send({ pushToken: 'push-abc' });
    const first = await mk();
    expect([200, 201]).toContain(first.status);
    expect(first.status).toBe(201);
    const second = await mk();
    expect(second.status).toBe(200);
  });

  it('rejects registration with a bad token or missing pushToken', async () => {
    const badToken = await request(app).post(regPath).set('Authorization', 'ApplePass wrong').send({ pushToken: 'x' });
    expect(badToken.status).toBe(401);
    const noBody = await appleAuth(request(app).post(regPath)).send({});
    expect(noBody.status).toBe(400);
  });

  it('GET serials → 200 with updates, then 204 when nothing changed', async () => {
    await appleAuth(request(app).post(regPath)).send({ pushToken: 'push-abc' });
    const list1 = await appleAuth(
      request(app).get(`/apple/v1/devices/DEV-1/registrations/${PASS_TYPE}`)
    );
    expect(list1.status).toBe(200);
    expect(list1.body.serialNumbers).toContain('WS-1');
    expect(list1.body.lastUpdated).toBeDefined();

    const list2 = await appleAuth(
      request(app).get(`/apple/v1/devices/DEV-1/registrations/${PASS_TYPE}?passesUpdatedSince=${encodeURIComponent(list1.body.lastUpdated)}`)
    );
    expect(list2.status).toBe(204);

    await touchPassUpdate(db, 'WS-1');
    const list3 = await appleAuth(
      request(app).get(`/apple/v1/devices/DEV-1/registrations/${PASS_TYPE}?passesUpdatedSince=${encodeURIComponent(list1.body.lastUpdated)}`)
    );
    expect(list3.status).toBe(200);
    expect(list3.body.serialNumbers).toContain('WS-1');
  });

  it('GET latest pass → 200 pkpass, 304 when unmodified, 401 without token', async () => {
    const passPath = `/apple/v1/passes/${PASS_TYPE}/WS-1`;
    const noAuth = await request(app).get(passPath);
    expect(noAuth.status).toBe(401);

    const first = await appleAuth(request(app).get(passPath));
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('application/vnd.apple.pkpass');
    expect(first.headers['last-modified']).toBeDefined();

    const cached = await appleAuth(request(app).get(passPath)).set('If-Modified-Since', first.headers['last-modified']);
    expect(cached.status).toBe(304);
  });

  it('DELETE unregister → 200', async () => {
    await appleAuth(request(app).post(regPath)).send({ pushToken: 'push-abc' });
    const res = await appleAuth(request(app).delete(regPath));
    expect(res.status).toBe(200);
  });

  it('POST /v1/log accepts device logs without auth', async () => {
    const res = await request(app).post('/apple/v1/log').send({ logs: ['test log line'] });
    expect(res.status).toBe(200);
  });
});
