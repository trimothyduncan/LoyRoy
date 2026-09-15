'use strict';

/**
 * services/storageService.js — Supabase Storage wrapper for pass assets
 * (icon/logo/strip art) and member-uploaded images.
 * Uses SUPABASE_URL / SUPABASE_SERVICE_KEY (same project as the database)
 * plus SUPABASE_STORAGE_BUCKET. All uploads go through here — never upload
 * from the dashboard directly.
 */

const { getDb } = require('../database/db');

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function validation(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

function bucketName() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!bucket) {
    const err = new Error('SUPABASE_STORAGE_BUCKET is not set.');
    err.status = 500;
    err.code = 'STORAGE_CONFIG_ERROR';
    throw err;
  }
  return bucket;
}

function sanitizeFilename(name) {
  const base = String(name || '').split('/').pop().split('\\').pop();
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  if (!clean) throw validation('filename is required');
  return clean;
}

/**
 * @param {object} opts { path, buffer, contentType, filename?, storage? }
 * storage defaults to the real Supabase storage client; tests inject a fake.
 */
async function uploadPassAsset({ path, buffer, contentType, filename, storage } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) throw validation('buffer is required');
  if (buffer.length > MAX_BYTES) throw validation('file exceeds 5MB limit');
  if (!ALLOWED_TYPES.has(contentType)) {
    throw validation(`contentType must be one of: ${[...ALLOWED_TYPES].join(', ')}`);
  }
  const bucket = bucketName();
  const key = path || `pass-assets/${Date.now()}-${sanitizeFilename(filename || 'asset.png')}`;

  const client = storage || getDb().storage;
  const { error } = await client.from(bucket).upload(key, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    const err = new Error(`storage upload failed: ${error.message}`);
    err.status = 500;
    err.code = 'STORAGE_ERROR';
    throw err;
  }
  const { data } = client.from(bucket).getPublicUrl(key);
  return { bucket, path: key, publicUrl: data && data.publicUrl };
}

module.exports = { uploadPassAsset, MAX_BYTES };
