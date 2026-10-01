'use strict';

/**
 * artService resolves pass artwork from Supabase Storage. Storage is the only
 * durable copy of merchant art (Render has no persistent disk), so these tests
 * pin the rules that keep a pass renderable: placeholders underneath, published
 * art on top, drafts never leaking, and poster slots staying optional.
 */

const { resolveTierAssets, getPublishedArt, REQUIRED_SLOTS } = require('../services/artService');

function fakeStorage(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    files,
    from() {
      return {
        download: async (key) =>
          files.has(key)
            ? { data: files.get(key), error: null }
            : { data: null, error: { message: 'not found' } },
      };
    },
  };
}

function fakeDb(rows = []) {
  return {
    rows,
    from() {
      const state = { filters: [], op: null, order: null, limit: null };
      const match = (r) => state.filters.every(([c, v]) => r[c] === v);
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          state.filters.push([col, val]);
          return api;
        },
        order(col, { ascending } = {}) {
          state.order = { col, ascending: ascending !== false };
          return api;
        },
        limit(n) {
          state.limit = n;
          return api;
        },
        then(resolve, reject) {
          let out = rows.filter(match);
          if (state.order) {
            const { col, ascending } = state.order;
            out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1));
          }
          if (state.limit != null) out = out.slice(0, state.limit);
          return Promise.resolve({ data: out, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

// Mirrors the shape getPublishedArt's query returns: the service filters on
// tier + status, so a realistic row carries both.
const published = (slot, storage_path, updated_at, tier = 'gold') => ({
  slot,
  storage_path,
  status: 'published',
  tier,
  updated_at,
});

describe('getPublishedArt', () => {
  it('returns only rows matching the requested tier and published status', async () => {
    const db = fakeDb([
      published('logo', 'a.png', '2026-01-01T00:00:00Z'),
      published('strip', 'b.png', '2026-02-01T00:00:00Z', 'silver'),
      { slot: 'icon', storage_path: 'c.png', status: 'draft', tier: 'gold', updated_at: '2026-03-01T00:00:00Z' },
    ]);
    const rows = await getPublishedArt(db, 'gold');
    expect(rows.map((r) => r.slot).sort()).toEqual(['logo']);
  });

  it('orders newest first so a republished slot wins', async () => {
    const db = fakeDb([
      published('logo', 'new.png', '2026-05-01T00:00:00Z'),
      published('logo', 'old.png', '2026-01-01T00:00:00Z'),
    ]);
    const rows = await getPublishedArt(db, 'gold');
    expect(rows.map((r) => r.storage_path)).toEqual(['new.png', 'old.png']);
  });

  it('returns empty for a blank tier without querying', async () => {
    const db = fakeDb([{ slot: 'logo' }]);
    expect(await getPublishedArt(db, '')).toEqual([]);
    expect(await getPublishedArt(db, null)).toEqual([]);
  });
});

describe('resolveTierAssets', () => {
  it('falls back to shared placeholders when no art is published', async () => {
    const { assets, slots, missing } = await resolveTierAssets(
      { db: fakeDb([]), storage: fakeStorage(), bucket: 'b' },
      'gold'
    );
    expect(slots).toEqual([]);
    expect(missing).toEqual([]);
    for (const name of REQUIRED_SLOTS.flatMap((s) => ({ logo: ['logo.png'], strip: ['strip.png'], icon: ['icon.png'] }[s]))) {
      expect(Buffer.isBuffer(assets[name])).toBe(true);
    }
  });

  it('applies published art over the placeholders', async () => {
    const storage = fakeStorage({ 'pass-assets/gold-strip.png': Buffer.from('GOLDSTRIP') });
    const db = fakeDb([
      published('strip', 'pass-assets/gold-strip.png', '2026-03-01T00:00:00Z'),
    ]);
    const { assets, slots } = await resolveTierAssets({ db, storage, bucket: 'b' }, 'gold');
    expect(slots).toEqual(['strip']);
    expect(assets['strip.png'].toString()).toBe('GOLDSTRIP');
  });

  // A draft is work in progress and must never appear on a live pass.
  it('ignores a storage object no published row points at', async () => {
    const storage = fakeStorage({ 'pass-assets/draft-only.png': Buffer.from('DRAFT') });
    const db = fakeDb([]); // no published rows
    const { assets, slots } = await resolveTierAssets({ db, storage, bucket: 'b' }, 'gold');
    expect(slots).toEqual([]);
    expect(Object.values(assets).some((b) => b.toString() === 'DRAFT')).toBe(false);
  });

  it('writes every file a slot feeds (logo -> logo.png + logo@2x.png)', async () => {
    const storage = fakeStorage({ 'pass-assets/l.png': Buffer.from('LOGO') });
    const db = fakeDb([published('logo', 'pass-assets/l.png', '2026-03-01T00:00:00Z')]);
    const { assets } = await resolveTierAssets({ db, storage, bucket: 'b' }, 'gold');
    expect(assets['logo.png'].toString()).toBe('LOGO');
    expect(assets['logo@2x.png'].toString()).toBe('LOGO');
  });

  it('adds poster artwork when published, and omits it when not', async () => {
    const storage = fakeStorage({ 'pass-assets/a.png': Buffer.from('ART') });
    const withArt = await resolveTierAssets(
      { db: fakeDb([published('artwork', 'pass-assets/a.png', '2026-04-01T00:00:00Z')]), storage, bucket: 'b' },
      'gold'
    );
    expect(withArt.assets['artwork.png'].toString()).toBe('ART');
    expect(withArt.missing).toEqual([]);

    const without = await resolveTierAssets({ db: fakeDb([]), storage, bucket: 'b' }, 'gold');
    expect(without.assets['artwork.png']).toBeUndefined();
  });

  it('keeps rendering when a published object is missing from storage', async () => {
    const db = fakeDb([published('strip', 'pass-assets/gone.png', '2026-03-01T00:00:00Z')]);
    const { assets, slots, missing } = await resolveTierAssets(
      { db, storage: fakeStorage({}), bucket: 'b' },
      'gold'
    );
    expect(slots).toEqual([]);
    expect(missing).toEqual([]);
    // Placeholder still present, so the pass still builds.
    expect(Buffer.isBuffer(assets['strip.png'])).toBe(true);
  });

  it('uses the newest row per slot when a slot was republished', async () => {
    const storage = fakeStorage({
      'pass-assets/old.png': Buffer.from('OLD'),
      'pass-assets/new.png': Buffer.from('NEW'),
    });
    const db = fakeDb([
      published('logo', 'pass-assets/new.png', '2026-05-01T00:00:00Z'),
      published('logo', 'pass-assets/old.png', '2026-01-01T00:00:00Z'),
    ]);
    const { assets } = await resolveTierAssets({ db, storage, bucket: 'b' }, 'gold');
    expect(assets['logo.png'].toString()).toBe('NEW');
  });

  // Supabase Storage hands back a Blob-like object in some runtimes, whose
  // arrayBuffer() is async. Reading it synchronously once produced a Promise
  // inside Buffer.from and broke real renders while unit tests (plain Buffers)
  // still passed.
  it('handles a Blob-shaped download (async arrayBuffer)', async () => {
    const payload = Buffer.from('BLOBART');
    const blobLike = { arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) };
    const storage = {
      from() {
        return { download: async () => ({ data: blobLike, error: null }) };
      },
    };
    const db = fakeDb([published('artwork', 'pass-assets/b.png', '2026-04-01T00:00:00Z')]);
    const { assets, slots } = await resolveTierAssets({ db, storage, bucket: 'b' }, 'gold');
    expect(slots).toEqual(['artwork']);
    expect(Buffer.isBuffer(assets['artwork.png'])).toBe(true);
    expect(assets['artwork.png'].toString()).toBe('BLOBART');
  });

  it('handles a raw ArrayBuffer download', async () => {
    const payload = Buffer.from('RAWBUF');
    const storage = {
      from() {
        return {
          download: async () => ({
            data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
            error: null,
          }),
        };
      },
    };
    const db = fakeDb([published('artwork', 'pass-assets/r.png', '2026-04-01T00:00:00Z')]);
    const { assets } = await resolveTierAssets({ db, storage, bucket: 'b' }, 'gold');
    expect(assets['artwork.png'].toString()).toBe('RAWBUF');
  });

  it('degrades to placeholders when no bucket is configured', async () => {
    const { assets, missing } = await resolveTierAssets(
      { db: fakeDb([published('logo', 'pass-assets/l.png', '2026-03-01T00:00:00Z')]), storage: fakeStorage(), bucket: '' },
      'gold'
    );
    expect(Buffer.isBuffer(assets['logo.png'])).toBe(true);
    expect(missing).toEqual([]);
  });
});
