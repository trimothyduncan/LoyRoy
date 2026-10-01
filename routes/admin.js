'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Router } = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { uploadPassAsset, MAX_BYTES } = require('../services/storageService');

const ART_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'vip'];
// logo/strip/icon feed the legacy storeCard face; artwork/primaryLogo feed the
// Poster Generic face (iOS 27+). Kept in sync with the pass_art.slot CHECK
// constraint — see database/migrations/004-poster-art.sql.
const ART_SLOTS = ['logo', 'strip', 'icon', 'artwork', 'primaryLogo'];
// Pass package filenames each studio slot feeds. Kept in sync with
// walletService TEMPLATE_ASSET_NAMES + POSTER_ASSET_NAMES.
const SLOT_FILES = {
  logo: ['logo.png', 'logo@2x.png'],
  strip: ['strip.png'],
  icon: ['icon.png', 'icon@2x.png'],
  // Full-bleed poster background (358x448pt) and the logo drawn over it.
  artwork: ['artwork.png'],
  primaryLogo: ['primaryLogo.png'],
};

function artBaseDir(artBase) {
  return artBase || path.join(__dirname, '..', 'passes');
}

function storageClient(injected) {
  if (injected) return injected;
  const { getDb } = require('../database/db');
  return getDb().storage;
}

function storageBucket() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!bucket) {
    const err = new Error('SUPABASE_STORAGE_BUCKET is not set.');
    err.status = 500;
    err.code = 'STORAGE_CONFIG_ERROR';
    throw err;
  }
  return bucket;
}

function notFound(message) {
  const e = new Error(message);
  e.status = 404;
  e.code = 'NOT_FOUND';
  return e;
}

async function toBuffer(data) {
  if (!data) throw notFound('Asset is empty.');
  if (Buffer.isBuffer(data)) return data;
  if (typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer());
  throw notFound('Asset could not be read.');
}

