import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Review from '../models/Review';
import Booking from '../models/Booking';
import TechnicianProfile from '../models/TechnicianProfile';
import { AuthRequest, BookingStatus } from '../types';
import { successResponse, errorResponse, paginatedResponse } from '../utils/responseHelper';
import { paginate, buildPagination } from '../utils/pagination';

const auth = (req: Request): AuthRequest => req as AuthRequest;

const recalcTechnicianRating = async (technicianId: Types.ObjectId): Promise<void> => {
  const reviews = await Review.find({ technicianId });
  if (!reviews.length) return;
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await TechnicianProfile.findOneAndUpdate(
    { userId: technicianId },
    { rating: Math.round(avg * 10) / 10, totalReviews: reviews.length }
  );
};

export const submitReview = async (req: Request, res: Response): Promise<void> => {
  const { bookingId, rating, comment } = req.body as {
    bookingId?: string; rating?: number; comment?: string;
  };
  if (!bookingId || !rating) {
    errorResponse(res, 'bookingId and rating required', 'MISSING_FIELDS', 400);
    return;
  }
  if (rating < 1 || rating > 5) {
    errorResponse(res, 'Rating must be between 1 and 5', 'INVALID_RATING', 400);
    return;
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }
  if (booking.status !== BookingStatus.Completed) {
    errorResponse(res, 'Can only review completed bookings', 'INVALID_STATE', 400);
    return;
  }
  if (booking.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Only the customer can review', 'FORBIDDEN', 403);
    return;
  }

  const existing = await Review.findOne({ bookingId });
  if (existing) {
    errorResponse(res, 'Review already submitted for this booking', 'DUPLICATE', 409);
    return;
  }

  const review = await Review.create({
    bookingId,
    customerId: auth(req).user._id,
    technicianId: booking.technicianId,
    rating,
    comment: comment ?? '',
    editWindowExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await recalcTechnicianRating(booking.technicianId as Types.ObjectId);
  successResponse(res, review, 'Review submitted', 201);
};

export const getReviewByBooking = async (req: Request, res: Response): Promise<void> => {
  const review = await Review.findOne({ bookingId: req.params.bookingId })
    .populate('customerId', 'name avatarUrl');
  if (!review) { errorResponse(res, 'Review not found', 'NOT_FOUND', 404); return; }
  successResponse(res, review);
};

export const editReview = async (req: Request, res: Response): Promise<void> => {
  const review = await Review.findById(req.params.id);
  if (!review) { errorResponse(res, 'Review not found', 'NOT_FOUND', 404); return; }
  if (review.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Not your review', 'FORBIDDEN', 403);
    return;
  }
  if (new Date() > review.editWindowExpires) {
    errorResponse(res, 'Edit window has expired (24h)', 'EDIT_EXPIRED', 400);
    return;
  }

  const { rating, comment } = req.body as { rating?: number; comment?: string };
  if (rating !== undefined) review.rating = rating;
  if (comment !== undefined) review.comment = comment;
  await review.save();

  await recalcTechnicianRating(review.technicianId as Types.ObjectId);
  successResponse(res, review, 'Review updated');
};

export const getTechnicianReviews = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { technicianId: req.params.id };
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'name avatarUrl'),
    Review.countDocuments(filter),
  ]);
  paginatedResponse(res, reviews, buildPagination(page, limit, total));
};
