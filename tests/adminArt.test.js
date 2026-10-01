'use strict';

process.env.SERVICE_API_KEY = 'test-service-key';
process.env.SUPABASE_STORAGE_BUCKET = 'test-bucket';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../app');
const { createFakeDb } = require('./fakeSupabase');

function fakeStorage(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    files,
    from(bucket) {
      return {
        upload: async (key, buffer) => {
          files.set(key, buffer);
          return { error: null };
        },
        getPublicUrl: (key) => ({ data: { publicUrl: `https://storage.test/${bucket}/${key}` } }),
        list: async (prefix) => ({
          data: [...files.keys()]
            .filter((k) => k.startsWith(`${prefix}/`))
            .map((k) => ({ name: k.slice(prefix.length + 1), created_at: new Date().toISOString(), metadata: { size: files.get(k).length } })),
          error: null,
        }),
        download: async (key) =>
          files.has(key)
            ? { data: files.get(key), error: null }
            : { data: null, error: { message: 'not found' } },
      };
    },
  };
}

const auth = (req) => req.set('Authorization', 'Bearer test-service-key');

function setup(seed) {
  const db = createFakeDb();
  const storage = fakeStorage(seed);
  const artBase = fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));
  const app = createApp({ db, push: {}, storage, artBase });
  return { db, storage, artBase, app };
}

describe('GET /admin/assets', () => {
  it('lists uploaded art with public URLs', async () => {
    const { app } = setup({ 'pass-assets/1-logo.png': Buffer.from('PNG') });
    const res = await auth(request(app).get('/admin/assets'));
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.assets[0]).toMatchObject({
      name: '1-logo.png',
      path: 'pass-assets/1-logo.png',
    });
    expect(res.body.assets[0].publicUrl).toContain('pass-assets/1-logo.png');
  });
});

describe('POST /admin/pass-art', () => {
  it('stages a draft for existing art', async () => {
    const { app, db } = setup({ 'pass-assets/gold-logo.png': Buffer.from('PNG') });
    const res = await auth(
      request(app).post('/admin/pass-art').send({ tier: 'gold', slot: 'logo', storagePath: 'pass-assets/gold-logo.png' })
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tier: 'gold', slot: 'logo', status: 'draft' });

    const list = await auth(request(app).get('/admin/pass-art'));
    expect(list.body.art).toHaveLength(1);
    expect(db._tables.pass_art[0]).toMatchObject({ tier: 'gold', slot: 'logo', status: 'draft' });
  });

  it('rejects bad tiers and missing files', async () => {
    const { app } = setup({});
    const badTier = await auth(
      request(app).post('/admin/pass-art').send({ tier: 'diamond', slot: 'logo', storagePath: 'pass-assets/x.png' })
    );
    expect(badTier.status).toBe(400);
    const missing = await auth(
      request(app).post('/admin/pass-art').send({ tier: 'gold', slot: 'logo', storagePath: 'pass-assets/nope.png' })
    );
    expect(missing.status).toBe(404);
  });
});

describe('POST /admin/publish-art', () => {
  it('refuses when nothing is staged', async () => {
    const { app } = setup({});
    const res = await auth(request(app).post('/admin/publish-art').send({ tier: 'gold' }));
    expect(res.status).toBe(400);
  });

  // Publishing flips pass_art.status only. Rendering reads published rows from
  // Supabase Storage (services/artService.js), so no file is written to disk —
  // an ephemeral Render filesystem would lose it on the next deploy anyway.
  it('marks slots published without writing to the filesystem', async () => {
    const { app, artBase, db } = setup({ 'pass-assets/gold-logo.png': Buffer.from('PNGDATA') });
    await auth(
      request(app).post('/admin/pass-art').send({ tier: 'gold', slot: 'logo', storagePath: 'pass-assets/gold-logo.png' })
    );
    const res = await auth(request(app).post('/admin/publish-art').send({ tier: 'gold' }));
    expect(res.status).toBe(200);
    expect(res.body.published).toEqual([{ slot: 'logo', files: ['logo.png', 'logo@2x.png'] }]);
    expect(db._tables.pass_art[0].status).toBe('published');
    // Nothing written to disk — durable art lives in Storage.
    expect(fs.existsSync(path.join(artBase, 'gold.pass'))).toBe(false);
  });

  // Without this the device's passesUpdatedSince poll returns nothing and an
  // installed pass never learns to re-fetch the newly published art.
  it('signals installed passes on the tier so devices re-fetch', async () => {
    const { app, db } = setup({ 'pass-assets/gold-logo.png': Buffer.from('PNG') });
    db._tables.members.push(
      { id: 'm1', tier: 'gold', pass_serial: 'LOYROY-m1' },
      { id: 'm2', tier: 'gold', pass_serial: 'LOYROY-m2' },
      { id: 'm3', tier: 'silver', pass_serial: 'LOYROY-m3' }
    );
    await auth(
      request(app).post('/admin/pass-art').send({ tier: 'gold', slot: 'logo', storagePath: 'pass-assets/gold-logo.png' })
    );
    const res = await auth(request(app).post('/admin/publish-art').send({ tier: 'gold' }));
    expect(res.body.signalled).toBe(2);
    const signalled = db._tables.pass_updates.map((p) => p.serial_number).sort();
    expect(signalled).toEqual(['LOYROY-m1', 'LOYROY-m2']);
  });

  // Poster Generic (iOS 27+) slots. Filenames must match walletService
  // POSTER_ASSET_NAMES or the artwork never reaches the pass bundle.
  it('stages and publishes the posterGeneric artwork + primaryLogo slots', async () => {
    const { app, db } = setup({
      'pass-assets/art.png': Buffer.from('ARTWORK'),
      'pass-assets/plogo.png': Buffer.from('PLOGO'),
    });

    for (const [slot, storagePath] of [
      ['artwork', 'pass-assets/art.png'],
      ['primaryLogo', 'pass-assets/plogo.png'],
    ]) {
      const res = await auth(
        request(app).post('/admin/pass-art').send({ tier: 'gold', slot, storagePath })
      );
      expect(res.status).toBe(200);
    }

    const res = await auth(request(app).post('/admin/publish-art').send({ tier: 'gold' }));
    expect(res.status).toBe(200);
    expect(res.body.published).toEqual([
      { slot: 'artwork', files: ['artwork.png'] },
      { slot: 'primaryLogo', files: ['primaryLogo.png'] },
    ]);
    expect(db._tables.pass_art.map((r) => r.status)).toEqual(['published', 'published']);
  });

  it('rejects unknown slots', async () => {
    const { app } = setup({ 'pass-assets/x.png': Buffer.from('X') });
    const res = await auth(
      request(app).post('/admin/pass-art').send({ tier: 'gold', slot: 'banner', storagePath: 'pass-assets/x.png' })
    );
    expect(res.status).toBe(400);
  });
});
