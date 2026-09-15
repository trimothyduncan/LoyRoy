'use strict';

/**
 * walletService — passkit-generator wrapper.
 *
 * Owns certificate loading (paths from env, see config.js) and exposes
 * generatePass(memberData) returning a signed .pkpass Buffer.
 * Called from multiple routes (create-pass, update-points, redeem), so all
 * pass-building logic lives here, never inline in route handlers.
 *
 * Required env for a *device-installable* pass:
 *   PASS_TYPE_IDENTIFIER, APPLE_TEAM_ID  (must match the signing cert)
 * Structural generation (tests) works without them but the output will not
 * install on a real device.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PKPass } = require('passkit-generator');

const config = require('../config');
const { buildQrPayload } = require('./qrService');

const TEMPLATE_DIR = path.join(__dirname, '..', 'passes', 'vipMembership.pass');

const TIER_STYLES = {
  bronze: { backgroundColor: 'rgb(120, 72, 20)' },
  silver: { backgroundColor: 'rgb(110, 110, 120)' },
  gold: { backgroundColor: 'rgb(139, 105, 20)' },
  platinum: { backgroundColor: 'rgb(40, 40, 48)' },
  vip: { backgroundColor: 'rgb(20, 20, 20)' },
};

function loadFile(filePath, label) {
  try {
    return fs.readFileSync(filePath);
  } catch (err) {
    err.message = `walletService: cannot read ${label} at ${filePath}: ${err.message}`;
    throw err;
  }
}

function loadTemplateAssets() {
  const assets = {};
  for (const name of ['icon.png', 'icon@2x.png', 'logo.png', 'logo@2x.png', 'strip.png']) {
    assets[name] = loadFile(path.join(TEMPLATE_DIR, name), `template asset ${name}`);
  }
  return assets;
}

/**
 * Build the per-member pass.json override object.
 * Pure function (no I/O) so routes/tests can inspect fields without signing.
 */
function buildPassJson(memberData) {
  const {
    memberId,
    name = 'Member',
    tier = 'bronze',
    points = 0,
    serialNumber = buildQrPayload(memberData.memberId),
    authenticationToken = crypto.randomUUID(),
  } = memberData;

  if (!memberId) {
    const err = new Error('walletService: memberData.memberId is required');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const style = TIER_STYLES[String(tier).toLowerCase()] || TIER_STYLES.bronze;
  const tierLabel = String(tier).toUpperCase();

  return {
    description: 'LoyRoy Membership',
    organizationName: 'LoyRoy',
    serialNumber,
    authenticationToken,
    ...style,
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(200, 200, 200)',
    storeCard: {
      headerFields: [{ key: 'tier', label: 'TIER', value: tierLabel }],
      primaryFields: [{ key: 'points', label: 'POINTS', value: points }],
      secondaryFields: [{ key: 'member', label: 'MEMBER', value: name }],
      auxiliaryFields: [{ key: 'memberId', label: 'MEMBER ID', value: String(memberId) }],
      backFields: [
        {
          key: 'terms',
          label: 'TERMS',
          value: 'Points and tier are managed by LoyRoy. Present this pass at checkout.',
        },
      ],
    },
  };
}

/**
 * Generate a signed .pkpass for one member.
 * @param {object} memberData { memberId, name, tier, points, serialNumber?, authenticationToken?, webServiceURL? }
 * @param {object} [opts] { passTypeIdentifier?, teamIdentifier? } — test-only overrides, never used in routes.
 * @returns {Promise<{ buffer: Buffer, serialNumber: string, authenticationToken: string }>}
 */
async function generatePass(memberData, opts = {}) {
  const passTypeIdentifier = opts.passTypeIdentifier || config.passTypeIdentifier;
  const teamIdentifier = opts.teamIdentifier || config.appleTeamId;

  if (!passTypeIdentifier || !teamIdentifier) {
    const err = new Error(
      'walletService: PASS_TYPE_IDENTIFIER and APPLE_TEAM_ID must be set (env or opts) — ' +
        'they must match the Pass Type ID / Team ID on the signing certificate.'
    );
    err.status = 500;
    err.code = 'PASS_CONFIG_ERROR';
    throw err;
  }

  const passJson = buildPassJson(memberData);

  const signerKey = loadFile(config.signerKeyPath, 'signer key');
  if (signerKey.includes('ENCRYPTED PRIVATE KEY') && !config.signerKeyPassphrase) {
    const err = new Error(
      'walletService: signer key is encrypted but SIGNER_KEY_PASSPHRASE is not set.'
    );
    err.status = 500;
    err.code = 'PASS_KEY_ERROR';
    throw err;
  }

  const pass = new PKPass(
    loadTemplateAssets(),
    {
      wwdr: loadFile(config.wwdrPath, 'WWDR cert'),
      signerCert: loadFile(config.signerCertPath, 'signer cert'),
      signerKey,
      ...(config.signerKeyPassphrase ? { signerKeyPassphrase: config.signerKeyPassphrase } : {}),
    },
    {
      passTypeIdentifier,
      teamIdentifier,
      ...passJson,
      // webServiceURL enables on-device updates (Phase 6). Only embedded when known.
      ...(memberData.webServiceURL ? { webServiceURL: memberData.webServiceURL } : {}),
    }
  );

  pass.type = 'storeCard';

  for (const [group, fields] of Object.entries(passJson.storeCard)) {
    for (const field of fields) {
      pass[group].push(field);
    }
  }

  // QR payload resolves to the member (Phase 5 scans feed /redeem, /member/:id).
  pass.setBarcodes({
    message: buildQrPayload(memberData.memberId),
    format: 'PKBarcodeFormatQR',
    messageEncoding: 'iso-8859-1',
    altText: `Member ${memberData.memberId}`,
  });

  return {
    buffer: pass.getAsBuffer(),
    serialNumber: passJson.serialNumber,
    authenticationToken: passJson.authenticationToken,
  };
}

module.exports = { generatePass, buildPassJson, TIER_STYLES };
