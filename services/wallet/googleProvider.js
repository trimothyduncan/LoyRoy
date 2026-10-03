'use strict';

/**
 * services/wallet/googleProvider.js — Google Wallet implementation of the
 * wallet provider interface.
 *
 * Google is not a file you hand the user. A pass is a pair of REST resources
 * owned by the issuer:
 *
 *   LoyaltyClass  — the shared design for a program (one per tier here)
 *   LoyaltyObject — the per-member instance
 *
 * Distribution happens through a signed "save to wallet" JWT: the browser is
 * sent to https://pay.google.com/gp/v/save/<jwt>, and Google creates the class
 * and/or object when the user saves it. That is why createPass returns a URL
 * rather than a Buffer — there is no binary artifact to stream.
 *
 * Updating differs fundamentally from Apple: there is no web-service poll. The
 * server PATCHes the LoyaltyObject and the installed pass reflects it. See
 * syncPassState below.
 *
 * All Google specifics (issuer ID, service account, REST calls, JWT claims)
 * stay inside this module. Routes and the dashboard never see them.
 *
 * Credentials (env): GOOGLE_WALLET_ISSUER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
 * GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
 */

const crypto = require('node:crypto');

const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const SAVE_URL = 'https://pay.google.com/gp/v/save';
// Google object/class suffixes accept alphanumerics, '.', '_' and '-' only.
// Member ids are uuids, so they pass through unchanged.
const ID_SAFE = /^[A-Za-z0-9._-]+$/;

function configError(message, code = 'GOOGLE_CONFIG_ERROR') {
  const err = new Error(message);
  err.status = 500;
  err.code = code;
  return err;
}

function validation(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

/**
 * Read Google credentials from the environment.
 *
 * Issuer id and client email are plain env vars (not sensitive). The private
 * key is also read from its env var — either a real multi-line PEM or one
 * with literal "\n" escapes, both normalized here. Unlike the Apple-side
 * certs, there is no secret-file lookup: paste the key content as the value.
 */
function readCredentials(env = process.env) {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID;
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!issuerId) throw configError('GOOGLE_WALLET_ISSUER_ID is not set.');
  if (!clientEmail) throw configError('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');
  if (!privateKey) throw configError('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set.');

  if (privateKey.includes('\\n') && !privateKey.includes('\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw configError(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not look like a PEM private key.'
    );
  }

  return { issuerId, clientEmail, privateKey };
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign a save-to-wallet JWT (RS256).
 *
 * Implemented with node:crypto rather than a JWT dependency: the algorithm set
 * is fixed at RS256 and the claims are a flat object, so a library would add a
 * dependency without removing any real complexity.
 */
function signSaveToWalletJwt({ credentials, classes = [], objects = [], origins }) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: credentials.clientEmail,
    aud: 'google',
    iat: now,
    exp: now + 3600,
    typ: 'savetowallet',
    ...(origins && origins.length ? { origins } : {}),
    payload: {
      ...(classes.length ? { loyaltyClasses: classes } : {}),
      ...(objects.length ? { loyaltyObjects: objects } : {}),
    },
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), credentials.privateKey);
  } catch (err) {
    throw configError(`could not sign the Google Wallet JWT: ${err.message}`);
  }
  return `${signingInput}.${b64url(signature)}`;
}

function assertSafeId(value, label) {
  if (!ID_SAFE.test(String(value || ''))) {
    throw validation(`${label} must contain only letters, numbers, '.', '_' or '-'.`);
  }
  return String(value);
}

/** Google image reference: a publicly fetchable URI plus required alt text. */
function imageFromUrl(uri, description) {
  if (!uri) return undefined;
  return {
    sourceUri: { uri },
    contentDescription: { defaultValue: { language: 'en-US', value: description } },
  };
}

/**
 * LoyaltyClass for a tier — the design shared by every member on that tier.
 *
 * The id MUST be `{issuerId}.{suffix}` and a LoyaltyObject's classId must match
 * it exactly, or Google rejects the save. Verified by tests asserting the two
 * are equal.
 *
 * `heroImage` is the full-bleed art; Google's equivalent of Poster Generic's
 * artwork.png, so the same published `artwork` slot feeds both platforms.
 *
 * Google has no foreground/text colour on LoyaltyClass (it derives text colour
 * from the background), so only hexBackgroundColor is mapped — tier text
 * colours from the Apple side do not transfer.
 */
