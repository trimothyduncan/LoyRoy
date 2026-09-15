'use strict';

/**
 * Service-level auth for section A (application API).
 * Dashboard server calls and scanner devices present
 *   Authorization: Bearer <SERVICE_API_KEY>
 * Firebase session verification for browser-direct dashboard calls lands in
 * Phase 8; this gate stays as the service/device credential.
 */

function serviceAuth(req, res, next) {
  const expected = process.env.SERVICE_API_KEY;
  if (!expected) {
    const err = new Error('API key not configured (SERVICE_API_KEY).');
    err.status = 500;
    err.code = 'AUTH_CONFIG_ERROR';
    return next(err);
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== expected) {
    const err = new Error('Unauthorized.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    return next(err);
  }
  next();
}

module.exports = { serviceAuth };
