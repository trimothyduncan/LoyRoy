'use strict';

require('dotenv').config();

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

module.exports = {
  port: parseInt(env('PORT', '3000'), 10),
  nodeEnv: env('NODE_ENV', 'development'),
  signerCertPath: env('SIGNER_CERT_PATH', './certificates/signerCert.pem'),
  signerKeyPath: env('SIGNER_KEY_PATH', './certificates/signerKey.pem'),
  wwdrPath: env('WWDR_PATH', './certificates/wwdr.pem'),
  signerKeyPassphrase: env('SIGNER_KEY_PASSPHRASE', ''),
  passTypeIdentifier: env('PASS_TYPE_IDENTIFIER', ''),
  appleTeamId: env('APPLE_TEAM_ID', ''),
};
