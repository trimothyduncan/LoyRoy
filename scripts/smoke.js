'use strict';

/** Backend boot smoke: health, auth gate, validation shape, config errors. */
require('dotenv').config();
const { createApp } = require('../app');
const request = require('supertest');

async function main() {
  const app = createApp({ db: null, wallet: {}, push: {} });
  const key = process.env.SERVICE_API_KEY;
  const authed = (r) => r.set('Authorization', `Bearer ${key}`);
  const checks = [];

  const health = await request(app).get('/health');
  checks.push(['health 200', health.status === 200]);

  const noAuth = await request(app).get('/members');
  checks.push(['no key → 401', noAuth.status === 401]);

  const badBody = await authed(request(app).post('/update-points')).send({ memberId: 'x' });
  checks.push(['bad body → 400 VALIDATION_ERROR', badBody.status === 400]);

  const noDb = await authed(request(app).post('/update-points')).send({ memberId: 'x', pointsDelta: 5 });
  checks.push(['no Supabase creds → 500 DB_CONFIG_ERROR', noDb.status === 500 && noDb.body.error.code === 'DB_CONFIG_ERROR']);

  const appleLog = await request(app).post('/apple/v1/log').send({ logs: ['smoke'] });
  checks.push(['apple log 200', appleLog.status === 200]);

  let fail = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) fail++;
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
