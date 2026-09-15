'use strict';

/**
 * Minimal in-memory Supabase query-builder fake.
 * Supports exactly the chains used in database/*.js:
 * insert/update/select + eq/order/limit + single/maybeSingle/await.
 * Test-only — never imported by app code.
 */

function createFakeDb() {
  const tables = {
    members: [],
    points_ledger: [],
    visits: [],
    rewards: [],
    redemptions: [],
    devices: [],
    apple_devices: [],
    apple_registrations: [],
    pass_updates: [],
  };
  let seq = 0;
  const now = () => new Date().toISOString();

  function defaults(table, row) {
    const r = { ...row };
    if (r.id === undefined) r.id = `${table}-${++seq}`;
    if (table === 'members') {
      r.points_balance ??= 0;
      r.tier ??= 'bronze';
      r.created_at ??= now();
      r.updated_at ??= now();
    }
    if ((table === 'points_ledger' || table === 'visits' || table === 'redemptions') && r.created_at === undefined) {
      r.created_at ??= now();
    }
    if (table === 'rewards' && r.active === undefined) r.active ??= true;
    return r;
  }

  return {
    _tables: tables,
    from(table) {
      if (!tables[table]) tables[table] = [];
      const state = { op: null, filters: [], order: null, limit: null, payload: null, wantSelect: false };
      const match = (r) => state.filters.every(([c, v]) => r[c] === v);

      function exec() {
        if (state.op === 'insert') {
          const list = Array.isArray(state.payload) ? state.payload : [state.payload];
          const created = list.map((row) => {
            const r = defaults(table, row);
            tables[table].push(r);
            return r;
          });
          return { data: state.wantSelect ? created[0] ?? null : null, error: null };
        }
        if (state.op === 'update') {
          const matched = tables[table].filter(match);
          for (const r of matched) Object.assign(r, state.payload);
          return { data: state.wantSelect ? matched[0] ?? null : null, error: null };
        }
        if (state.op === 'delete') {
          tables[table] = tables[table].filter((r) => !match(r));
          return { data: null, error: null };
        }
        let out = tables[table].filter(match);
        if (state.order) {
          const { col, ascending } = state.order;
          out = [...out].sort((a, b) => {
            if (a[col] === b[col]) return 0;
            return (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1);
          });
        }
        if (state.limit != null) out = out.slice(0, state.limit);
        return { data: out, error: null };
      }

      const api = {
        select() {
          if (state.op === 'insert' || state.op === 'update') state.wantSelect = true;
          else state.op = 'select';
          return api;
        },
        insert(payload) {
          state.op = 'insert';
          state.payload = payload;
          return api;
        },
        update(payload) {
          state.op = 'update';
          state.payload = payload;
          return api;
        },
        delete() {
          state.op = 'delete';
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
        async single() {
          const res = exec();
          const data = Array.isArray(res.data) ? res.data[0] ?? null : res.data;
          if (data == null) return { data: null, error: { message: 'No rows' } };
          return { data, error: null };
        },
        async maybeSingle() {
          const res = exec();
          const data = Array.isArray(res.data) ? res.data[0] ?? null : res.data;
          return { data, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve(exec()).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

module.exports = { createFakeDb };
