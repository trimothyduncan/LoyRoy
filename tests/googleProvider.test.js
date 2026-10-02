'use strict';

/**
 * Google Wallet provider tests.
 *
 * No network and no real credentials: an ephemeral RSA key pair is generated
 * per run, and the token/REST calls are stubbed. What is pinned here is the
 * behaviour the rest of the app depends on — the JWT shape and signature, the
 * save URL, the class/object relationship, QR parity with Apple, and the
 * failure contracts.
 */

const crypto = require('node:crypto');
const {
  createGoogleProvider,
  readCredentials,
  signSaveToWalletJwt,
  buildClass,
  buildObject,
  classSuffixFor,
  WALLET_API,
  SAVE_URL,
} = require('../services/wallet/googleProvider');

// A real key pair so signatures actually verify; nothing leaves the process.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const ENV = {
  GOOGLE_WALLET_ISSUER_ID: '3388000000000000000',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'loyroy@project.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
};

const MEMBER = {
  memberId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  name: 'Ada Lovelace',
  tier: 'gold',
  points: 1250,
};

function decodeJwt(token) {
  const [h, p, s] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    claims: JSON.parse(Buffer.from(p, 'base64url').toString()),
    signature: s,
    signingInput: `${h}.${p}`,
  };
}

function providerWith(over = {}) {
  return createGoogleProvider({ env: ENV, resolveArt: async () => ({}), ...over });
}

