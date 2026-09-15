'use strict';

process.env.SERVICE_API_KEY = 'test-service-key';
process.env.SUPABASE_STORAGE_BUCKET = 'test-bucket';

const request = require('supertest');
const { createApp } = require('../app');
const { createFakeDb } = require('./fakeSupabase');
const { uploadPassAsset } = require('../services/storageService');

const fakeStorage = () => {
  const files = new Map();
  return {
    files,
    from(bucket) {
      return {
        upload: async (key, buffer) => {
          files.set(`${bucket}/${key}`, buffer);
          return { error: null };
        },
        getPublicUrl: (key) => ({ data: { publicUrl: `https://storage.test/${bucket}/${key}` } }),
      };
    },
  };
};

describe('storageService', () => {
  it('uploads and returns a public URL', async () => {
    const storage = fakeStorage();
    const res = await uploadPassAsset({
      filename: 'logo.png',
      contentType: 'image/png',
      buffer: Buffer.from('PNGDATA'),
      storage,
    });
    expect(res.bucket).toBe('test-bucket');
    expect(res.publicUrl).toContain(res.path);
    expect(storage.files.size).toBe(1);
  });

  it('rejects non-image types and oversized files', async () => {
    await expect(
      uploadPassAsset({ filename: 'x.pdf', contentType: 'application/pdf', buffer: Buffer.from('x'), storage: fakeStorage() })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadPassAsset({
        filename: 'big.png',
        contentType: 'image/png',
        buffer: Buffer.alloc(6 * 1024 * 1024),
        storage: fakeStorage(),
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('POST /admin/upload-asset', () => {
  it('rejects invalid payloads', async () => {
    const app = createApp({ db: createFakeDb(), push: {} });
    const res = await request(app)
      .post('/admin/upload-asset')
      .set('Authorization', 'Bearer test-service-key')
      .send({ filename: 'x.png' });
    expect(res.status).toBe(400);
  });
});
