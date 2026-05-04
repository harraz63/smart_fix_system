import { Router } from 'express';
import * as ctrl from '../controllers/userController';
import { protect } from '../middleware/auth';
import { uploadAvatar } from '../middleware/upload';

const router = Router();
router.use(protect);

router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);
router.post('/profile/avatar', uploadAvatar, ctrl.uploadAvatar);
router.delete('/profile/avatar', ctrl.deleteAvatar);
router.get('/profile/qr-code', ctrl.getQrCode);
router.get('/profile/share-link', ctrl.getShareLink);
router.get('/invite-link', ctrl.getInviteLink);

router.get('/addresses', ctrl.getAddresses);
router.post('/addresses', ctrl.addAddress);
router.put('/addresses/:id', ctrl.updateAddress);
router.delete('/addresses/:id', ctrl.deleteAddress);
router.put('/addresses/:id/default', ctrl.setDefaultAddress);

router.get('/settings', ctrl.getSettings);
router.put('/settings/language', ctrl.updateLanguage);
router.put('/settings/theme', ctrl.updateTheme);

router.get('/privacy-settings', ctrl.getPrivacySettings);
router.put('/privacy-settings', ctrl.updatePrivacySettings);

router.delete('/account', ctrl.deleteAccount);

export default router;
