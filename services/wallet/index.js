'use strict';

/**
 * services/wallet/index.js — provider-neutral WalletService facade (Phase 3).
 *
 * Domain operations exposed to the application:
 *   createPass(memberData, { provider })  — issue a new pass
 *   updatePass(memberData, { provider })  — regenerate for an existing pass
 *     (Apple update model: the device re-fetches the .pkpass via the web service)
 *   getDeliveryDescriptor(result)         — pure: MIME + filename for download responses
 *   syncPassState({ serialNumber, authenticationToken, provider })
 *     — pure validation describing what the device should fetch next; persistent
 *     sync state lives in the database (pass_updates / passes), not here.
 *
 * Providers register by name. Only 'apple' is implemented; 'google' (and any unknown
 * name) resolve through getProvider() which throws a stable, documented error instead
 * of branching provider specifics into callers.
 */

const { appleProvider } = require('./appleProvider');

function notImplemented(provider) {
  const err = new Error(
    `wallet: provider '${provider}' is not implemented yet (AppleWalletProvider only).`
  );
  err.status = 501;
  err.code = 'WALLET_PROVIDER_NOT_IMPLEMENTED';
  throw err;
}

function validation(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  throw err;
}

const KNOWN_PROVIDERS = new Set(['apple', 'google']);

class WalletService {
  constructor({ providers, defaultProvider = 'apple' } = {}) {
    this.providers = providers || { apple: appleProvider };
    this.defaultProvider = defaultProvider;
  }

  getProvider(name) {
    const provider = name || this.defaultProvider;
    if (!KNOWN_PROVIDERS.has(provider)) validation(`unknown wallet provider: ${provider}`);
    const impl = this.providers[provider];
    if (!impl) notImplemented(provider);
    return impl;
  }

  async createPass(memberData, { provider } = {}) {
    const impl = this.getProvider(provider);
    const result = await impl.createPass(memberData);
    return { ...result, provider: impl.name };
  }

  async updatePass(memberData, { provider } = {}) {
    const impl = this.getProvider(provider);
    const result = await impl.createPass(memberData);
    return { ...result, provider: impl.name, updated: true };
  }

  getDeliveryDescriptor(result) {
    if (!result || !result.serialNumber || !result.provider) {
      validation('delivery descriptor requires serialNumber and provider');
    }
    if (result.provider === 'apple') {
      return {
        contentType: 'application/vnd.apple.pkpass',
        filename: `${result.serialNumber}.pkpass`,
        provider: 'apple',
      };
    }
    return notImplemented(result.provider);
  }

  syncPassState({ serialNumber, authenticationToken, provider } = {}) {
    if (!serialNumber) validation('serialNumber is required');
    if (!authenticationToken) validation('authenticationToken is required');
    const impl = this.getProvider(provider);
    return { serialNumber, provider: impl.name, action: 'fetch-latest' };
  }
}

function createWalletService(opts) {
  return new WalletService(opts);
}

module.exports = { WalletService, createWalletService };
