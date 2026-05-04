import { Router } from 'express';
import * as ctrl from '../controllers/chatController';
import { protect } from '../middleware/auth';
import { uploadChatAttachment } from '../middleware/upload';

const router = Router();
router.use(protect);

router.get('/', ctrl.getChats);
router.get('/:bookingId/messages', ctrl.getMessages);
router.post('/:bookingId/messages', ctrl.sendMessage);
router.post('/:bookingId/attachments', uploadChatAttachment, ctrl.sendAttachment);
router.put('/:bookingId/messages/:id/read', ctrl.markMessageRead);

export default router;
