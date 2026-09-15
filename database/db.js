'use strict';

/**
 * database/db.js — Supabase client singleton.
 *
 * Lazy: requiring this module never throws, so the server and test suite
 * boot without credentials. Only getDb() throws (DB_CONFIG_ERROR) when
 * SUPABASE_URL / SUPABASE_SERVICE_KEY are unset — call it from code paths
 * that actually touch the database.
 */

const { createClient } = require('@supabase/supabase-js');

let cached = null;

function getDb() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    const err = new Error(
      'database: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env (Supabase dashboard → project → Settings → API).'
    );
    err.status = 500;
    err.code = 'DB_CONFIG_ERROR';
    throw err;
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

// Test-only: reset the singleton between tests.
function _reset() {
  cached = null;
}

module.exports = { getDb, _reset };
