// Feature 5: a suspended student's appeal (the /appeal page). The admin side
// is in admin-appeals-controller.js.
const Appeal = require('../models/appeal-model');
const AdminAction = require('../models/admin-action-model');
const { httpError } = require('../lib/errors');
const { isNonEmptyString } = require('../lib/validate');
const { optionalOurPhoto } = require('../lib/photo-size');

const MAX_LENGTH = 1000;

// The same moment, however each side wrote it down
function sameTime(a, b) {
  return Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();
}

// What the student sees of an appeal: never which admin decided it
function forStudent(appeal) {
  if (!appeal) return null;
  const { id, suspendedAt, message, proofUrl, status, reply, decidedAt, createdAt } = appeal;
  return { id, suspendedAt, message, proofUrl, status, reply, decidedAt, createdAt };
}

// GET /api/appeals/mine: the person's suspension (with the reason an admin
// logged, which the student is shown), their latest appeal, and whether they
// can still appeal this suspension (one appeal each).
exports.getMine = async (req, res) => {
  const { suspendedAt } = req.user;
  const [appeal, logged] = await Promise.all([
    Appeal.findLatestForUser(req.user.id),
    suspendedAt ? AdminAction.findLatestSuspension(req.user.id) : null,
  ]);
  const sameSuspension = Boolean(appeal) && sameTime(appeal.suspendedAt, suspendedAt);
  res.json({
    suspension: suspendedAt ? { suspendedAt, reason: logged?.reason || '' } : null,
    appeal: forStudent(appeal),
    canAppeal: Boolean(suspendedAt) && !sameSuspension,
  });
};

// POST /api/appeals: { message, proofUrl? }. requireLogin, because a
// suspended account is refused everywhere else.
exports.addAppeal = async (req, res) => {
  const { suspendedAt } = req.user;
  if (!suspendedAt) throw httpError(409, 'Your account is not suspended');
  const body = req.body || {};
  if (!isNonEmptyString(body.message, MAX_LENGTH)) {
    throw httpError(400, `Say what happened, in up to ${MAX_LENGTH} characters`);
  }
  const proofUrl = await optionalOurPhoto(body.proofUrl, 'Photo link');
  const existing = await Appeal.findLatestForUser(req.user.id);
  if (existing && sameTime(existing.suspendedAt, suspendedAt)) {
    throw httpError(409, 'You have already appealed this suspension');
  }
  const appeal = await Appeal.create({
    userId: req.user.id, suspendedAt, message: body.message.trim(), proofUrl,
  });
  res.status(201).json(forStudent(appeal));
};
