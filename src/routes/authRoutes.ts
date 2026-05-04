import { Router } from 'express';
import * as authCtrl from '../controllers/authController';
import * as userCtrl from '../controllers/userController';
import { protect } from '../middleware/auth';

const router = Router();

// Public
router.post('/register', authCtrl.register);
router.post('/verify-otp', authCtrl.verifyOtp);
router.post('/resend-otp', authCtrl.resendOtp);
router.post('/login', authCtrl.login);
router.post('/refresh-token', authCtrl.refreshToken);
router.post('/forgot-password', authCtrl.forgotPassword);
router.post('/reset-password', authCtrl.resetPassword);

// Protected
router.get('/me', protect, authCtrl.getMe);
router.post('/logout', protect, authCtrl.logout);
router.post('/verify-password', protect, userCtrl.verifyPassword);
router.put('/change-password', protect, userCtrl.changePassword);

export default router;
