'use strict';

/**
 * services/artService.js — resolves pass artwork for a tier.
 *
 * Art is authored through the Art Studio, uploaded to Supabase Storage, and
 * referenced by a `pass_art` row per (tier, slot). This module turns those
 * rows into the flat filename -> Buffer map that passkit-generator wants, so a
 * pass can be rendered with whatever the merchant most recently published.
 *
 * Why storage and not the filesystem: Render has no persistent disk, so files
 * written under passes/<tier>.pass/ are lost on every deploy. Storage is the
 * only durable copy, which makes it the source of truth for rendering.
 *
 * The 1x1 placeholder PNGs in passes/shared/ remain the floor: they are bundled
 * with the repo, so a tier with no published art still produces a valid pass
 * rather than failing to build.
 */

const path = require('node:path');
const fs = require('node:fs');

const PASSES_BASE_DIR = path.join(__dirname, '..', 'passes');

// Which pass-package filenames each Art Studio slot feeds.
// Kept in sync with walletService TEMPLATE_ASSET_NAMES / POSTER_ASSET_NAMES
// and routes/admin.js SLOT_FILES.
const SLOT_FILES = {
  logo: ['logo.png', 'logo@2x.png'],
  strip: ['strip.png'],
  icon: ['icon.png', 'icon@2x.png'],
  artwork: ['artwork.png'],
  primaryLogo: ['primaryLogo.png'],
};

// Slots that must resolve or the pass cannot be built at all. The poster slots
// are deliberately absent: an unbranded pass still renders, just without art.
const REQUIRED_SLOTS = ['logo', 'strip', 'icon'];

// Supabase Storage returns a Blob in browsers and a Buffer/ArrayBuffer under
// Node, so both shapes are handled. Async because Blob.arrayBuffer() is.
async function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data.arrayBuffer === 'function') {
    return Buffer.from(await data.arrayBuffer());
  }
  return null;
}

function readSharedAssets(sharedDir) {
  const assets = {};
  for (const name of ['icon.png', 'icon@2x.png', 'logo.png', 'logo@2x.png', 'strip.png']) {
    try {
      assets[name] = fs.readFileSync(path.join(sharedDir, name));
    } catch {
      // A missing placeholder is a packaging problem, surfaced by the caller's
      // own completeness check rather than silently producing a broken pass.
    }
  }
  return assets;
}

/**
 * Fetch the art rows for a tier, newest publish first per slot.
 * Only 'published' rows are used: a draft is a merchant's work in progress and
 * must never leak onto a live pass.
 */
async function getPublishedArt(db, tier) {
  const name = String(tier || '').toLowerCase().trim();
  if (!name) return [];
  const { data, error } = await db
    .from('pass_art')
    .select('slot,storage_path,updated_at')
    .eq('tier', name)
    .eq('status', 'published')
    .order('updated_at', { ascending: false });
  if (error) {
    const err = new Error(`database: ${error.message}`);
    err.status = 500;
    err.code = 'DB_ERROR';
    throw err;
  }
  return data || [];
}

/**
 * Download one published slot's files into the asset map.
 * Returns the number of files written so callers can report partial art.
 */
async function applySlot(assets, slot, storagePath, storage, bucket) {
  const files = SLOT_FILES[slot] || [];
  if (!files.length || !storagePath) return 0;
  const { data, error } = await storage.from(bucket).download(storagePath);
  if (error || !data) return 0;
  const buffer = await toBuffer(data);
  if (!buffer) return 0;
  for (const file of files) assets[file] = buffer;
  return files.length;
}

/**
 * Build the filename -> Buffer map for one tier.
 *
 * Order matters: shared placeholders first, then published art on top, so
 * merchant art wins and anything they have not published keeps a valid image.
 * Poster slots are additive — absent art simply yields no file.
 *
 * @param {object} deps { db, storage, bucket?, sharedDir? }
 * @param {string} tier
 * @returns {Promise<{ assets: object, slots: string[], missing: string[] }>}
 */
async function resolveTierAssets({ db, storage, bucket, sharedDir }, tier) {
  const dir = sharedDir || path.join(PASSES_BASE_DIR, 'shared');
  const assets = readSharedAssets(dir);
  const slots = [];
  const missing = REQUIRED_SLOTS.filter(
    (slot) => !SLOT_FILES[slot].some((f) => assets[f])
  );

  // No storage configured (tests, or a boot without credentials): the shared
  // placeholders are the whole answer.
  if (!storage || !bucket) return { assets, slots, missing };

  const rows = await getPublishedArt(db, tier);
  for (const row of rows) {
    // Skip a slot already filled by a newer row (rows are newest-first).
    if (slots.includes(row.slot)) continue;
    const written = await applySlot(assets, row.slot, row.storage_path, storage, bucket);
    if (written) slots.push(row.slot);
  }

  // Recompute after applying: a published slot can satisfy a required one.
  const stillMissing = REQUIRED_SLOTS.filter(
    (slot) => !SLOT_FILES[slot].some((f) => assets[f])
  );

  return { assets, slots, missing: stillMissing };
}

module.exports = {
  SLOT_FILES,
  REQUIRED_SLOTS,
  getPublishedArt,
  resolveTierAssets,
  readSharedAssets,
};