function createAdminRouter({ db, storage, artBase } = {}) {
  const router = Router();
  const store = () => storageClient(storage);
  const database = () => {
    if (db) return db;
    const { getDb } = require('../database/db');
    return getDb();
  };

  // POST /admin/upload-asset — pass art / brand images via Supabase Storage.
  router.post(
    '/admin/upload-asset',
    [
      body('filename').isString().notEmpty().withMessage('filename is required'),
      body('contentType').isString().notEmpty().withMessage('contentType is required'),
      body('dataBase64')
        .isString()
        .notEmpty()
        .withMessage('dataBase64 is required')
        .isLength({ max: Math.ceil((MAX_BYTES * 4) / 3) + 1024 })
        .withMessage('file too large'),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { filename, contentType, dataBase64 } = req.body;
        const buffer = Buffer.from(dataBase64, 'base64');
        const result = await uploadPassAsset({
          filename,
          contentType,
          buffer,
          ...(storage ? { storage } : {}),
        });
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /admin/diag-supabase — connectivity probe. Service-key gated.
  // Reports the raw Supabase error text (never credentials) so production
  // DB failures can be diagnosed without guessing.
  router.get('/admin/diag-supabase', async (req, res, next) => {
    try {
      const { getDb } = require('../database/db');
      let host = 'unset';
      try {
        host = new URL(process.env.SUPABASE_URL || '').hostname || 'unset';
      } catch {
        host = 'malformed-url';
      }
      const started = Date.now();
      try {
        const { data, error } = await getDb().from('tiers').select('name').limit(1);
        const fs = require('node:fs');
        const cfg = require('../config');
        const exists = (p) => {
          try {
            return fs.existsSync(p);
          } catch {
            return false;
          }
        };
        // Byte sizes only — identifies truncated/mangled pastes, never contents.
        const sizeOf = (p) => {
          try {
            return fs.statSync(p).size;
          } catch {
            return -1;
          }
        };
        let secretsDir = [];
        try {
          secretsDir = fs.readdirSync('/etc/secrets');
        } catch {
          secretsDir = [];
        }
        res.json({
          ok: !error,
          ms: Date.now() - started,
          host,
          rows: data ? data.length : 0,
          error: error ? String(error.message || error).slice(0, 300) : null,
          // Paths + existence only — never file contents or secret values.
          signing: {
            certPath: cfg.signerCertPath,
            certExists: exists(cfg.signerCertPath),
            certBytes: sizeOf(cfg.signerCertPath),
            keyPath: cfg.signerKeyPath,
            keyExists: exists(cfg.signerKeyPath),
            keyBytes: sizeOf(cfg.signerKeyPath),
            wwdrPath: cfg.wwdrPath,
            wwdrExists: exists(cfg.wwdrPath),
            wwdrBytes: sizeOf(cfg.wwdrPath),
            renderSecretsDir: secretsDir,
            apnsKeyPath: cfg.apnsKeyPath,
            apnsKeyExists: exists(cfg.apnsKeyPath),
            apnsKeyBytes: sizeOf(cfg.apnsKeyPath),
            apnsKeyIdSet: Boolean(process.env.APNS_KEY_ID),
            apnsTeamIdSet: Boolean(process.env.APNS_TEAM_ID),
            // Topic + env shape the push; values are IDs, not secrets.
            apnsTopic: process.env.APNS_TOPIC || process.env.PASS_TYPE_IDENTIFIER || 'unset',
            apnsTopicFromFallback: !process.env.APNS_TOPIC,
            apnsUseSandbox: process.env.APNS_USE_SANDBOX === 'true',
            nodeEnv: process.env.NODE_ENV || 'unset',
            passphraseSet: Boolean(process.env.SIGNER_KEY_PASSPHRASE),
            passTypeIdentifierSet: Boolean(process.env.PASS_TYPE_IDENTIFIER),
            teamIdSet: Boolean(process.env.APPLE_TEAM_ID),
          },
        });
      } catch (err) {
        res.json({ ok: false, ms: Date.now() - started, host, error: String(err.message || err).slice(0, 300) });
      }
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/assets — uploaded art library (Art Studio file picker).
  router.get('/admin/assets', async (req, res, next) => {
    try {
      const bucket = storageBucket();
      const client = store().from(bucket);
      const { data, error } = await client.list('pass-assets', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) {
        const err = new Error(`storage list failed: ${error.message}`);
        err.status = 500;
        err.code = 'STORAGE_ERROR';
        throw err;
      }
      const assets = (data || [])
        .filter((f) => f && f.name && !f.name.endsWith('/'))
        .map((f) => {
          const key = `pass-assets/${f.name}`;
          const { data: url } = client.getPublicUrl(key);
          return {
            name: f.name,
            path: key,
            publicUrl: url && url.publicUrl,
            bytes: (f.metadata && f.metadata.size) || null,
            createdAt: f.created_at || null,
          };
        });
      res.json({ assets });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/pass-art — draft/published art state per tier + slot.
  router.get('/admin/pass-art', async (req, res, next) => {
    try {
      const { data, error } = await database()
        .from('pass_art')
        .select('tier,slot,storage_path,status,updated_at')
        .limit(100);
      if (error) {
        const err = new Error(`database: ${error.message}`);
        err.status = 500;
        err.code = 'DB_ERROR';
        throw err;
      }
      res.json({
        art: (data || []).map((r) => ({
          tier: r.tier,
          slot: r.slot,
          storagePath: r.storage_path,
          status: r.status,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /admin/pass-art — stage a draft (merchant preview, NOT live yet).
  router.post(
    '/admin/pass-art',
    [
      body('tier').isIn(ART_TIERS).withMessage('tier must be a valid tier'),
      body('slot').isIn(ART_SLOTS).withMessage('slot must be logo, strip or icon'),
      body('storagePath').isString().notEmpty().withMessage('storagePath is required'),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { tier, slot, storagePath } = req.body;
        const bucket = storageBucket();
        const { data, error } = await store().from(bucket).download(storagePath);
        if (error) throw notFound(`Asset not found in storage: ${storagePath}`);
        const buffer = await toBuffer(data);
        if (buffer.length > MAX_BYTES) {
          const err = new Error('file exceeds 5MB limit');
          err.status = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        const table = () => database().from('pass_art');
        const { data: existing } = await table()
          .select('tier')
          .eq('tier', tier)
          .eq('slot', slot)
          .maybeSingle();
        const row = {
          tier,
          slot,
          storage_path: storagePath,
          status: 'draft',
          updated_at: new Date().toISOString(),
        };
        if (existing) {
          const { error: updateError } = await table().update(row).eq('tier', tier).eq('slot', slot);
          if (updateError) {
            const err = new Error(`database: ${updateError.message}`);
            err.status = 500;
            err.code = 'DB_ERROR';
            throw err;
          }
        } else {
          const { error: insertError } = await table().insert(row);
          if (insertError) {
            const err = new Error(`database: ${insertError.message}`);
            err.status = 500;
            err.code = 'DB_ERROR';
            throw err;
          }
        }
        res.json({ tier, slot, storagePath, status: 'draft' });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /admin/publish-art — apply a tier's drafts to passes/<tier>.pass/.
  // NOTE: on hosts with ephemeral disks (Render without a persistent disk)
  // published files live until the next deploy — commit winning art into
  // the repo for durability.
  router.post(
    '/admin/publish-art',
    [body('tier').isIn(ART_TIERS).withMessage('tier must be a valid tier')],
    validate,
    async (req, res, next) => {
      try {
        const { tier } = req.body;
        const bucket = storageBucket();
        const table = () => database().from('pass_art');
        const { data: drafts, error } = await table()
          .select('tier,slot,storage_path,status')
          .eq('tier', tier)
          .eq('status', 'draft');
        if (error) {
          const err = new Error(`database: ${error.message}`);
          err.status = 500;
          err.code = 'DB_ERROR';
          throw err;
        }
        if (!drafts || drafts.length === 0) {
          const err = new Error('No draft art staged for this tier.');
          err.status = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        const dir = path.join(artBaseDir(artBase), `${tier}.pass`);
        fs.mkdirSync(dir, { recursive: true });
        const published = [];
        for (const d of drafts) {
          const files = SLOT_FILES[d.slot] || [];
          const dl = await store().from(bucket).download(d.storage_path);
          if (dl.error) throw notFound(`Asset not found in storage: ${d.storage_path}`);
          const buffer = await toBuffer(dl.data);
          if (buffer.length > MAX_BYTES) {
            const err = new Error(`file exceeds 5MB limit: ${d.storage_path}`);
            err.status = 400;
            err.code = 'VALIDATION_ERROR';
            throw err;
          }
          for (const file of files) {
            fs.writeFileSync(path.join(dir, file), buffer);
          }
          const row = { status: 'published', updated_at: new Date().toISOString() };
          const { error: updateError } = await table().update(row).eq('tier', tier).eq('slot', d.slot);
          if (updateError) {
            const err = new Error(`database: ${updateError.message}`);
            err.status = 500;
            err.code = 'DB_ERROR';
            throw err;
          }
          published.push({ slot: d.slot, files });
        }
        res.json({ tier, published });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createAdminRouter };
