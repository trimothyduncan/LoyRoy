'use strict';

// Provider-neutral WalletService tests. A fake provider stands in for Apple so these
// run without certificates; the real Apple path is covered by walletService.test.js.
// Google is covered by googleProvider.test.js; these assert the facade routes to it
// and that each provider's delivery/sync model stays behind the interface.

const { WalletService, createWalletService } = require('../services/wallet');
const { createGoogleProvider } = require('../services/wallet/googleProvider');

function fakeProvider(name = 'apple') {
  return {
    name,
    createPass: jest.fn(async (memberData) => ({
      buffer: Buffer.from(`pkpass:${memberData.memberId}`),
      serialNumber: `SN-${memberData.memberId}`,
      authenticationToken: 'token-123',
    })),
  };
}

function fakeGoogle() {
  return {
    name: 'google',
    createPass: jest.fn(async (memberData) => ({
      saveUrl: `https://pay.google.com/gp/v/save/JWT-${memberData.memberId}`,
      objectId: `ISS.${memberData.memberId}`,
      serialNumber: `LOYROY-${memberData.memberId}`,
    })),
    updatePass: jest.fn(async (memberData) => ({
      objectId: `ISS.${memberData.memberId}`,
      updated: true,
    })),
  };
}

describe('WalletService provider routing', () => {
  it('creates factory instances with the apple default', () => {
    const svc = createWalletService({ providers: { apple: fakeProvider() } });
    expect(svc).toBeInstanceOf(WalletService);
    expect(svc.getProvider().name).toBe('apple');
  });

  it('delegates createPass to the named provider and tags the result', async () => {
    const apple = fakeProvider();
    const svc = new WalletService({ providers: { apple } });
    const out = await svc.createPass({ memberId: 'C001' }, { provider: 'apple' });
    expect(apple.createPass).toHaveBeenCalledWith({ memberId: 'C001' });
    expect(out).toMatchObject({ serialNumber: 'SN-C001', provider: 'apple' });
  });

  it('updatePass regenerates and marks the result updated', async () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    const out = await svc.updatePass({ memberId: 'C001' });
    expect(out).toMatchObject({ provider: 'apple', updated: true });
  });

  it('reports google as a routable provider', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider(), google: fakeGoogle() } });
    expect(svc.getProvider('google').name).toBe('google');
  });

  it('surfaces NOT_IMPLEMENTED only when google is genuinely absent', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(() => svc.getProvider('google')).toThrow(
      expect.objectContaining({ status: 501, code: 'WALLET_PROVIDER_NOT_IMPLEMENTED' })
    );
  });

  it('rejects unknown provider names with VALIDATION_ERROR', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(() => svc.getProvider('sms')).toThrow(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' })
    );
  });
});

describe('WalletService google routing', () => {
  it('returns a save URL rather than a buffer', async () => {
    const google = fakeGoogle();
    const svc = new WalletService({ providers: { apple: fakeProvider(), google } });
    const out = await svc.createPass({ memberId: 'C001' }, { provider: 'google' });
    expect(out).toMatchObject({ provider: 'google', objectId: 'ISS.C001' });
    expect(out.saveUrl).toContain('pay.google.com/gp/v/save/');
    expect(out.buffer).toBeUndefined();
  });

  // Google updates by PATCHing the resource; it must not fall back to
  // createPass (which would mint a second save URL and change nothing).
  it('updatePass calls the provider update, not createPass', async () => {
    const google = fakeGoogle();
    const svc = new WalletService({ providers: { apple: fakeProvider(), google } });
    const out = await svc.updatePass({ memberId: 'C001' }, { provider: 'google' });
    expect(google.updatePass).toHaveBeenCalledWith({ memberId: 'C001' });
    expect(google.createPass).not.toHaveBeenCalled();
    expect(out).toMatchObject({ provider: 'google', updated: true });
  });

  it('describes google delivery as a redirect with no MIME type', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider(), google: fakeGoogle() } });
    expect(
      svc.getDeliveryDescriptor({
        serialNumber: 'LOYROY-C001',
        provider: 'google',
        saveUrl: 'https://pay.google.com/gp/v/save/x',
      })
    ).toEqual({
      delivery: 'redirect',
      url: 'https://pay.google.com/gp/v/save/x',
      provider: 'google',
    });
  });

  // Apple devices fetch on their own; Google has no device poll, so the
  // descriptor says the server patches the object.
  it('syncPassState distinguishes the two update models', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider(), google: fakeGoogle() } });
    expect(
      svc.syncPassState({ serialNumber: 'SN-1', authenticationToken: 't', provider: 'google', objectId: 'ISS.1' })
    ).toEqual({ serialNumber: 'SN-1', provider: 'google', action: 'server-patch', objectId: 'ISS.1' });
    expect(
      svc.syncPassState({ serialNumber: 'SN-1', authenticationToken: 't', provider: 'apple' })
    ).toEqual({ serialNumber: 'SN-1', provider: 'apple', action: 'fetch-latest' });
  });

  it('builds a real google provider with injected credentials', () => {
    const p = createGoogleProvider({
      env: {
        GOOGLE_WALLET_ISSUER_ID: 'I',
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'a@b.iam.gserviceaccount.com',
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'x',
      },
      resolveArt: async () => ({}),
    });
    expect(p.name).toBe('google');
    expect(typeof p.createPass).toBe('function');
    expect(typeof p.updatePass).toBe('function');
  });
});

describe('WalletService delivery + sync descriptors', () => {
  it('describes apple download payloads (MIME + filename)', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(
      svc.getDeliveryDescriptor({ serialNumber: 'SN-1', provider: 'apple' })
    ).toEqual({
      contentType: 'application/vnd.apple.pkpass',
      filename: 'SN-1.pkpass',
      provider: 'apple',
    });
  });

  it('rejects delivery descriptors without serial/provider', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(() => svc.getDeliveryDescriptor({})).toThrow(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' })
    );
  });

  it('validates sync input and names the device action', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(
      svc.syncPassState({ serialNumber: 'SN-1', authenticationToken: 't' })
    ).toEqual({ serialNumber: 'SN-1', provider: 'apple', action: 'fetch-latest' });
    expect(() => svc.syncPassState({ authenticationToken: 't' })).toThrow(
      expect.objectContaining({ status: 400 })
    );
  });
});
