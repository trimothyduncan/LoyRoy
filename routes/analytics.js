'use strict';

/**
 * Section C — merchant analytics (read-only aggregates).
 * Factory: createAnalyticsRouter({ db }) so tests inject fakes.
 * Mounted behind serviceAuth (see app.js). All math server-side over
 * capped queries (page sizes below); large merchants will need
 * pagination/caching later — noted, not built.
 */

const { Router } = require('express');

const DAY_MS = 86400000;
const WINDOW_DAYS = 30;
const ROW_CAP = 5000;
const WINBACK_LIMIT = 10;

function dbError(err) {
  const e = new Error(`database: ${err.message || 'query failed'}`);
  e.status = 500;
  e.code = 'DB_ERROR';
  return e;
}

async function fetchAll(db, table, cols) {
  const { data, error } = await db.from(table).select(cols).limit(ROW_CAP);
  if (error) throw dbError(error);
  return data || [];
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

/** Last known activity: visit beats creation (ledger-blind by design). */
function lastActivityOf(member) {
  return new Date(member.last_visit_at || member.created_at || Date.now());
}

async function buildSummary(db, now = new Date()) {
  const [members, ledger, redemptions, rewards, registrations] = await Promise.all([
    fetchAll(db, 'members', 'id,name,email,tier,points_balance,created_at,last_visit_at'),
    fetchAll(db, 'points_ledger', 'member_id,delta,created_at'),
    fetchAll(db, 'redemptions', 'reward_id,created_at'),
    fetchAll(db, 'rewards', 'id,name,cost_points'),
    fetchAll(db, 'apple_registrations', 'serial_number'),
  ]);

  const rewardById = new Map(rewards.map((r) => [r.id, r]));

  let pointsIssued = 0;
  let pointsRedeemed = 0;
  const ledgerByDay = new Map();
  for (const row of ledger) {
    const at = new Date(row.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const k = dayKey(at);
    const slot = ledgerByDay.get(k) || { issued: 0, redeemed: 0 };
    if (row.delta > 0) {
      pointsIssued += row.delta;
      slot.issued += row.delta;
    } else if (row.delta < 0) {
      pointsRedeemed += -row.delta;
      slot.redeemed += -row.delta;
    }
    ledgerByDay.set(k, slot);
  }

  const signupsByDay = new Map();
  for (const m of members) {
    const at = new Date(m.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const k = dayKey(at);
    signupsByDay.set(k, (signupsByDay.get(k) || 0) + 1);
  }

  const daily = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const k = dayKey(d);
    const flow = ledgerByDay.get(k) || { issued: 0, redeemed: 0 };
    daily.push({ date: k, signups: signupsByDay.get(k) || 0, issued: flow.issued, redeemed: flow.redeemed });
  }

  const tiers = {};
  for (const m of members) {
    const t = (m.tier || 'bronze').toLowerCase();
    tiers[t] = tiers[t] || { tier: t, members: 0, balance: 0 };
    tiers[t].members += 1;
    tiers[t].balance += m.points_balance || 0;
  }
  const tierMix = Object.values(tiers)
    .map((t) => ({ tier: t.tier, members: t.members, avgBalance: t.members ? Math.round(t.balance / t.members) : 0 }))
    .sort((a, b) => b.members - a.members);

  const rewardCounts = new Map();
  for (const r of redemptions) {
    rewardCounts.set(r.reward_id, (rewardCounts.get(r.reward_id) || 0) + 1);
  }
  const topRewards = [...rewardCounts.entries()]
    .map(([rewardId, count]) => {
      const rw = rewardById.get(rewardId) || {};
      return { name: rw.name || 'Unknown reward', count, points: count * (rw.cost_points || 0) };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const atRisk = { active: 0, quiet30: 0, quiet60: 0, dormant90: 0 };
  const winback = [];
  for (const m of members) {
    const daysQuiet = Math.floor((now - lastActivityOf(m)) / DAY_MS);
    if (daysQuiet < 30) atRisk.active += 1;
    else if (daysQuiet < 60) atRisk.quiet30 += 1;
    else if (daysQuiet < 90) atRisk.quiet60 += 1;
    else atRisk.dormant90 += 1;
    if (daysQuiet >= 30) {
      winback.push({
        memberId: m.id,
        name: m.name,
        email: m.email || null,
        pointsBalance: m.points_balance || 0,
        daysQuiet,
      });
    }
  }
  winback.sort((a, b) => b.pointsBalance - a.pointsBalance);

  return {
    totals: {
      members: members.length,
      installedPasses: registrations.length,
      pointsIssued,
      pointsRedeemed,
      redemptions: redemptions.length,
    },
    tierMix,
    daily,
    topRewards,
    atRisk,
    winback: winback.slice(0, WINBACK_LIMIT),
  };
}

function createAnalyticsRouter({ db } = {}) {
  const router = Router();

  // GET /analytics/summary — whole-dashboard aggregates in one call.
  // db is injected by app.js (real client or lazy proxy); tests pass a fake.
  router.get('/analytics/summary', async (req, res, next) => {
    try {
      res.json(await buildSummary(db));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAnalyticsRouter, buildSummary };
