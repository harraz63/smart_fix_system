import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Category from '../models/Category';
import Service from '../models/Service';
import User from '../models/User';
import TechnicianProfile from '../models/TechnicianProfile';
import Review from '../models/Review';
import { BookingStatus, TechnicianType } from '../types';
import { successResponse, errorResponse, paginatedResponse } from '../utils/responseHelper';
import { paginate, buildPagination } from '../utils/pagination';

export const getHome = async (_req: Request, res: Response): Promise<void> => {
  const [categories, featuredServices, topProfiles] = await Promise.all([
    Category.find({ isActive: true }).limit(8),
    Service.find({ isActive: true })
      .populate('categoryId', 'name icon technicianType')
      .limit(6),
    TechnicianProfile.find({ isOnline: true })
      .sort({ rating: -1 })
      .limit(4)
      .populate('userId', 'name avatarUrl'),
  ]);

  const banners = [
    {
      id: 1,
      title: 'Fix it Fast',
      subtitle: 'Professional technicians near you',
      imageUrl: null,
      type: TechnicianType.Plumbing,
    },
    {
      id: 2,
      title: '20% Off Painting',
      subtitle: 'Book a painter this week',
      imageUrl: null,
      type: TechnicianType.Painting,
    },
    {
      id: 3,
      title: 'AC Service & Repair',
      subtitle: 'Stay cool — certified AC technicians',
      imageUrl: null,
      type: TechnicianType.Conditioning,
    },
    {
      id: 4,
      title: 'Electrical Safety Check',
      subtitle: 'Book now from $25',
      imageUrl: null,
      type: TechnicianType.Electricity,
    },
  ];

  successResponse(res, {
    banners,
    categories,
    featuredServices,
    topTechnicians: topProfiles,
  });
};

export const getBanners = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const banners = [
    {
      id: 1,
      title: 'Fix it Fast',
      subtitle: 'Professional plumbers near you',
      imageUrl: null,
      type: TechnicianType.Plumbing,
    },
    {
      id: 2,
      title: '20% Off Painting',
      subtitle: 'Book a painter this week',
      imageUrl: null,
      type: TechnicianType.Painting,
    },
    {
      id: 3,
      title: 'AC Service & Repair',
      subtitle: 'Certified AC technicians',
      imageUrl: null,
      type: TechnicianType.Conditioning,
    },
    {
      id: 4,
      title: 'Electrical Safety Check',
      subtitle: 'Book now from $25',
      imageUrl: null,
      type: TechnicianType.Electricity,
    },
    {
      id: 5,
      title: 'Carpentry & Woodwork',
      subtitle: 'Custom furniture and repairs',
      imageUrl: null,
      type: TechnicianType.Carpentry,
    },
  ];
  successResponse(res, banners);
};

export const getCategories = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { type } = req.query as { type?: string };
  const filter: Record<string, unknown> = { isActive: true };
  if (type) {
    if (!Object.values(TechnicianType).includes(type as TechnicianType)) {
      errorResponse(
        res,
        `Invalid type. Valid values: ${Object.values(TechnicianType).join(', ')}`,
        'INVALID_TYPE',
        400,
      );
      return;
    }
    filter.technicianType = type;
  }
  const categories = await Category.find(filter).sort({
    technicianType: 1,
    name: 1,
  });
  successResponse(res, categories);
};

export const getCategoryById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    errorResponse(res, 'Category not found', 'NOT_FOUND', 404);
    return;
  }
  successResponse(res, category);
};

export const getCategoryServices = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { categoryId: req.params.id, isActive: true };
  const [services, total] = await Promise.all([
    Service.find(filter)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name icon technicianType'),
    Service.countDocuments(filter),
  ]);
  paginatedResponse(res, services, buildPagination(page, limit, total));
};

export const getServices = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { category, minPrice, maxPrice, type } = req.query as {
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    type?: string;
  };
  const { page, limit, skip } = paginate(req.query);
  const filter: Record<string, unknown> = { isActive: true };
  if (category) filter.categoryId = category;
  if (minPrice || maxPrice) {
    const price: Record<string, number> = {};
    if (minPrice) price.$gte = Number(minPrice);
    if (maxPrice) price.$lte = Number(maxPrice);
    filter.price = price;
  }
  // Filter by technicianType via category join
  if (type) {
    const cats = await Category.find({
      technicianType: type,
      isActive: true,
    }).distinct('_id');
    filter.categoryId = { $in: cats };
  }
  const [services, total] = await Promise.all([
    Service.find(filter)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name icon technicianType'),
    Service.countDocuments(filter),
  ]);
  paginatedResponse(res, services, buildPagination(page, limit, total));
};

export const getServiceById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const service = await Service.findById(req.params.id).populate(
    'categoryId',
    'name icon technicianType description',
  );
  if (!service) {
    errorResponse(res, 'Service not found', 'NOT_FOUND', 404);
    return;
  }
  successResponse(res, service);
};

