'use strict';

/**
 * Section B — Apple Wallet Web Service (Apple-mandated protocol).
 *
 * Called by Apple Wallet itself once a pass is on a device — never by our
 * frontend. Route shapes/methods/status codes follow Apple's PassKit Web
 * Service Reference (verified via Context7 webservice-toolkit docs + Apple
 * Wallet Passes docs, Sept 2026):
 *
 *   POST   /v1/devices/:deviceId/registrations/:passType/:serial  {pushToken} → 201 new / 200 known
 *   DELETE /v1/devices/:deviceId/registrations/:passType/:serial → 200
 *   GET    /v1/devices/:deviceId/registrations/:passType?passesUpdatedSince= → 200 {serialNumbers,lastUpdated} / 204 empty
 *   GET    /v1/passes/:passType/:serial → 200 .pkpass / 304 unmodified
 *   POST   /v1/log {logs:[...]} → 200 (unauthenticated per spec)
 *
 * Auth (all but /v1/log): `Authorization: ApplePass <authenticationToken>`
 * compared (timing-safe) against the member's stored auth_token. A mismatched
 * pass type is also 401 — never leak which half failed.
 *
 * Mounted at /apple so it matches the webServiceURL embedded in passes
 * (<PUBLIC_BASE_URL>/apple). Factory takes { db, wallet } for tests.
 */

const crypto = require('node:crypto');
const { Router } = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const members = require('../database/members');
const {
  getSerialsUpdatedSince,
  registerAppleDevice,
  unregisterAppleDevice,
} = require('../database/apple');

function unauthorized() {
  const err = new Error('Unauthorized.');
  err.status = 401;
  err.code = 'UNAUTHORIZED';
  return err;
}

function expectedPassType(opts) {
  return opts.passTypeIdentifier || process.env.PASS_TYPE_IDENTIFIER;
}

function checkPassType(req, opts) {
  if (!expectedPassType(opts) || req.params.passTypeIdentifier !== expectedPassType(opts)) {
    throw unauthorized();
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('ApplePass ')) return '';
  return header.slice('ApplePass '.length).trim();
}

function tokensEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Load member by serial and verify the ApplePass token. Returns the member. */
async function authenticatePass(db, req, opts) {
  checkPassType(req, opts);
  let member;
  try {
    member = await members.getMemberBySerial(db, req.params.serialNumber);
  } catch (err) {
    if (err.status === 404) throw unauthorized();
    throw err;
  }
  const token = bearerToken(req);
  if (!token || !member.auth_token || !tokensEqual(token, member.auth_token)) {
    throw unauthorized();
  }
  return member;
}

/** For the serials list: token must match a pass registered on this device. */
async function authenticateDevice(db, req, opts) {
  checkPassType(req, opts);
  const token = bearerToken(req);
  if (!token) throw unauthorized();
  const { data: regs, error } = await db
    .from('apple_registrations')
    .select('serial_number')
    .eq('device_library_id', req.params.deviceLibraryIdentifier);
  if (error) {
    const err = new Error(`database: ${error.message}`);
    err.status = 500;
    err.code = 'DB_ERROR';
    throw err;
  }
  for (const { serial_number } of regs) {
    try {
      const member = await members.getMemberBySerial(db, serial_number);
      if (member.auth_token && tokensEqual(token, member.auth_token)) return;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  throw unauthorized();
}

function createAppleRouter({ db, wallet, passTypeIdentifier } = {}) {
  const opts = { passTypeIdentifier };
  const router = Router();

  // Register a device for push notifications about a pass.
  router.post(
    '/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber',
    [body('pushToken').isString().notEmpty().withMessage('pushToken is required')],
    validate,
    async (req, res, next) => {
      try {
        await authenticatePass(db, req, opts);
        const key = {
          deviceLibraryId: req.params.deviceLibraryIdentifier,
          passTypeId: req.params.passTypeIdentifier,
          serialNumber: req.params.serialNumber,
        };
        const { data: existing } = await db
          .from('apple_registrations')
          .select('*')
          .eq('device_library_id', key.deviceLibraryId)
          .eq('pass_type_id', key.passTypeId)
          .eq('serial_number', key.serialNumber)
          .maybeSingle();
        await registerAppleDevice(db, { ...key, pushToken: req.body.pushToken });
        res.status(existing ? 200 : 201).end();
      } catch (err) {
        next(err);
      }
    }
  );

  // Unregister a device for a pass.
  router.delete(
    '/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber',
    async (req, res, next) => {
      try {
        await authenticatePass(db, req, opts);
        await unregisterAppleDevice(db, {
          deviceLibraryId: req.params.deviceLibraryIdentifier,
          passTypeId: req.params.passTypeIdentifier,
          serialNumber: req.params.serialNumber,
        });
        res.status(200).end();
      } catch (err) {
        next(err);
      }
    }
  );

  // Serial numbers of passes changed since a tag.
  router.get(
    '/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier',
    async (req, res, next) => {
      try {
        await authenticateDevice(db, req, opts);
        const { serialNumbers, lastUpdated } = await getSerialsUpdatedSince(
          db,
          req.params.deviceLibraryIdentifier,
          req.query.passesUpdatedSince
        );
        if (serialNumbers.length === 0) return res.status(204).end();
        res.json({ serialNumbers, lastUpdated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Latest version of a pass (signed .pkpass).
  router.get('/v1/passes/:passTypeIdentifier/:serialNumber', async (req, res, next) => {
    try {
      const member = await authenticatePass(db, req, opts);
      const lastModified = member.updated_at ? new Date(member.updated_at) : new Date();
      const ifModifiedSince = req.headers['if-modified-since'];
      if (ifModifiedSince && lastModified <= new Date(ifModifiedSince)) {
        return res.status(304).end();
      }
      const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
      const { buffer } = await wallet.generatePass({
        memberId: member.id,
        name: member.name,
        tier: member.tier,
        points: member.points_balance,
        serialNumber: member.pass_serial,
        authenticationToken: member.auth_token,
        ...(base ? { webServiceURL: `${base}/apple` } : {}),
      });
      res.set({
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': lastModified.toUTCString(),
      });
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  // Device error logging (unauthenticated per Apple spec).
  router.post(
    '/v1/log',
    [body('logs').isArray().withMessage('logs must be an array')],
    validate,
    async (req, res, next) => {
      try {
        for (const line of req.body.logs) {
          console.warn(`apple-device-log: ${typeof line === 'string' ? line : JSON.stringify(line)}`);
        }
        res.status(200).end();
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createAppleRouter };
