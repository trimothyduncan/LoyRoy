'use strict';

/**
 * Generate a sample .pkpass from mock member data.
 * Usage: PASS_TYPE_IDENTIFIER=pass.com.x.y APPLE_TEAM_ID=XXXX node scripts/generate-sample-pass.js
 * Output: tmp/sample.pkpass (git-ignored via *.pkpass).
 */

const fs = require('node:fs');
const path = require('node:path');
const { generatePass } = require('../services/walletService');

async function main() {
  // members.id is a uuid column — a short id like "C001" produces a pass whose
  // QR the scanner resolves to a member that can never exist.
  const { buffer, serialNumber } = await generatePass({
    memberId: process.env.SAMPLE_MEMBER_ID || '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    name: 'Jane Appleseed',
    tier: 'gold',
    points: 1250,
    ...(process.env.PUBLIC_BASE_URL
      ? { webServiceURL: `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/apple` }
      : {}),
  });

  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sample.pkpass');
  fs.writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.length} bytes), serial ${serialNumber}`);}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