export const searchServices = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { q, type } = req.query as { q?: string; type?: string };
  if (!q) {
    errorResponse(res, 'Query param q required', 'MISSING_PARAM', 400);
    return;
  }
  const { page, limit, skip } = paginate(req.query);

  const filter: Record<string, unknown> = {
    isActive: true,
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ],
  };

  if (type) {
    const cats = await Category.find({
      technicianType: type,
      isActive: true,
    }).distinct('_id');
    filter.categoryId = { $in: cats };
  }

  const [services, total] = await Promise.all([
    Service.find(filter)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name icon technicianType'),
    Service.countDocuments(filter),
  ]);
  paginatedResponse(res, services, buildPagination(page, limit, total));
};

export const getTechnicianTypes = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const types = Object.values(TechnicianType).map((t) => ({
    type: t,
    label: t.charAt(0).toUpperCase() + t.slice(1),
    icon: {
      painting: '🎨',
      carpentry: '🪚',
      conditioning: '❄️',
      electricity: '⚡',
      plumbing: '🔧',
    }[t],
  }));
  successResponse(res, types);
};

export const searchTechnicians = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { type, rating, isOnline } = req.query as {
    type?: string;
    rating?: string;
    isOnline?: string;
  };
  const { page, limit, skip } = paginate(req.query);

  const filter: Record<string, unknown> = {};
  if (type) {
    if (!Object.values(TechnicianType).includes(type as TechnicianType)) {
      errorResponse(
        res,
        `Invalid type. Valid: ${Object.values(TechnicianType).join(', ')}`,
        'INVALID_TYPE',
        400,
      );
      return;
    }
    filter.technicianType = type;
  }
  if (rating) filter.rating = { $gte: Number(rating) };
  if (isOnline !== undefined) filter.isOnline = isOnline === 'true';

  const [profiles, total] = await Promise.all([
    TechnicianProfile.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ rating: -1 })
      .populate('userId', 'name avatarUrl email phone'),
    TechnicianProfile.countDocuments(filter),
  ]);
  paginatedResponse(res, profiles, buildPagination(page, limit, total));
};

export const getNearbyTechnicians = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    lat,
    lng,
    radius = '10000',
    type,
  } = req.query as {
    lat?: string;
    lng?: string;
    radius?: string;
    type?: string;
  };
  if (!lat || !lng) {
    errorResponse(res, 'lat and lng required', 'MISSING_PARAMS', 400);
    return;
  }

  // Find technicians who are currently tied up on a non-terminal booking,
  // so we can filter them out below. A technician is considered "busy"
  // for a customer's purposes once they've been requested by anyone, all
  // the way through to "started". After Completed/Cancelled they're free.
  const busyTechnicianIds = await Booking.distinct('technicianId', {
    technicianId: { $ne: null },
    status: {
      $in: [
        BookingStatus.TechnicianRequested,
        BookingStatus.Accepted,
        BookingStatus.Started,
      ],
    },
  });

  // Find technicians who are currently tied up on a non-terminal booking,
  // so we can filter them out below. A technician is considered "busy"
  // for a customer's purposes once they've been requested by anyone, all
  // the way through to "started". After Completed/Cancelled they're free.
  const busyTechnicianIds = await Booking.distinct('technicianId', {
    technicianId: { $ne: null },
    status: {
      $in: [
        BookingStatus.TechnicianRequested,
        BookingStatus.Accepted,
        BookingStatus.Started,
      ],
    },
  });

  const geoFilter: Record<string, unknown> = {
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)],
        },
        $maxDistance: Number(radius),
      },
    },
    isOnline: true,
    // Exclude busy technicians from the pool the customer can pick from.
    // The customer can still pick someone who has just gone offline if
    // we drop isOnline, but right now we keep both filters strict.
    userId: { $nin: busyTechnicianIds },
  };

  if (type) {
    if (!Object.values(TechnicianType).includes(type as TechnicianType)) {
      errorResponse(
        res,
        `Invalid type. Valid: ${Object.values(TechnicianType).join(', ')}`,
        'INVALID_TYPE',
        400,
      );
      return;
    }
    geoFilter.technicianType = type;
  }

  const profiles = await TechnicianProfile.find(geoFilter)
    .limit(20)
    .populate('userId', 'name avatarUrl phone');

  successResponse(res, profiles);
};

export const getTechnicianById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = await User.findById(req.params.id).select(
    'name avatarUrl email role phone',
  );
  if (!user || user.role !== 'technician') {
    errorResponse(res, 'Technician not found', 'NOT_FOUND', 404);
    return;
  }
  const [profile, recentReviews] = await Promise.all([
    TechnicianProfile.findOne({ userId: req.params.id }),
    Review.find({ technicianId: req.params.id })
      .populate('customerId', 'name avatarUrl')
      .sort({ createdAt: -1 })
      .limit(5),
  ]);
  successResponse(res, { user, profile, recentReviews });
};

export const getTechnicianAvailability = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const slots = [];
  const now = new Date();
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const daySlots = [];
    for (let h = 8; h <= 18; h += 2) {
      const slot = new Date(date);
      slot.setHours(h, 0, 0, 0);
      daySlots.push({ time: slot.toISOString(), available: true });
    }
    slots.push({ date: date.toDateString(), slots: daySlots });
  }
  successResponse(res, slots);
};
