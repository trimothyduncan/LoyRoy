'use strict';

const { validationResult } = require('express-validator');

// Maps express-validator failures to the consistent { error: { code, message } } shape.
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const err = new Error(result.array().map((e) => `${e.path || e.param}: ${e.msg}`).join('; '));
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  next(err);
}

module.exports = { validate };
