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
 * Providers register by name. Apple returns a signed .pkpass Buffer; Google
 * returns a signed save URL (a Google pass is a REST resource delivered by
 * redirect, not a downloaded file). Both stay behind this interface, so
 * routes and the dashboard never branch on provider specifics.
 */

const { appleProvider } = require('./appleProvider');
const { createGoogleProvider } = require('./googleProvider');

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
    this.providers = providers || { apple: appleProvider, google: createGoogleProvider() };
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

  /**
   * Update an issued pass.
   *
   * Apple and Google update differently: Apple hands the device a web-service
   * URL to re-fetch, while Google PATCHes the resource and the installed pass
   * reflects it. Providers that expose updatePass do the provider-specific
   * work; the rest reuse createPass (Apple's model).
   */
  async updatePass(memberData, { provider } = {}) {
    const impl = this.getProvider(provider);
    if (typeof impl.updatePass === 'function') {
      const result = await impl.updatePass(memberData);
      return { ...result, provider: impl.name, updated: true };
    }
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
    if (result.provider === 'google') {
      // Google passes are not downloaded. The user is redirected to a signed
      // save URL, so there is no MIME type or filename to report.
      return {
        delivery: 'redirect',
        url: result.saveUrl,
        provider: 'google',
      };
    }
    return notImplemented(result.provider);
  }

  syncPassState({ serialNumber, authenticationToken, provider, objectId } = {}) {
    if (!serialNumber) validation('serialNumber is required');
    if (!authenticationToken) validation('authenticationToken is required');
    const impl = this.getProvider(provider);
    // Google has no device-side fetch: the object is patched server-side, so
    // there is no authentication token and nothing for the device to do.
    if (impl.name === 'google') {
      return { serialNumber, provider: 'google', action: 'server-patch', objectId };
    }
    return { serialNumber, provider: impl.name, action: 'fetch-latest' };
  }
}

function createWalletService(opts) {
  return new WalletService(opts);
}

module.exports = { WalletService, createWalletService };
