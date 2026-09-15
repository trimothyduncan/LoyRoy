'use strict';

const { createFakeDb } = require('./fakeSupabase');
const { notifyPassUpdated, buildPassUpdateNotification, _reset } = require('../services/pushService');

const OLD_ENV = { ...process.env };

function setApnsEnv() {
  process.env.APNS_KEY_PATH = './certificates/AuthKey_TEST.p8';
  process.env.APNS_KEY_ID = 'KEYID123';
  process.env.APNS_TEAM_ID = 'TEAM123';
  process.env.APNS_TOPIC = 'pass.test.push';
  process.env.PASS_TYPE_IDENTIFIER = 'pass.test.push';
}

beforeEach(() => {
  _reset();
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe('pushService', () => {
  it('reports APNS_NOT_CONFIGURED without credentials and never throws', async () => {
    delete process.env.APNS_KEY_PATH;
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    const res = await notifyPassUpdated('S-1', { db: createFakeDb() });
    expect(res).toEqual({ sent: false, reason: 'APNS_NOT_CONFIGURED' });
  });

  it('reports NO_REGISTERED_DEVICES when nobody registered the serial', async () => {
    setApnsEnv();
    const res = await notifyPassUpdated('S-unknown', { db: createFakeDb() });
    expect(res).toEqual({ sent: false, reason: 'NO_REGISTERED_DEVICES' });
  });

  it('sends an empty background push per registered device token', async () => {
    setApnsEnv();
    const db = createFakeDb();
    db._tables.apple_devices.push(
      { device_library_id: 'D1', push_token: 'token-1' },
      { device_library_id: 'D2', push_token: 'token-2' }
    );
    db._tables.apple_registrations.push(
      { pass_type_id: 'pass.test.push', serial_number: 'S-1', device_library_id: 'D1' },
      { pass_type_id: 'pass.test.push', serial_number: 'S-1', device_library_id: 'D2' }
    );

    const calls = [];
    const sender = async (topic, token, useSandbox) => {
      calls.push({ topic, token, useSandbox });
      return { ok: true };
    };
    const res = await notifyPassUpdated('S-1', { db, sender });
    expect(res).toMatchObject({ sent: true, delivered: 2, failed: 0 });
    expect(calls).toHaveLength(2);
    expect(calls[0].topic).toBe('pass.test.push');
    expect(calls.map((c) => c.token).sort()).toEqual(['token-1', 'token-2']);
  });

  it('tolerates partial delivery failure without throwing', async () => {
    setApnsEnv();
    const db = createFakeDb();
    db._tables.apple_devices.push({ device_library_id: 'D1', push_token: 'token-1' });
    db._tables.apple_registrations.push(
      { pass_type_id: 'p', serial_number: 'S-1', device_library_id: 'D1' }
    );
    const sender = async () => {
      throw new Error('apns rejected');
    };
    const res = await notifyPassUpdated('S-1', { db, sender });
    expect(res).toMatchObject({ sent: false, delivered: 0, failed: 1 });
  });

  it('builds an empty-payload background notification for Wallet passes', () => {
    const n = buildPassUpdateNotification('pass.test.id');
    expect(n).toMatchObject({
      topic: 'pass.test.id',
      pushType: 'background',
      priority: 5,
      body: {},
    });
    expect(n.body).not.toHaveProperty('aps');
  });
});
