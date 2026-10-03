'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { serviceAuth } = require('./middleware/serviceAuth');
const { createAppRouter } = require('./routes/appApi');
const { createAdminRouter } = require('./routes/admin');
const { createAnalyticsRouter } = require('./routes/analytics');
const { createAppleRouter } = require('./routes/appleWebService');

// Lazy DB proxy: the server boots without credentials; only code paths that
// actually touch the database throw DB_CONFIG_ERROR (see database/db.js).
function lazyDb() {
  const { getDb } = require('./database/db');
  return new Proxy(
    {},
    {
      get(_target, prop) {
        return (...args) => getDb()[prop](...args);
      },
    }
  );
}

/**
 * Wrap the real walletService so every generatePass() renders the merchant's
 * published art from Supabase Storage.
 *
 * The bucket is read per call rather than captured, so a deploy that sets
 * SUPABASE_STORAGE_BUCKET does not need a restart to take effect. With no
 * bucket configured the resolver returns the bundled 1x1 placeholders, which
 * keeps pass generation working instead of failing.
 */
function createStorageBackedWallet(db, injectedStorage) {
  const walletService = require('./services/walletService');
  const { resolveTierAssets } = require('./services/artService');

  return {
    ...walletService,
    generatePass(memberData, opts = {}) {
      const artResolver =
        opts.artResolver ||
        ((tier) => {
          const bucket = process.env.SUPABASE_STORAGE_BUCKET;
          const storage = injectedStorage || require('./database/db').getDb().storage;
          return resolveTierAssets({ db, storage, bucket }, tier);
        });
      return walletService.generatePass(memberData, { ...opts, artResolver });
    },
  };
}

/**
 * Provider facade for wallet issuance across Apple and Google.
 *
 * Routes that accept provider=google go through this instead of the legacy
 * Apple-only walletService above. Google art reuses the same Storage-published
 * slots (primaryLogo/strip/artwork) mapped to public URLs; without storage or
 * a bucket the resolver yields no art and issuance still works.
 */
function createProviderWalletService(db, injectedStorage) {
  const { createWalletService } = require('./services/wallet');
  const { appleProvider } = require('./services/wallet/appleProvider');
  const { createGoogleProvider } = require('./services/wallet/googleProvider');
  const { getPublishedArt } = require('./services/artService');

  const resolveArt = async (tier) => {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    const storage = injectedStorage || require('./database/db').getDb().storage;
    if (!storage || !bucket || typeof storage.from !== 'function') return {};
    let rows;
    try {
      rows = await getPublishedArt(db, tier);
    } catch {
      return {};
    }
    const art = {};
    for (const row of rows || []) {
      if (!['primaryLogo', 'strip', 'artwork'].includes(row.slot)) continue;
      if (art[row.slot] || !row.storage_path) continue; // rows are newest-first
      try {
        const { data } = storage.from(bucket).getPublicUrl(row.storage_path);
        if (data && data.publicUrl) art[row.slot] = data.publicUrl;
      } catch {
        // One bad slot must not kill issuance; the pass just ships without it.
      }
    }
    return art;
  };

  return createWalletService({
    providers: { apple: appleProvider, google: createGoogleProvider({ resolveArt }) },
  });
}

function createApp({ db, wallet, push, passTypeIdentifier, storage, walletService } = {}) {
  const app = express();
  const database = db || lazyDb();

  // The real wallet service renders art from Supabase Storage (the only durable
  // copy — Render has no persistent disk). Tests inject a fake `wallet` and are
  // left untouched.
  const appleWallet = wallet || createStorageBackedWallet(database, storage);

  // Provider facade (Apple + Google). An explicit `walletService: null`
  // disables it (google issuance reports 501); otherwise a real facade is
  // built. Tests inject a stub to avoid touching credentials.
  const providerWallets =
    walletService !== undefined ? walletService : createProviderWalletService(database, storage);

  app.use(cors());
  // 8mb accommodates base64 pass-asset uploads on /admin/upload-asset
  // (service-key gated); all other bodies are far smaller.
  app.use(express.json({ limit: '8mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Section B: Apple Wallet Web Service — Apple's own auth scheme, no service key.
  app.use('/apple', createAppleRouter({ db: database, wallet: appleWallet, passTypeIdentifier }));

  app.use(serviceAuth);
  app.use(createAdminRouter({ db: database, storage }));
  app.use(createAnalyticsRouter({ db: database }));
  app.use(
    createAppRouter({
      db: database,
      wallet: appleWallet,
      push: push || require('./services/pushService'),
      walletService: providerWallets,
    })
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`LoyRoy API listening on :${config.port} (${config.nodeEnv})`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
