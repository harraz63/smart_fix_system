import { Router } from 'express';
import * as ctrl from '../controllers/reviewController';
import { protect, requireRole } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();
router.use(protect);

router.post('/', requireRole(UserRole.Customer), ctrl.submitReview);
router.get('/booking/:bookingId', ctrl.getReviewByBooking);
router.put('/:id', requireRole(UserRole.Customer), ctrl.editReview);

export default router;
