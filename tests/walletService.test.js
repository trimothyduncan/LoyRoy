'use strict';

const AdmZip = require('adm-zip');
const { generatePass, buildPassJson } = require('../services/walletService');

const REQUIRED_TOP_LEVEL = [
  'formatVersion',
  'passTypeIdentifier',
  'serialNumber',
  'teamIdentifier',
  'organizationName',
  'description',
];

// Obviously-fake, test-only identifiers. These assert ZIP STRUCTURE only —
// a pass signed with these values will NOT install on a device.
// A device-installable pass needs the real PASS_TYPE_IDENTIFIER / APPLE_TEAM_ID.
const TEST_IDENTIFIERS = {
  passTypeIdentifier: 'pass.test.invalid',
  teamIdentifier: 'TESTID0000',
};

function identifiers() {
  if (process.env.PASS_TYPE_IDENTIFIER && process.env.APPLE_TEAM_ID) {
    return {
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.APPLE_TEAM_ID,
    };
  }
  return TEST_IDENTIFIERS;
}

describe('buildPassJson', () => {
  it('parameterizes tier/points/serial per member', () => {
    const a = buildPassJson({ memberId: 'C001', name: 'A', tier: 'gold', points: 10 });
    const b = buildPassJson({ memberId: 'C002', name: 'B', tier: 'silver', points: 99 });
    expect(a.storeCard.headerFields[0].value).toBe('GOLD');
    expect(b.storeCard.headerFields[0].value).toBe('SILVER');
    expect(a.storeCard.primaryFields[0].value).toBe(10);
    expect(b.storeCard.primaryFields[0].value).toBe(99);
    expect(a.serialNumber).not.toBe(b.serialNumber);
  });

  it('rejects missing memberId with a 400 error', () => {
    expect(() => buildPassJson({})).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('generatePass', () => {
  // Without the signer-key passphrase no signature can be produced. The
  // service must fail fast with a 500 carrying a stable code — PASS_KEY_ERROR
  // when the (encrypted) key files exist, PASS_FILE_ERROR when they don't
  // (e.g. a CI checkout without certificates/). With the passphrase set,
  // this performs the full real-cert signing validation (Phase 2 DoD).
  it('signs with the real cert, or fails fast without its passphrase', async () => {
    if (!process.env.SIGNER_KEY_PASSPHRASE) {
      const err = await generatePass(
        { memberId: 'C001', name: 'Jane Appleseed', tier: 'gold', points: 1250 },
        identifiers()
      ).catch((e) => e);
      expect(err.status).toBe(500);
      expect(['PASS_KEY_ERROR', 'PASS_FILE_ERROR']).toContain(err.code);
      return;
    }

    const { buffer } = await generatePass(
      { memberId: 'C001', name: 'Jane Appleseed', tier: 'gold', points: 1250 },
      identifiers()
    );

    const zip = new AdmZip(buffer);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toEqual(
      expect.arrayContaining(['manifest.json', 'signature', 'pass.json'])
    );

    const passJson = JSON.parse(zip.readAsText('pass.json'));
    expect(Object.keys(passJson)).toEqual(expect.arrayContaining(REQUIRED_TOP_LEVEL));
    expect(passJson.storeCard.primaryFields[0].value).toBe(1250);
    expect(passJson.barcodes[0].format).toBe('PKBarcodeFormatQR');
  });
});
