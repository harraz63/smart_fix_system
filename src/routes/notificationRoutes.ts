import { Router } from 'express';
import * as ctrl from '../controllers/notificationController';
import { protect } from '../middleware/auth';

const router = Router();
router.use(protect);

router.get('/', ctrl.getNotifications);
router.put('/read-all', ctrl.markAllRead);
router.put('/:id/read', ctrl.markRead);
router.delete('/:id', ctrl.deleteNotification);

router.post('/push/register', ctrl.registerPushToken);
router.delete('/push/unregister', ctrl.unregisterPushToken);

router.get('/settings', ctrl.getNotificationSettings);
router.put('/settings', ctrl.updateNotificationSettings);

export default router;
