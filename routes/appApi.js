'use strict';

/**
 * Section A — application API (dashboard / scanner / internal).
 * Factory: createAppRouter({ db, wallet, push }) so tests inject fakes.
 * All routes sit behind serviceAuth (mounted in app.js).
 */

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validate');
const members = require('../database/members');
const { registerDevice } = require('../database/devices');
const { touchPassUpdate } = require('../database/apple');

function webServiceURL() {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}/apple` : undefined;
}

function toMemberJson(m) {
  return {
    memberId: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    tier: m.tier,
    pointsBalance: m.points_balance,
    passSerialNumber: m.pass_serial,
    lastVisit: m.last_visit_at,
    createdAt: m.created_at,
  };
}

function createAppRouter({ db, wallet, push }) {
  const router = Router();

  // POST /create-pass -------------------------------------------------
  router.post(
    '/create-pass',
    [
      body('customerProfile.name').isString().trim().notEmpty().withMessage('name is required'),
      body('customerProfile.email').optional().isEmail().withMessage('must be a valid email'),
      body('customerProfile.phone').optional().isString(),
      body('tier').optional().isIn(['bronze', 'silver', 'gold', 'platinum', 'vip']),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { customerProfile, tier } = req.body;
        let member = null;
        if (customerProfile.email) {
          const { data } = await db
            .from('members')
            .select('*')
            .eq('email', customerProfile.email)
            .maybeSingle();
          member = data;
        }
        if (!member) {
          member = await members.createMember(db, {
            name: customerProfile.name,
            email: customerProfile.email,
            phone: customerProfile.phone,
            tier: tier || 'bronze',
          });
        }

        const { buffer, serialNumber, authenticationToken } = await wallet.generatePass({
          memberId: member.id,
          name: member.name,
          tier: member.tier,
          points: member.points_balance,
          webServiceURL: webServiceURL(),
        });

        await members.updateMemberPass(db, member.id, {
          passSerial: serialNumber,
          authToken: authenticationToken,
        });
        await touchPassUpdate(db, serialNumber);

        res.set({
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${serialNumber}.pkpass"`,
          'X-Member-Id': member.id,
          'X-Pass-Serial': serialNumber,
        });
        res.send(buffer);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /update-points ------------------------------------------------
  router.post(
    '/update-points',
    [
      body('memberId').isString().notEmpty().withMessage('memberId is required'),
      body('pointsDelta').isInt().withMessage('pointsDelta must be an integer').toInt(),
      body('reason').optional().isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { memberId, pointsDelta, reason } = req.body;
        const { newBalance } = await members.addPoints(db, memberId, pointsDelta, reason || '');
        const member = await members.getMemberById(db, memberId);
        if (member.pass_serial) {
          await touchPassUpdate(db, member.pass_serial);
          await push.notifyPassUpdated(member.pass_serial, { db });
        }
        res.json({ memberId, newBalance });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /redeem --------------------------------------------------------
  router.post(
    '/redeem',
    [
      body('rewardId').isString().notEmpty().withMessage('rewardId is required'),
      body('memberId').optional().isString(),
      body('serialNumber').optional().isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { memberId, serialNumber, rewardId } = req.body;
        const result = await members.redeemReward(db, { memberId, serialNumber, rewardId });
        const member = await members.resolveMember(db, { memberId, serialNumber });
        if (member.pass_serial) {
          await touchPassUpdate(db, member.pass_serial);
          await push.notifyPassUpdated(member.pass_serial, { db });
        }
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /members (admin search; service-auth only) ---------------------------
  router.get(
    '/members',
    [
      query('search').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const limit = req.query.limit || 25;
        const needle = (req.query.search || '').toLowerCase();
        const { data, error } = await db
          .from('members')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(Math.max(limit, needle ? 100 : limit));
        if (error) throw error;
        const filtered = needle
          ? data.filter(
              (m) =>
                (m.name || '').toLowerCase().includes(needle) ||
                (m.email || '').toLowerCase().includes(needle)
            )
          : data;
        res.json({ members: filtered.slice(0, limit).map(toMemberJson), count: filtered.length });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /member/:id ------------------------------------------------------
  router.get(
    '/member/:id',
    [param('id').isString().notEmpty().withMessage('id is required')],
    validate,
    async (req, res, next) => {
      try {
        const member = await members.getMemberById(db, req.params.id);
        const history = await members.getHistory(db, req.params.id);
        res.json({ ...toMemberJson(member), history });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /member/:id (admin removal) ------------------------------------
  router.delete(
    '/member/:id',
    [param('id').isString().notEmpty().withMessage('id is required')],
    validate,
    async (req, res, next) => {
      try {
        res.json(await members.deleteMember(db, req.params.id));
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /register-device -------------------------------------------------
  router.post(
    '/register-device',
    [
      body('memberId').isString().notEmpty().withMessage('memberId is required'),
      body('deviceToken').isString().notEmpty().withMessage('deviceToken is required'),
      body('platform').optional().isIn(['ios', 'android', 'web']),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { created } = await registerDevice(db, req.body);
        res.json({ success: true, created });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /push-update ------------------------------------------------------
  router.post(
    '/push-update',
    [
      body('memberId').optional().isString(),
      body('serialNumber').optional().isString(),
    ],
    validate,
    async (req, res, next) => {
      try {
        const { memberId, serialNumber } = req.body;
        const member = await members.resolveMember(db, { memberId, serialNumber });
        if (!member.pass_serial) {
          const err = new Error('Member has no pass yet.');
          err.status = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        await touchPassUpdate(db, member.pass_serial);
        await push.notifyPassUpdated(member.pass_serial, { db });
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createAppRouter };
