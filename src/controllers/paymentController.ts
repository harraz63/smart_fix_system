import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Payment from '../models/Payment';
import Booking from '../models/Booking';
import Service from '../models/Service';
import * as paymentService from '../services/payment';
import { AuthRequest, BookingStatus, PaymentStatus } from '../types';
import {
  successResponse,
  errorResponse,
  paginatedResponse,
} from '../utils/responseHelper';
import { paginate, buildPagination } from '../utils/pagination';

const auth = (req: Request): AuthRequest => req as AuthRequest;

export const getPaymentMethods = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  successResponse(res, paymentService.getPaymentMethods());
};

export const addPaymentMethod = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { last4, expMonth, expYear } = req.body as {
    last4?: string;
    expMonth?: number;
    expYear?: number;
  };
  successResponse(
    res,
    {
      id: `card_test_${Date.now()}`,
      brand: 'visa',
      last4: last4 ?? '4242',
      expMonth: expMonth ?? 12,
      expYear: expYear ?? 2026,
    },
    'Payment method added',
    201,
  );
};

export const deletePaymentMethod = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  successResponse(res, null, 'Payment method removed');
};

export const checkout = async (req: Request, res: Response): Promise<void> => {
  const { bookingId } = req.body as { bookingId?: string };
  if (!bookingId) {
    errorResponse(res, 'bookingId required', 'MISSING_FIELD', 400);
    return;
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }
  if (booking.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Not your booking', 'FORBIDDEN', 403);
    return;
  }

  const existing = await Payment.findOne({
    bookingId,
    status: PaymentStatus.Success,
  });
  if (existing) {
    errorResponse(res, 'Booking already paid', 'ALREADY_PAID', 400);
    return;
  }

  const service = await Service.findById(booking.serviceId);
  if (!service) {
    errorResponse(res, 'Service not found', 'NOT_FOUND', 404);
    return;
  }

  const payment = await paymentService.createPaymentIntent(booking, service);
  await paymentService.confirmPayment(payment._id as Types.ObjectId);

  successResponse(
    res,
    { paymentId: payment._id, status: 'success', amount: payment.amount },
    'Payment successful',
  );
};

export const getPaymentHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { customerId: auth(req).user._id };
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('bookingId', 'scheduledAt status'),
    Payment.countDocuments(filter),
  ]);
  paginatedResponse(res, payments, buildPagination(page, limit, total));
};

export const getPaymentById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payment = await Payment.findById(req.params.id).populate('bookingId');
  if (!payment) {
    errorResponse(res, 'Payment not found', 'NOT_FOUND', 404);
    return;
  }
  if (payment.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Access denied', 'FORBIDDEN', 403);
    return;
  }
  successResponse(res, payment);
};

export const getTechnicianEarnings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const techId = auth(req).user._id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  const bookingIds = await Booking.find({
    technicianId: techId,
    status: BookingStatus.Completed,
  }).distinct('_id');

  const baseMatch = {
    bookingId: { $in: bookingIds },
    status: PaymentStatus.Success,
  };

  const [todayAgg, weekAgg, totalAgg] = await Promise.all([
    Payment.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: weekStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  successResponse(res, {
    today: (todayAgg[0] as { total?: number } | undefined)?.total ?? 0,
    thisWeek: (weekAgg[0] as { total?: number } | undefined)?.total ?? 0,
    total: (totalAgg[0] as { total?: number } | undefined)?.total ?? 0,
  });
};

export const getTechnicianEarningsHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { page, limit, skip } = paginate(req.query);
  const bookingIds = await Booking.find({
    technicianId: auth(req).user._id,
    status: BookingStatus.Completed,
  }).distinct('_id');

  const filter = {
    bookingId: { $in: bookingIds },
    status: PaymentStatus.Success,
  };
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'bookingId',
        populate: { path: 'serviceId', select: 'name' },
      }),
    Payment.countDocuments(filter),
  ]);
  paginatedResponse(res, payments, buildPagination(page, limit, total));
};
