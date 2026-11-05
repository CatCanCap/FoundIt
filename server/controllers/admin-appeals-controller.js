// Feature 5: the Appeals tab on the Admin page. Accepting lifts the
// suspension; declining keeps it. Both need a reply, which the student reads,
// and both go in the action log.
const Appeal = require('../models/appeal-model');
const User = require('../models/user-model');
const AdminAction = require('../models/admin-action-model');
const { httpError } = require('../lib/errors');
const { parseId } = require('../lib/validate');
const { parseStatusFilter, requireReason, loadHistory, withHistory } = require('./admin-shared');

const STATUSES = ['open', 'accepted', 'declined'];

// GET /api/admin/appeals?status=open|accepted|declined|all (default open).
// Each comes with the person (and their record on other cases) and the reason
// logged for their suspension.
exports.getAppeals = async (req, res) => {
  const status = parseStatusFilter(req.query.status, STATUSES);
  const appeals = await Appeal.findByStatuses(status ? [status] : STATUSES);
  const users = await User.findByIds([...new Set(appeals.map((appeal) => appeal.userId))]);
  const history = await loadHistory(users);
  const people = new Map(users.map((user) => [user.id, withHistory(User.toContact(user), history)]));
  const suspensions = await Promise.all(
    appeals.map((appeal) => AdminAction.findLatestSuspension(appeal.userId)),
  );
  res.json(appeals.map((appeal, index) => ({
    ...appeal,
    person: people.get(appeal.userId) || null,
    suspensionReason: suspensions[index]?.reason || '',
  })));
};

async function decide(req, status) {
  const reply = requireReason(req.body);
  const appeal = await Appeal.findById(parseId(req.params.id));
  if (!appeal) throw httpError(404, 'Appeal not found');
  const decided = await Appeal.decide(appeal.id, { status, reply, decidedBy: req.user.id });
  if (!decided) throw httpError(409, 'Another admin has already decided this appeal');
  return { appeal: decided, reply };
}

// POST /api/admin/appeals/:id/accept { reason }: lifts the suspension
exports.acceptAppeal = async (req, res) => {
  const { appeal, reply } = await decide(req, 'accepted');
  const user = await User.findById(appeal.userId);
  if (user?.suspendedAt) await User.update(user.id, { suspendedAt: null });
  await AdminAction.create({
    adminId: req.user.id, action: 'unsuspend_user', userId: appeal.userId, appealId: appeal.id, reason: reply,
  });
  res.json(appeal);
};

// POST /api/admin/appeals/:id/decline { reason }: keeps the suspension
exports.declineAppeal = async (req, res) => {
  const { appeal, reply } = await decide(req, 'declined');
  await AdminAction.create({
    adminId: req.user.id, action: 'decline_appeal', userId: appeal.userId, appealId: appeal.id, reason: reply,
  });
  res.json(appeal);
};
