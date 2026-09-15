'use strict';

// Consistent error shape: { error: { code, message } }
// 4xx for client errors, 5xx only for genuine server faults. Never leak stacks.

// 4-arg signature required so Express treats this as an error handler.
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
  if (status >= 500) {
    // Server-side only: Render logs carry the real message + code.
    // Clients still get the generic shape below.
    console.error(`[${code}] ${req.method} ${req.path}: ${err.message}`);
  }
  res.status(status).json({ error: { code, message } });
}

function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

module.exports = { errorHandler, notFound };
