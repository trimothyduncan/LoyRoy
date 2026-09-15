'use strict';

const { createFakeDb } = require('./fakeSupabase');
const qr = require('../services/qrService');
const members = require('../database/members');

describe('qrService', () => {
  it('round-trips build → parse', () => {
    expect(qr.parseQrPayload(qr.buildQrPayload('C001'))).toEqual({ memberId: 'C001' });
  });

  it('tolerates hardware-scanner trailing newlines', () => {
    expect(qr.parseQrPayload('LOYROY-C001\r\n')).toEqual({ memberId: 'C001' });
  });

  it('fails closed on garbage', () => {
    for (const bad of ['', '   ', 'MEMBER-1', 'LOYROY-', 'LOYROY', 42, null, undefined, `LOYROY-${'x'.repeat(300)}`]) {
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
