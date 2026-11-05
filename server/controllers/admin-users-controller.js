// Feature 5b and 5c: the People tab and the action log on the Admin page.
const User = require('../models/user-model');
const AdminAction = require('../models/admin-action-model');
const Appeal = require('../models/appeal-model');
const { personRow } = require('../lib/admin-history');
const { requireReason, contactsById } = require('./admin-shared');
const { httpError } = require('../lib/errors');
const { parseId } = require('../lib/validate');

exports.unsuspendUser = async (req, res) => {
  const user = await User.findById(parseId(req.params.id));
  if (!user) throw httpError(404, 'User not found');
  if (!user.suspendedAt) throw httpError(400, 'This account is not suspended');
  const reason = requireReason(req.body);
  const updated = await User.update(user.id, { suspendedAt: null });
  await AdminAction.create({ adminId: req.user.id, action: 'unsuspend_user', userId: user.id, reason });
  // An appeal waiting on this suspension is answered with the same reason
  await Appeal.acceptOpenForUser(user.id, { reply: reason, decidedBy: req.user.id });
  res.json(User.toContact(updated));
};

// The People list: suspended accounts and accounts with a warning.
// ?status=suspended (suspended now), warned (warned at least once) or all
// (the default: either). Suspended people come first, then the most recent action.
exports.getUsers = async (req, res) => {
  const status = req.query.status === undefined ? 'all' : req.query.status;
  if (!['suspended', 'warned', 'all'].includes(status)) {
    throw httpError(400, 'Status must be suspended, warned or all');
  }
  const [suspended, actions] = await Promise.all([User.findSuspended(), AdminAction.findAccountActions()]);
  const suspendedIds = new Set(suspended.map((user) => user.id));
  const others = await User.findByIds([...new Set(
    actions.map((action) => action.userId).filter((id) => !suspendedIds.has(id)),
  )]);

  const rows = [...suspended, ...others]
    .map((user) => personRow(user, actions))
    .filter((row) => {
      if (status === 'suspended') return Boolean(row.suspendedAt);
      if (status === 'warned') return row.warnings > 0;
      return Boolean(row.suspendedAt) || row.warnings > 0;
    })
    .sort((a, b) => Number(Boolean(b.suspendedAt)) - Number(Boolean(a.suspendedAt))
      || (b.lastAction?.createdAt || '').localeCompare(a.lastAction?.createdAt || ''));
  res.json(rows);
};

exports.getActions = async (req, res) => {
  const entries = await AdminAction.findAll();
  const contacts = await contactsById(entries.flatMap((entry) => [entry.adminId, entry.userId]));
  res.json(entries.map((entry) => ({
    ...entry,
    admin: contacts.get(entry.adminId) || null,
    user: contacts.get(entry.userId) || null,
  })));
};
