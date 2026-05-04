import { Router } from 'express';
import * as ctrl from '../controllers/homeController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/home',    protect, ctrl.getHome);
router.get('/banners', protect, ctrl.getBanners);

// Technician types lookup (public reference endpoint)
router.get('/technician-types', protect, ctrl.getTechnicianTypes);

// Categories — supports ?type=painting|carpentry|conditioning|electricity|plumbing
router.get('/categories',                  protect, ctrl.getCategories);
router.get('/categories/:id',              protect, ctrl.getCategoryById);
router.get('/categories/:id/services',     protect, ctrl.getCategoryServices);

// Services — search must be before /:id
router.get('/services/search', protect, ctrl.searchServices);
router.get('/services',        protect, ctrl.getServices);
router.get('/services/:id',    protect, ctrl.getServiceById);

// Technicians — search/nearby must be before /:id
router.get('/technicians/search',           protect, ctrl.searchTechnicians);
router.get('/technicians/nearby',           protect, ctrl.getNearbyTechnicians);
router.get('/technicians/:id/availability', protect, ctrl.getTechnicianAvailability);
router.get('/technicians/:id',              protect, ctrl.getTechnicianById);

export default router;
