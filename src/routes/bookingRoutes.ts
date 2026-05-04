import { Router } from 'express';
import * as ctrl from '../controllers/bookingController';
import { protect, requireRole } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();
router.use(protect);

router.post('/', requireRole(UserRole.Customer), ctrl.createBooking);
router.get('/', ctrl.getBookings);
router.get('/:id', ctrl.getBookingById);
router.put('/:id/cancel', requireRole(UserRole.Customer), ctrl.cancelBooking);
router.put('/:id/reschedule', requireRole(UserRole.Customer), ctrl.rescheduleBooking);
router.get('/:id/invoice', ctrl.getInvoice);
router.get('/:id/tracking', ctrl.getTracking);
router.post('/:id/report', requireRole(UserRole.Customer), ctrl.reportBooking);

router.put('/:id/accept', requireRole(UserRole.Technician), ctrl.acceptBooking);
router.put('/:id/reject', requireRole(UserRole.Technician), ctrl.rejectBooking);
router.put('/:id/start', requireRole(UserRole.Technician), ctrl.startBooking);
router.put('/:id/complete', requireRole(UserRole.Technician), ctrl.completeBooking);

export default router;
