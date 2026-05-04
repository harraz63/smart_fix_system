import { Router } from 'express';
import * as ctrl from '../controllers/userController';

const router = Router();

router.get('/privacy-policy', ctrl.getPrivacyPolicy);
router.get('/contact-us', ctrl.getContactUs);
router.get('/app-version', ctrl.getAppVersion);

export default router;
