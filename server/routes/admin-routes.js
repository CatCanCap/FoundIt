// OWNER: Member 1. Mounted at /api/admin (feature 5b and 5c, the Admin page).
// Every route needs a logged-in user with the admin role.
const express = require('express');

const disputes = require('../controllers/admin-disputes-controller');
const reports = require('../controllers/admin-reports-controller');
const users = require('../controllers/admin-users-controller');
const appeals = require('../controllers/admin-appeals-controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/disputes', disputes.getDisputes);
router.get('/disputes/:id', disputes.getDispute);
router.post('/disputes/:id/uphold', disputes.upholdDispute);
router.post('/disputes/:id/close', disputes.closeDispute);

router.get('/reports', reports.getReports);
router.get('/reports/:id', reports.getReport);
router.post('/reports/:id/dismiss', reports.dismissReport);
router.post('/reports/:id/warn', reports.warnFromReport);
router.post('/reports/:id/remove', reports.removeFromReport);
router.post('/reports/:id/suspend', reports.suspendFromReport);

router.get('/users', users.getUsers);
router.post('/users/:id/unsuspend', users.unsuspendUser);
router.get('/actions', users.getActions);

router.get('/appeals', appeals.getAppeals);
router.post('/appeals/:id/accept', appeals.acceptAppeal);
router.post('/appeals/:id/decline', appeals.declineAppeal);

module.exports = router;
