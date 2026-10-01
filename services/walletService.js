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
const { PKPass, PassType } = require('passkit-generator');

const config = require('../config');
const { buildQrPayload } = require('./qrService');

const PASSES_BASE_DIR = path.join(__dirname, '..', 'passes');
// Legacy storeCard assets. Required for the iOS 26-and-earlier fallback.
const TEMPLATE_ASSET_NAMES = ['icon.png', 'icon@2x.png', 'logo.png', 'logo@2x.png', 'strip.png'];
// Poster Generic assets (iOS 27+). Optional: an unbranded pass still renders,
// it just has no background artwork / primary logo until the merchant uploads
// them through the Art Studio. artwork.png is the full-bleed background
// (358x448pt); primaryLogo.png sits over it.
const POSTER_ASSET_NAMES = ['artwork.png', 'primaryLogo.png'];

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
    err.status = 500;
    // PASS_FILE_ERROR (missing/unreadable file, e.g. no certificates/ checkout
    // on CI) vs PASS_KEY_ERROR (encrypted key, no passphrase) — both fail fast.
    // Assigned unconditionally: fs errors arrive with codes like ENOENT that
    // would otherwise leak through and break the error contract.
    err.code = 'PASS_FILE_ERROR';
    throw err;
  }
}

function loadTemplateAssets(templateDir) {
  const assets = {};
  for (const name of TEMPLATE_ASSET_NAMES) {
    assets[name] = loadFile(path.join(templateDir, name), `template asset ${name}`);
  }
  for (const name of POSTER_ASSET_NAMES) {
    const p = path.join(templateDir, name);
    if (fs.existsSync(p)) assets[name] = loadFile(p, `template asset ${name}`);
  }
  return assets;
}

/**
 * Per-tier artwork with shared fallback. Drop a tier's PNGs into
 * `passes/<tier>.pass/` (e.g. `passes/gold.pass/strip.png`) and gold
 * members pick them up automatically — no code change. Tiers without
 * their own directory use `passes/shared/`. `baseDir` is injectable
 * for tests; production always uses the passes/ directory.
 */
function templateDirForTier(tier, baseDir = PASSES_BASE_DIR) {
  const name = String(tier || '').toLowerCase().trim();
  if (name) {
    const candidate = path.join(baseDir, `${name}.pass`);
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Missing tier dir → shared fallback below.
    }
  }
  return path.join(baseDir, 'shared');
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

  // storeCard is kept as the iOS 26-and-earlier fallback; iOS 27+ picks up
  // posterGeneric, which renders fields over artwork.png. Apple only displays
  // the poster layout when the pass declares the posterGeneric key, and falls
  // back per-device, so shipping both keeps older members working.
  return {
    description: 'LoyRoy Membership',
    organizationName: 'LoyRoy',
    serialNumber,
    authenticationToken,
    ...style,
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(200, 200, 200)',
    posterGeneric: {
      headerFields: [{ key: 'tier', label: 'TIER', value: tierLabel }],
      // First primary field with an empty label renders as the large title.
      primaryFields: [
        { key: 'name', label: '', value: name },
        { key: 'points', label: 'POINTS', value: points },
      ],
      secondaryFields: [{ key: 'member', label: 'MEMBER', value: name }],
      // Only the first footer field is displayed on a poster pass.
      footerFields: [{ key: 'org', label: '', value: 'LoyRoy Membership' }],
      backFields: [
        {
          key: 'terms',
          label: 'TERMS',
          value: 'Points and tier are managed by LoyRoy. Present this pass at checkout.',
        },
      ],
    },
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
 * Assemble the pass-package image set for a member.
 *
 * Prefers art published through the Art Studio (Supabase Storage is the only
 * durable copy — see services/artService.js). Falls back to the on-disk
 * template directory when no storage is wired (tests, or a boot without
 * credentials) so structural pass generation keeps working.
 */
async function resolveAssets(memberData, opts) {
  if (opts.templateDir) {
    return loadTemplateAssets(opts.templateDir);
  }
  if (opts.artResolver) {
    const { assets } = await opts.artResolver(memberData.tier);
    return assets;
  }
  return loadTemplateAssets(templateDirForTier(memberData.tier));
}

/**
 * Generate a signed .pkpass for one member.
 * @param {object} memberData { memberId, name, tier, points, serialNumber?, authenticationToken?, webServiceURL? }
 * @param {object} [opts] { passTypeIdentifier?, teamIdentifier?, templateDir?, artResolver? }
 *   templateDir — test-only filesystem override. artResolver — async
 *   (tier) => { assets, slots, missing }, injected in production to read
 *   published art from Supabase Storage. Neither is set by routes.
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
    await resolveAssets(memberData, opts),
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

  // Poster Generic (iOS 27+) + storeCard fallback (iOS 26 and earlier).
  //
  // The `type` setter is deprecated and RESETS the pass to a single style, so
  // it cannot be used here — it would drop posterGeneric. The constructor also
  // cannot carry the style keys: OverridablePassProps does not include them, so
  // joi strips them. `types` is getter-only and hands back the live array, so
  // both styles are built explicitly and pushed into it.
  pass.types.push(
    ...['posterGeneric', 'storeCard'].map((type) => {
      const passType = new PassType(type);
      const groups = type === 'posterGeneric'
        ? ['headerFields', 'primaryFields', 'secondaryFields', 'footerFields', 'backFields']
        : ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields'];
      for (const group of groups) {
        for (const field of passJson[type][group] || []) {
          passType[group].push(field);
        }
      }
      return passType;
    })
  );

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

module.exports = { generatePass, buildPassJson, TIER_STYLES, templateDirForTier };
