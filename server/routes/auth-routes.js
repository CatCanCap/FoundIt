const express = require('express');

const authController = require('../controllers/auth-controller');
const passwordController = require('../controllers/password-controller');
const { requireAuth, requireLogin } = require('../middleware/auth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', passwordController.forgotPassword);
router.post('/reset-password', passwordController.resetPassword);
// No login for these two: a new account logs in by entering its emailed code
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-code', authController.resendCode);
// The Profile page. requireLogin, so a suspended or unconfirmed account can
// still change its own password
router.post('/change-password', requireLogin, passwordController.changePassword);
router.get('/me', requireAuth, authController.getMe);
router.patch('/me', requireAuth, authController.updateMe);

module.exports = router;
