'use strict';

/**
 * services/wallet/appleProvider.js — Apple implementation of the wallet provider interface.
 *
 * Thin adapter over services/walletService.js (passkit-generator signing). All Apple
 * specifics (cert files, pass.json shape, QR payload, webServiceURL) stay in this module
 * and its delegate — never in routes or the dashboard. The provider interface:
 *
 *   { name, createPass(memberData) -> { buffer, serialNumber, authenticationToken } }
 *
 * Routes continue to require services/walletService directly (unchanged); new code goes
 * through services/wallet (WalletService facade) which delegates here for provider 'apple'.
 */

const walletService = require('../walletService');

const appleProvider = {
  name: 'apple',

  async createPass(memberData) {
    return walletService.generatePass(memberData);
  },

  buildPreview(memberData) {
    return walletService.buildPassJson(memberData);
  },
};

module.exports = { appleProvider };
