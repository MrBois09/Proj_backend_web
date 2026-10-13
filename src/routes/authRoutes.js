import { Router } from 'express';
import {
  changePassword, forgotPassword, login, logout, me, refresh, register,
  resendVerification, resetPassword, verifyEmail
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit, resendRateLimit } from '../middleware/rateLimit.js';
import { success } from '../utils/response.js';

const router = Router();

router.get('/csrf', (req, res) => {
  return success(res, { csrfToken: req.csrfToken }, 'CSRF token issued');
});
router.post('/register', authRateLimit, register);
router.post('/verify-email', authRateLimit, verifyEmail);
router.post('/resend-verification', resendRateLimit, resendVerification);
router.post('/login', authRateLimit, login);
router.get('/me', requireAuth, me);
router.post('/refresh', authRateLimit, refresh);
router.post('/logout', logout);
router.post('/forgot-password', authRateLimit, forgotPassword);
router.post('/reset-password', authRateLimit, resetPassword);
router.patch('/change-password', requireAuth, authRateLimit, changePassword);

export default router;
