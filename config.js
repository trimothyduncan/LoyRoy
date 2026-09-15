'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

// Render mounts Secret Files at /etc/secrets/<filename> (flat names only).
// If the configured path doesn't exist but the same basename does there,
// use it — this keeps signing working even when *_PATH vars weren't updated.
function resolveCertPath(configured) {
  if (configured && fs.existsSync(configured)) return configured;
  const base = path.basename(configured || '');
  if (base) {
    const renderPath = path.join('/etc/secrets', base);
    if (fs.existsSync(renderPath)) {
      console.log(`config: ${configured} missing, falling back to ${renderPath}`);
      return renderPath;
    }
  }
  return configured;
}

const signerCertPath = resolveCertPath(env('SIGNER_CERT_PATH', './certificates/signerCert.pem'));
const signerKeyPath = resolveCertPath(env('SIGNER_KEY_PATH', './certificates/signerKey.pem'));
const wwdrPath = resolveCertPath(env('WWDR_PATH', './certificates/wwdr.pem'));

module.exports = {
  port: parseInt(env('PORT', '3000'), 10),
  nodeEnv: env('NODE_ENV', 'development'),
  signerCertPath,
  signerKeyPath,
  wwdrPath,
  signerKeyPassphrase: env('SIGNER_KEY_PASSPHRASE', ''),
  passTypeIdentifier: env('PASS_TYPE_IDENTIFIER', ''),
  appleTeamId: env('APPLE_TEAM_ID', ''),
  apnsKeyPath: resolveCertPath(env('APNS_KEY_PATH', '')),
};