function buildClass({ issuerId, tier, art = {}, orgName = 'LoyRoy', backgroundColor }) {
  const id = String(tier || '').toLowerCase().trim();
  return {
    id: `${issuerId}.${classSuffixFor(id)}`,
    issuerName: orgName,
    reviewStatus: 'UNDER_REVIEW',
    programName: orgName,
    ...(art.primaryLogo
      ? { logo: imageFromUrl(art.primaryLogo, `${orgName} logo`) }
      : {}),
    ...(art.strip ? { heroImage: imageFromUrl(art.strip, `${orgName} ${id} card art`) } : {}),
    ...(backgroundColor ? { hexBackgroundColor: backgroundColor } : {}),
  };
}

/**
 * The suffix half of a tier's class id, shared by class and object.
 *
 * Lowercased here so callers cannot produce two different class ids for the
 * same tier by passing "Gold" vs "gold" — which would strand members issued
 * against the older class.
 */
function classSuffixFor(tier) {
  const id = assertSafeId(String(tier || '').toLowerCase().trim(), 'tier');
  return `loyaltyTier${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

/**
 * LoyaltyObject for one member.
 *
 * classId must equal the LoyaltyClass id exactly. Both derive from
 * classSuffixFor(tier), so they cannot drift apart.
 *
 * The QR value intentionally matches Apple's (LOYROY-<memberId>) so a single
 * scanner handles both platforms.
 */
function buildObject({ issuerId, memberData, art = {}, classSuffix }) {
  const {
    memberId,
    name = 'Member',
    tier = 'bronze',
    points = 0,
  } = memberData;
  if (!memberId) throw validation('memberId is required');

  const objectSuffix = assertSafeId(memberId, 'memberId');
  const resolvedClass = classSuffix || classSuffixFor(tier);

  return {
    id: `${issuerId}.${objectSuffix}`,
    classId: `${issuerId}.${resolvedClass}`,
    state: 'ACTIVE',
    accountId: String(memberId),
    accountName: name,
    // Google's own points model keeps the balance in sync with the app's.
    loyaltyPoints: { label: 'Points', balance: { int: Number(points) || 0 } },
    barcode: { type: 'QR_CODE', value: `LOYROY-${memberId}` },
    ...(art.artwork ? { heroImage: imageFromUrl(art.artwork, `${name} loyalty card`) } : {}),
    textModulesData: [
      { id: 'TIER', header: 'TIER', body: String(tier).toUpperCase() },
      { id: 'MEMBER', header: 'MEMBER', body: name },
    ],
  };
}

/**
 * Service-account access token for the REST API.
 *
 * Used for updates only; issuing a pass needs no token, since the save JWT
 * carries the payload. Kept separate so the token never reaches a URL.
 */
async function getAccessToken({ credentials, fetchImpl = fetch, now = () => Date.now() }) {
  const issued = Math.floor(now() / 1000);
  const assertion = {
    iss: credentials.clientEmail,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: issued,
    exp: issued + 3600,
  };
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify(assertion)
  )}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), credentials.privateKey);
  } catch (err) {
    throw configError(`could not sign the Google service-account assertion: ${err.message}`);
  }
  const assertionJwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertionJwt,
    }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const err = new Error(
      `google auth failed (${res.status}): ${body.error_description || body.error || 'no token returned'}`
    );
    err.status = 502;
    err.code = 'GOOGLE_AUTH_ERROR';
    throw err;
  }
  return body.access_token;
}

/** Map Google REST errors onto the app's error contract. */
function mapGoogleError(status, body, context) {
  const detail =
    (body && (body.error?.message || body.message)) || `HTTP ${status}`;
  const err = new Error(`google wallet ${context}: ${detail}`);
  if (status === 401 || status === 403) {
    err.status = 502;
    err.code = 'GOOGLE_AUTH_ERROR';
  } else if (status === 404) {
    err.status = 404;
    err.code = 'NOT_FOUND';
  } else if (status === 429) {
    err.status = 429;
    err.code = 'GOOGLE_RATE_LIMITED';
  } else {
    err.status = 502;
    err.code = 'GOOGLE_API_ERROR';
  }
  return err;
}

/**
 * Build the provider. `resolveArt(tier)` is injected so this module never
 * reaches into the database or storage directly — routes/tests supply it, and
 * the default falls back to no art so pass generation works before any is
 * published.
 */
function createGoogleProvider({
  env = process.env,
  resolveArt = async () => ({}),
  origins = [],
  fetchImpl = fetch,
} = {}) {
  return {
    name: 'google',

    /**
     * Issue a pass. Returns a save URL plus the resource ids, so the caller can
     * persist them for later updates.
     */
    async createPass(memberData) {
      const credentials = readCredentials(env);
      const tier = String(memberData.tier || 'bronze').toLowerCase();
      const art = await resolveArt(tier);

      const loyaltyClass = buildClass({ issuerId: credentials.issuerId, tier, art });
      const loyaltyObject = buildObject({
        issuerId: credentials.issuerId,
        memberData,
        art,
      });

      const jwt = signSaveToWalletJwt({
        credentials,
        classes: [loyaltyClass],
        objects: [loyaltyObject],
        origins,
      });

      return {
        // No Buffer: a Google pass is delivered as a link.
        saveUrl: `${SAVE_URL}/${jwt}`,
        objectId: loyaltyObject.id,
        classId: loyaltyClass.id,
        serialNumber: `LOYROY-${memberData.memberId}`,
      };
    },

    /**
     * Update an installed pass.
     *
     * Google has no device poll like Apple's web service: the resource itself
     * is the source of truth and the installed pass reflects it. So this
     * PATCHes the LoyaltyObject rather than handing anything to the device.
     */
    /**
     * Update an installed pass.
     *
     * Google has no device poll like Apple's web service: the resource itself
     * is the source of truth and the installed pass reflects it. So this
     * PATCHes the LoyaltyObject rather than handing anything to the device.
     *
     * First-update subtlety: issuing only mints a signed save JWT — Google
     * creates the class/object when the user actually saves the pass. If the
     * member never saved it, there is nothing to PATCH (404). In that case
     * the class is ensured and the object is POSTed, so the pass exists with
     * current data instead of failing forever on an object that was never
     * materialized.
     */
    async updatePass(memberData) {
      const credentials = readCredentials(env);
      const tier = String(memberData.tier || 'bronze').toLowerCase();
      const art = await resolveArt(tier);
      const loyaltyClass = buildClass({ issuerId: credentials.issuerId, tier, art });
      const object = buildObject({
        issuerId: credentials.issuerId,
        memberData,
        art,
      });
      const token = await getAccessToken({ credentials, fetchImpl });
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const objectUrl = `${WALLET_API}/loyaltyObject/${object.id}`;
      const patchBody = JSON.stringify({
        state: object.state,
        accountName: object.accountName,
        loyaltyPoints: object.loyaltyPoints,
        ...(object.heroImage ? { heroImage: object.heroImage } : {}),
        textModulesData: object.textModulesData,
      });

      const patched = await fetchImpl(objectUrl, { method: 'PATCH', headers, body: patchBody });
      if (patched.ok) {
        return { objectId: object.id, updated: true, serialNumber: `LOYROY-${memberData.memberId}` };
      }
      if (patched.status !== 404) {
        throw mapGoogleError(patched.status, await patched.json().catch(() => ({})), 'update');
      }

      // Object was never materialized (pass issued but never saved, or
      // created under a different flow). Ensure the class, then create it.
      const classUrl = `${WALLET_API}/loyaltyClass/${loyaltyClass.id}`;
      const gotClass = await fetchImpl(classUrl, { headers });
      if (gotClass.status === 404) {
        const madeClass = await fetchImpl(`${WALLET_API}/loyaltyClass`, {
          method: 'POST',
          headers,
          body: JSON.stringify(loyaltyClass),
        });
        if (!madeClass.ok && madeClass.status !== 409) {
          throw mapGoogleError(madeClass.status, await madeClass.json().catch(() => ({})), 'create class');
        }
      } else if (!gotClass.ok) {
        throw mapGoogleError(gotClass.status, await gotClass.json().catch(() => ({})), 'read class');
      }
      const madeObject = await fetchImpl(`${WALLET_API}/loyaltyObject`, {
        method: 'POST',
        headers,
        body: JSON.stringify(object),
      });
      if (madeObject.ok) {
        return {
          objectId: object.id,
          updated: true,
          created: true,
          serialNumber: `LOYROY-${memberData.memberId}`,
        };
      }
      if (madeObject.status === 409) {
        // Lost a race with another writer: the object exists now, PATCH once.
        const retry = await fetchImpl(objectUrl, { method: 'PATCH', headers, body: patchBody });
        if (retry.ok) {
          return { objectId: object.id, updated: true, serialNumber: `LOYROY-${memberData.memberId}` };
        }
        throw mapGoogleError(retry.status, await retry.json().catch(() => ({})), 'update');
      }
      throw mapGoogleError(madeObject.status, await madeObject.json().catch(() => ({})), 'create object');
    },

    buildPreview(memberData) {
      const tier = String(memberData.tier || 'bronze').toLowerCase();
      return {
        loyaltyClass: buildClass({ issuerId: 'ISSUER', tier }),
        loyaltyObject: buildObject({ issuerId: 'ISSUER', memberData }),
      };
    },
  };
}

module.exports = {
  createGoogleProvider,
  readCredentials,
  signSaveToWalletJwt,
  buildClass,
  buildObject,
  classSuffixFor,
  getAccessToken,
  WALLET_API,
  SAVE_URL,
  SCOPE,
};