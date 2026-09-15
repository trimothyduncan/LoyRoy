'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { serviceAuth } = require('./middleware/serviceAuth');
const { createAppRouter } = require('./routes/appApi');
const { createAdminRouter } = require('./routes/admin');
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

function createApp({ db, wallet, push, passTypeIdentifier } = {}) {
  const app = express();
  const database = db || lazyDb();
  const walletService = wallet || require('./services/walletService');

  app.use(cors());
  // 8mb accommodates base64 pass-asset uploads on /admin/upload-asset
  // (service-key gated); all other bodies are far smaller.
  app.use(express.json({ limit: '8mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Section B: Apple Wallet Web Service — Apple's own auth scheme, no service key.
  app.use('/apple', createAppleRouter({ db: database, wallet: walletService, passTypeIdentifier }));

  app.use(serviceAuth);
  app.use(createAdminRouter());
  app.use(
    createAppRouter({
      db: database,
      wallet: walletService,
      push: push || require('./services/pushService'),
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
