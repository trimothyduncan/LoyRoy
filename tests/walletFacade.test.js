'use strict';

// Provider-neutral WalletService tests. A fake provider stands in for Apple so these
// run without certificates; the real Apple path is covered by walletService.test.js.
// Google has no provider yet — assert the stable NOT_IMPLEMENTED contract instead.

const { WalletService, createWalletService } = require('../services/wallet');

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

  it('rejects unknown provider names with VALIDATION_ERROR', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(() => svc.getProvider('sms')).toThrow(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' })
    );
  });

  it('reports google as known-but-unimplemented (501)', () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    expect(() => svc.getProvider('google')).toThrow(
      expect.objectContaining({ status: 501, code: 'WALLET_PROVIDER_NOT_IMPLEMENTED' })
    );
  });

  it('createPass for google surfaces the same 501 contract', async () => {
    const svc = new WalletService({ providers: { apple: fakeProvider() } });
    await expect(svc.createPass({ memberId: 'C001' }, { provider: 'google' })).rejects.toMatchObject(
      { status: 501, code: 'WALLET_PROVIDER_NOT_IMPLEMENTED' }
    );
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
