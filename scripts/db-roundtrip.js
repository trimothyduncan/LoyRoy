'use strict';

/**
 * Live DB round-trip against a real Supabase project.
 * Usage: node scripts/db-roundtrip.js   (needs SUPABASE_URL + SUPABASE_SERVICE_KEY)
 * Creates a test member, adds points, reads history, then deletes it.
 */

require('dotenv').config();
const { getDb } = require('../database/db');
const members = require('../database/members');

async function main() {
  const db = getDb();
  const m = await members.createMember(db, { name: 'Roundtrip Test' });
  console.log('created', m.id);
  const { newBalance } = await members.addPoints(db, m.id, 100, 'roundtrip');
  console.log('balance', newBalance);
  const history = await members.getHistory(db, m.id);
  console.log('ledger rows', history.points.length);
  const { error } = await db.from('members').delete().eq('id', m.id);
  if (error) throw new Error(error.message);
  console.log('cleaned up OK');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
