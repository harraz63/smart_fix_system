import { Router } from 'express';
import * as ctrl from '../controllers/paymentController';
import { protect, requireRole } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();
router.use(protect);

router.get('/methods', ctrl.getPaymentMethods);
router.post('/methods', ctrl.addPaymentMethod);
router.delete('/methods/:id', ctrl.deletePaymentMethod);
router.post('/checkout', requireRole(UserRole.Customer), ctrl.checkout);
router.get('/history', ctrl.getPaymentHistory);
router.get('/:id', ctrl.getPaymentById);

export default router;
