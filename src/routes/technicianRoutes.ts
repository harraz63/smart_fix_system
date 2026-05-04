import { Router } from 'express';
import * as bookingCtrl from '../controllers/bookingController';
import * as paymentCtrl from '../controllers/paymentController';
import { protect, requireRole } from '../middleware/auth';
import { uploadDocument } from '../middleware/upload';
import { UserRole } from '../types';

const router = Router();
router.use(protect, requireRole(UserRole.Technician));

router.get('/dashboard', bookingCtrl.getTechnicianDashboard);
router.get('/requests', bookingCtrl.getTechnicianRequests);
router.get('/jobs', bookingCtrl.getTechnicianJobs);
router.put('/status', bookingCtrl.toggleTechnicianStatus);
router.post('/location', bookingCtrl.updateTechnicianLocation);

router.get('/earnings', paymentCtrl.getTechnicianEarnings);
router.get('/earnings/history', paymentCtrl.getTechnicianEarningsHistory);

export default router;
