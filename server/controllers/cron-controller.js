const Item = require('../models/item-model');
const Handoff = require('../models/handoff-model');
const { completeHandoff, blockedReason } = require('../lib/handoff-steps');
const { httpError } = require('../lib/errors');
const { DAY } = require('../lib/time');

const STALE_AFTER_DAYS = 30;
// The owner has this long to confirm a handoff before it completes by itself
const AUTO_CONFIRM_AFTER_DAYS = 7;

// Called once a day by Vercel, which sends "Authorization: Bearer <CRON_SECRET>".
// It archives old items, completes handoffs the owner never confirmed (except
// on items with an open dispute, which wait for an admin, and handoffs whose
// claim an admin moved to someone else), and the database
// queries themselves keep the free Supabase project from being paused.
exports.runDaily = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    throw httpError(401, 'Not allowed');
  }

  const archived = await Item.archiveStale(STALE_AFTER_DAYS);

  const cutoff = new Date(Date.now() - AUTO_CONFIRM_AFTER_DAYS * DAY);
  const unconfirmed = await Handoff.findHandedOverBefore(cutoff);
  let handoffsCompleted = 0;
  let handoffsFailed = 0;
  for (const handoff of unconfirmed) {
    // Skip items under dispute, and old handoffs whose claim no longer stands
    if (await blockedReason(handoff)) continue;
    // One handoff that fails (for example a dispute opened a moment ago) is
    // logged and tried again tomorrow; it must not stop the rest
    try {
      await completeHandoff(handoff);
      handoffsCompleted += 1;
    } catch (error) {
      console.error(`Daily job could not complete handoff ${handoff.id}:`, error);
      handoffsFailed += 1;
    }
  }

  res.json({ ok: true, archived, handoffsCompleted, ...(handoffsFailed > 0 && { handoffsFailed }) });
};
