import { Router } from 'express';
import * as reviewCtrl from '../controllers/reviewController';
import * as bookingCtrl from '../controllers/bookingController';
import { protect, requireRole } from '../middleware/auth';
import { uploadDocument } from '../middleware/upload';
import { UserRole } from '../types';

const router = Router();
router.use(protect);

// Public: any authenticated user can view technician reviews
router.get('/:id/reviews', reviewCtrl.getTechnicianReviews);

// Technician-only: update own profile (spec: PUT /technicians/profile)
router.put('/profile', requireRole(UserRole.Technician), bookingCtrl.updateTechnicianProfile);
router.post(
  '/profile/documents',
  requireRole(UserRole.Technician),
  uploadDocument,
  bookingCtrl.uploadTechnicianDocument
);

export default router;
