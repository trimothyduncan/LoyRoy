'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { uploadPassAsset, MAX_BYTES } = require('../services/storageService');

function createAdminRouter() {
  const router = Router();

  // POST /admin/upload-asset — pass art / brand images via Supabase Storage.
  router.post(
    '/admin/upload-asset',
    [
      body('filename').isString().notEmpty().withMessage('filename is required'),
      body('contentType').isString().notEmpty().withMessage('contentType is required'),
      body('dataBase64')
        .isString()
        .notEmpty()
        .withMessage('dataBase64 is required')
        .isLength({ max: Math.ceil((MAX_BYTES * 4) / 3) + 1024 })
        .withMessage('file too large'),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { filename, contentType, dataBase64 } = req.body;
        const buffer = Buffer.from(dataBase64, 'base64');
        const result = await uploadPassAsset({ filename, contentType, buffer });
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createAdminRouter };