describe('readCredentials', () => {
  it('reads issuer, email and key from env', () => {
    const c = readCredentials(ENV);
    expect(c.issuerId).toBe(ENV.GOOGLE_WALLET_ISSUER_ID);
    expect(c.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('rejects each missing credential with a stable code', () => {
    const missing = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'];
    for (const key of missing) {
      const env = { ...ENV };
      delete env[key];
      expect(() => readCredentials(env)).toThrow(
        expect.objectContaining({ status: 500, code: 'GOOGLE_CONFIG_ERROR' })
      );
    }
  });

  // Render delivers secrets as an env var whose newlines arrive as \n.
  it('restores escaped newlines in a single-line PEM', () => {
    const escaped = privateKey.replace(/\n/g, '\\n');
    expect(escaped).not.toContain('\n');
    const c = readCredentials({ ...ENV, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: escaped });
    expect(c.privateKey).toContain('\n');
  });

  it('rejects a key that is not a PEM', () => {
    expect(() => readCredentials({ ...ENV, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not-a-key' })).toThrow(
      expect.objectContaining({ code: 'GOOGLE_CONFIG_ERROR' })
    );
  });
});

describe('signSaveToWalletJwt', () => {
  const credentials = readCredentials(ENV);

  it('produces a verifiable RS256 save-to-wallet JWT', () => {
    const token = signSaveToWalletJwt({
      credentials,
      classes: [{ id: '1.c' }],
      objects: [{ id: '1.o' }],
      origins: ['https://example.com'],
    });
    const { header, claims, signature, signingInput } = decodeJwt(token);
    expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT' });
    expect(claims).toMatchObject({ iss: ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL, aud: 'google', typ: 'savetowallet' });
    expect(claims.origins).toEqual(['https://example.com']);
    expect(claims.payload.loyaltyClasses).toHaveLength(1);
    expect(claims.payload.loyaltyObjects).toHaveLength(1);
    // Header and payload must be base64url (no +/ or =).
    expect(signingInput).not.toMatch(/[+/=]/);
    // The signature must verify against the matching public key.
    expect(
      crypto.verify(
        'RSA-SHA256',
        Buffer.from(signingInput),
        publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });

  it('omits empty collections and origins', () => {
    const token = signSaveToWalletJwt({ credentials, objects: [{ id: '1.o' }] });
    const { claims } = decodeJwt(token);
    expect(claims.payload.loyaltyClasses).toBeUndefined();
    expect(claims.payload.loyaltyObjects).toHaveLength(1);
    expect(claims.origins).toBeUndefined();
  });

  it('reports an unusable key as a config error, not a crash', () => {
    expect(() =>
      signSaveToWalletJwt({ credentials: { ...credentials, privateKey: 'garbage' } })
    ).toThrow(expect.objectContaining({ code: 'GOOGLE_CONFIG_ERROR' }));
  });
});

describe('buildClass / buildObject', () => {
  it('namespaces class and object under the issuer id', () => {
    const cls = buildClass({ issuerId: '3388000000000000000', tier: 'gold' });
    const obj = buildObject({ issuerId: '3388000000000000000', memberData: MEMBER });
    expect(cls.id).toBe('3388000000000000000.loyaltyTierGold');
    expect(obj.id).toBe('3388000000000000000.3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(obj.classId).toBe('3388000000000000000.loyaltyTierGold');
    expect(cls.reviewStatus).toBe('UNDER_REVIEW');
  });

  // Google rejects the save unless object.classId === class.id exactly. The
  // class id was once built without the issuer namespace, which produced
  // "gold.loyaltyTierGold" vs "...3388.loyaltyTierGold" and failed at save time.
  it('keeps classId identical to the class id for every tier', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'platinum', 'vip']) {
      const issuerId = '3388000000000000000';
      const cls = buildClass({ issuerId, tier });
      const obj = buildObject({ issuerId, memberData: { ...MEMBER, tier } });
      expect(obj.classId).toBe(cls.id);
      expect(obj.classId.startsWith(`${issuerId}.`)).toBe(true);
    }
  });

  it('derives one class suffix per tier', () => {
    expect(classSuffixFor('gold')).toBe('loyaltyTierGold');
    expect(classSuffixFor('GOLD')).toBe('loyaltyTierGold');
    expect(classSuffixFor('vip')).toBe('loyaltyTierVip');
  });

  it('caps a class per tier, not per member', () => {
    const a = buildObject({ issuerId: 'I', memberData: MEMBER });
    const b = buildObject({ issuerId: 'I', memberData: { ...MEMBER, memberId: 'other-id' } });
    expect(a.classId).toBe(b.classId);
  });

  // One scanner must read both platforms, so the QR value has to match Apple.
  it('encodes the same QR payload Apple uses', () => {
    const obj = buildObject({ issuerId: 'I', memberData: MEMBER });
    expect(obj.barcode).toEqual({ type: 'QR_CODE', value: `LOYROY-${MEMBER.memberId}` });
  });

  it('maps points into Google loyaltyPoints', () => {
    expect(buildObject({ issuerId: 'I', memberData: { ...MEMBER, points: 42 } }).loyaltyPoints).toEqual({
      label: 'Points',
      balance: { int: 42 },
    });
  });

  it('coerces a non-numeric balance to 0 rather than sending a string', () => {
    expect(buildObject({ issuerId: 'I', memberData: { ...MEMBER, points: 'abc' } }).loyaltyPoints.balance.int).toBe(0);
  });

  it('includes hero/brand art only when published', () => {
    const bare = buildObject({ issuerId: 'I', memberData: MEMBER });
    expect(bare.heroImage).toBeUndefined();
    const withArt = buildObject({
      issuerId: 'I',
      memberData: MEMBER,
      art: { artwork: 'https://cdn.example/a.png' },
    });
    expect(withArt.heroImage.sourceUri.uri).toBe('https://cdn.example/a.png');
    // Alt text is required alongside every image by Google.
    expect(withArt.heroImage.contentDescription.defaultValue.value).toContain('Ada');
  });

  it('rejects a memberId Google would refuse as an id', () => {
    expect(() => buildObject({ issuerId: 'I', memberData: { ...MEMBER, memberId: 'bad id!' } })).toThrow(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' })
    );
  });

  it('requires a memberId', () => {
    expect(() => buildObject({ issuerId: 'I', memberData: {} })).toThrow(
      expect.objectContaining({ status: 400 })
    );
  });
});

describe('googleProvider.createPass', () => {
  it('returns a save URL carrying the class and object', async () => {
    const out = await providerWith().createPass(MEMBER);
    expect(out.saveUrl.startsWith(`${SAVE_URL}/`)).toBe(true);
    expect(out.objectId).toBe(`3388000000000000000.${MEMBER.memberId}`);
    expect(out.classId).toBe('3388000000000000000.loyaltyTierGold');
    expect(out.serialNumber).toBe(`LOYROY-${MEMBER.memberId}`);
    const { claims } = decodeJwt(out.saveUrl.split(`${SAVE_URL}/`)[1]);
    expect(claims.payload.loyaltyObjects[0].id).toBe(out.objectId);
    expect(claims.payload.loyaltyClasses[0].id).toBe(out.classId);
  });

  it('resolves art through the injected resolver', async () => {
    const seen = [];
    const out = await providerWith({
      resolveArt: async (tier) => {
        seen.push(tier);
        return { artwork: 'https://cdn.example/hero.png', primaryLogo: 'https://cdn.example/logo.png' };
      },
    }).createPass(MEMBER);
    expect(seen).toEqual(['gold']);
    const { claims } = decodeJwt(out.saveUrl.split(`${SAVE_URL}/`)[1]);
    expect(claims.payload.loyaltyObjects[0].heroImage.sourceUri.uri).toBe('https://cdn.example/hero.png');
    expect(claims.payload.loyaltyClasses[0].logo.sourceUri.uri).toBe('https://cdn.example/logo.png');
  });

  it('fails with a config error when credentials are absent', async () => {
    const p = createGoogleProvider({ env: {}, resolveArt: async () => ({}) });
    await expect(p.createPass(MEMBER)).rejects.toMatchObject({ code: 'GOOGLE_CONFIG_ERROR' });
  });
});

describe('googleProvider.updatePass', () => {
  function stubFetch(responses) {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, opts });
      const r = responses.shift();
      return { ok: r.status < 400, status: r.status, json: async () => r.body || {} };
    };
    return { fetchImpl, calls };
  }

  async function authedFetch(responses) {
    // First call is the token exchange, second is the PATCH.
    const s = stubFetch([{ status: 200, body: { access_token: 'tok-123' } }, ...responses]);
    return s;
  }

  it('exchanges a signed assertion for a token then PATCHes the object', async () => {
    const { fetchImpl, calls } = await authedFetch([{ status: 200, body: { id: 'ok' } }]);
    const out = await providerWith({ fetchImpl }).updatePass(MEMBER);
    expect(out).toMatchObject({ updated: true, objectId: `3388000000000000000.${MEMBER.memberId}` });

    const tokenCall = calls[0];
    expect(tokenCall.url).toBe('https://oauth2.googleapis.com/token');
    // The assertion must be a real RS256 JWT over the account's own key.
    const assertion = new URLSearchParams(tokenCall.opts.body).get('assertion');
    expect(decodeJwt(assertion).claims).toMatchObject({ scope: expect.stringContaining('wallet_object.issuer') });
    expect(
      crypto.verify('RSA-SHA256', Buffer.from(assertion.split('.').slice(0, 2).join('.')), publicKey,
        Buffer.from(assertion.split('.')[2], 'base64url'))
    ).toBe(true);

    const patch = calls[1];
    expect(patch.url).toBe(`${WALLET_API}/loyaltyobject/3388000000000000000.${MEMBER.memberId}`);
    expect(patch.opts.method).toBe('PATCH');
    expect(patch.opts.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(patch.opts.body).loyaltyPoints.balance.int).toBe(1250);
  });

  it('maps a token failure to GOOGLE_AUTH_ERROR without leaking the key', async () => {
    const { fetchImpl } = stubFetch([{ status: 401, body: { error_description: 'Invalid JWT signature' } }]);
    const err = await providerWith({ fetchImpl }).updatePass(MEMBER).catch((e) => e);
    expect(err.code).toBe('GOOGLE_AUTH_ERROR');
    expect(err.status).toBe(502);
    expect(err.message).not.toContain('BEGIN PRIVATE KEY');
    expect(err.message).not.toContain(privateKey);
  });

  it('maps a missing object to 404 and rate limiting to 429', async () => {
    const notFound = await authedFetch([{ status: 404, body: { error: { message: 'not found' } } }]);
    await expect(providerWith({ fetchImpl: notFound.fetchImpl }).updatePass(MEMBER)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    const limited = await authedFetch([{ status: 429, body: {} }]);
    await expect(providerWith({ fetchImpl: limited.fetchImpl }).updatePass(MEMBER)).rejects.toMatchObject({
      status: 429,
      code: 'GOOGLE_RATE_LIMITED',
    });
  });
});