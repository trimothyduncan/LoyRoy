'use strict';

process.env.DASHBOARD_URL = 'https://dashboard.test';

const { createFakeDb } = require('./fakeSupabase');
const qr = require('../services/qrService');
const members = require('../database/members');

describe('qrService', () => {
  it('builds a dashboard URL payload', () => {
    expect(qr.buildQrPayload('C001')).toBe('https://dashboard.test/members/C001');
  });

  it('round-trips build → parse', () => {
    const id = 'c2cc60ee-41ea-49ee-bb14-b415e10d877e';
    expect(qr.parseQrPayload(qr.buildQrPayload(id))).toEqual({ memberId: id });
  });

  it('parses a real uuid URL payload', () => {
    const id = 'c2cc60ee-41ea-49ee-bb14-b415e10d877e';
    expect(qr.parseQrPayload(`https://loyalty.e8square.shop/members/${id}`)).toEqual({ memberId: id });
  });

  it('keeps parsing legacy LOYROY- payloads (old installed passes)', () => {
    expect(qr.parseQrPayload('LOYROY-C001')).toEqual({ memberId: 'C001' });
  });

  it('tolerates hardware-scanner trailing newlines', () => {
    expect(qr.parseQrPayload('LOYROY-C001\r\n')).toEqual({ memberId: 'C001' });
    const id = 'c2cc60ee-41ea-49ee-bb14-b415e10d877e';
    expect(qr.parseQrPayload(`https://loyalty.e8square.shop/members/${id}\r\n`)).toEqual({ memberId: id });
  });

  it('fails closed on garbage', () => {
    for (const bad of ['', '   ', 'MEMBER-1', 'LOYROY-', 'LOYROY', 'https://example.com/noid', 42, null, undefined, `LOYROY-${'x'.repeat(300)}`]) {
      expect(() => qr.parseQrPayload(bad)).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  it('resolves a scan to a member, 404 when unknown', async () => {
    const db = createFakeDb();
    const m = await members.createMember(db, { name: 'Scanner Pam' });
    const found = await qr.resolveScannedMember(db, qr.buildQrPayload(m.id));
    expect(found.id).toBe(m.id);
    await expect(qr.resolveScannedMember(db, 'LOYROY-nope')).rejects.toMatchObject({ status: 404 });
  });
});
