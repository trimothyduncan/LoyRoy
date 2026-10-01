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

  it('writes pass files and marks slots published', async () => {
    const { app, artBase, db } = setup({ 'pass-assets/gold-logo.png': Buffer.from('PNGDATA') });
    await auth(
      request(app).post('/admin/pass-art').send({ tier: 'gold', slot: 'logo', storagePath: 'pass-assets/gold-logo.png' })
    );
    const res = await auth(request(app).post('/admin/publish-art').send({ tier: 'gold' }));
    expect(res.status).toBe(200);
    expect(res.body.published).toEqual([{ slot: 'logo', files: ['logo.png', 'logo@2x.png'] }]);
    expect(fs.readFileSync(path.join(artBase, 'gold.pass', 'logo.png')).toString()).toBe('PNGDATA');
    expect(fs.readFileSync(path.join(artBase, 'gold.pass', 'logo@2x.png')).toString()).toBe('PNGDATA');
    expect(db._tables.pass_art[0].status).toBe('published');
  });
});
