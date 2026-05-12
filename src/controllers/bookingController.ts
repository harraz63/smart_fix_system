import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Booking from '../models/Booking';
import User from '../models/User';
import Service from '../models/Service';
import TechnicianProfile from '../models/TechnicianProfile';
import Payment from '../models/Payment';
import { AuthRequest, BookingStatus, UserRole, TechnicianType } from '../types';
import {
  successResponse,
  errorResponse,
  paginatedResponse,
} from '../utils/responseHelper';
import { paginate, buildPagination } from '../utils/pagination';
import * as socketService from '../services/socket';
import * as fcmService from '../services/fcm';
import * as assignmentTimeout from '../services/assignmentTimeout';

const auth = (req: Request): AuthRequest => req as AuthRequest;

/**
 * Allowed status transitions. The new flow uses PendingTechnician
 * and TechnicianRequested as the front of the lifecycle:
 *
 *   PendingTechnician  ⇄  TechnicianRequested  →  Accepted  →  Started  →  Completed
 *                                                       ↓
 *                                                  Cancelled
 *
 * On reject from TechnicianRequested, we go BACK to PendingTechnician
 * (the booking stays alive — see assignmentTimeout.ts and rejectBooking).
 *
 * Pending stays here only for legacy bookings created before the flow
 * change; new bookings never enter Pending.
 */
const VALID_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  [BookingStatus.PendingTechnician]: [
    BookingStatus.TechnicianRequested,
    BookingStatus.Cancelled,
  ],
  [BookingStatus.TechnicianRequested]: [
    BookingStatus.Accepted,
    BookingStatus.PendingTechnician, // tech rejected → back to pool
    BookingStatus.Cancelled,
  ],
  [BookingStatus.Pending]: [
    // legacy
    BookingStatus.Accepted,
    BookingStatus.Rejected,
    BookingStatus.Cancelled,
  ],
  [BookingStatus.Accepted]: [BookingStatus.Started, BookingStatus.Cancelled],
  [BookingStatus.Started]: [BookingStatus.Completed],
};

/** Statuses that count as "active" for the one-booking-per-customer rule. */
const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.PendingTechnician,
  BookingStatus.TechnicianRequested,
  BookingStatus.Accepted,
  BookingStatus.Started,
  BookingStatus.Pending, // legacy active state
];

const transitionBooking = async (
  req: Request,
  res: Response,
  targetStatus: BookingStatus,
  allowedRole: UserRole,
) => {
  const booking = await Booking.findById(req.params.id)
    .populate<{ customerId: { _id: Types.ObjectId; name: string } }>('customerId', 'name')
    .populate<{ technicianId: { _id: Types.ObjectId; name: string } | null }>('technicianId', 'name');

  if (!booking) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return null; }

  const userId = auth(req).user._id.toString();
  if (
    allowedRole === UserRole.Customer &&
    booking.customerId._id.toString() !== userId
  ) {
    errorResponse(
      res,
      'Only the customer can perform this action',
      'FORBIDDEN',
      403,
    );
    return null;
  }
  if (allowedRole === UserRole.Technician) {
    const techId = booking.technicianId?._id.toString();
    if (!techId || techId !== userId) {
      errorResponse(res, 'Only the assigned technician can perform this action', 'FORBIDDEN', 403);
      return null;
    }
  }

  const allowed = VALID_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(targetStatus)) {
    errorResponse(
      res,
      `Cannot transition from ${booking.status} to ${targetStatus}`,
      'INVALID_TRANSITION',
      400,
    );
    return null;
  }

  booking.status = targetStatus;
  if (targetStatus === BookingStatus.Rejected && req.body.reason) {
    booking.rejectionReason = req.body.reason as string;
  }
  await booking.save();

  // Emit booking:status to both parties. Technician id may be null
  // (e.g. customer cancelling a pending_technician booking).
  socketService.emitBookingStatus(
    booking.customerId._id.toString(),
    booking.technicianId?._id.toString() ?? '',
    booking
  );

  return booking;
};

/**
 * Create a new service request.
 *
 * NEW FLOW (post architecture change): the customer submits the
 * request without picking a technician. The booking is created in
 * `pending_technician` status with `technicianId = null`. The
 * customer then browses the technician list and calls
 * /bookings/:id/assign-technician to pick one.
 *
 * Enforces "one active booking per customer" — if the customer
 * already has any non-terminal booking, this call fails. They
 * must cancel or finish that one first.
 */
export const createBooking = async (req: Request, res: Response): Promise<void> => {
  const { serviceId, scheduledAt, addressId, notes } = req.body as {
    serviceId?: string; scheduledAt?: string;
    addressId?: string; notes?: string;
  };

  if (!serviceId || !scheduledAt) {
    errorResponse(res, 'serviceId and scheduledAt required', 'MISSING_FIELDS', 400);
    return;
  }

  const customerId = auth(req).user._id;

  // One-active-booking-per-customer rule.
  const existing = await Booking.findOne({
    customerId,
    status: { $in: ACTIVE_STATUSES },
  });
  if (existing) {
    errorResponse(
      res,
      'You already have an active booking. Cancel or finish it first.',
      'ACTIVE_BOOKING_EXISTS',
      409,
      { activeBookingId: existing._id.toString() }
    );
    return;
  }

  const service = await Service.findById(serviceId);
  if (!service) { errorResponse(res, 'Service not found', 'NOT_FOUND', 404); return; }

  let addressSnapshot: { label?: string; lat?: number; lng?: number } = {};
  if (addressId) {
    const customer = await User.findById(customerId);
    const addr = customer?.addresses.id(addressId);
    if (addr)
      addressSnapshot = { label: addr.label, lat: addr.lat, lng: addr.lng };
  }

  const booking = await Booking.create({
    customerId,
    technicianId: null,
    serviceId,
    addressSnapshot,
    scheduledAt: new Date(scheduledAt),
    notes: notes ?? '',
    status: BookingStatus.PendingTechnician,
    invoice: {
      amount: service.price,
      breakdown: [{ label: service.name, amount: service.price }],
    },
  });

  await booking.populate([
    'serviceId',
    { path: 'customerId', select: 'name avatarUrl' },
  ]);

  // No technician notification yet — that happens in assignTechnician.
  successResponse(res, booking, 'Booking created — pick a technician next', 201);
};

/**
 * Customer assigns a technician to an existing pending booking.
 *
 * Transitions: PendingTechnician → TechnicianRequested.
 * Sets technicianId, assignedAt; emits booking:new-request to the
 * chosen technician; sends FCM push; schedules the 2-min auto-reject
 * timer (assignmentTimeout.ts).
 */
export const assignTechnician = async (req: Request, res: Response): Promise<void> => {
  const { technicianId } = req.body as { technicianId?: string };
  if (!technicianId) {
    errorResponse(res, 'technicianId required', 'MISSING_FIELD', 400);
    return;
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }

  if (booking.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Only the customer can assign a technician', 'FORBIDDEN', 403);
    return;
  }

  const allowed = VALID_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(BookingStatus.TechnicianRequested)) {
    errorResponse(
      res,
      `Cannot assign technician — booking is ${booking.status}`,
      'INVALID_TRANSITION',
      400
    );
    return;
  }

  const technician = await User.findById(technicianId);
  if (!technician || technician.role !== UserRole.Technician) {
    errorResponse(res, 'Technician not found', 'NOT_FOUND', 404);
    return;
  }

  booking.technicianId = new Types.ObjectId(technicianId);
  booking.status = BookingStatus.TechnicianRequested;
  booking.assignedAt = new Date();
  await booking.save();

  await booking.populate([
    'serviceId',
    { path: 'customerId', select: 'name avatarUrl' },
    { path: 'technicianId', select: 'name avatarUrl phone' },
  ]);

  // Emit to the technician (they see it as a new incoming request).
  socketService.emitNewBookingRequest(technicianId, booking);

  // Emit booking:status to customer too — UI uses this to confirm
  // the assignment actually landed and to show the 2-min waiting state.
  socketService.emitBookingStatus(
    booking.customerId.toString(),
    technicianId,
    booking
  );

  // FCM push to the technician.
  const customerName =
    (booking.customerId as unknown as { name?: string })?.name ?? 'A customer';
  const serviceName =
    (booking.serviceId as unknown as { name?: string })?.name ?? 'a service';
  await fcmService.notifyNewBookingRequest(
    new Types.ObjectId(technicianId),
    booking._id,
    customerName,
    serviceName
  );

  // Schedule the 2-minute auto-reject timer.
  assignmentTimeout.schedule(booking._id.toString());

  successResponse(res, booking, 'Technician requested');
};

/**
 * Customer backs out of the current technician request without
 * cancelling the whole booking. Transitions
 * TechnicianRequested → PendingTechnician so they can pick someone
 * else immediately.
 */
export const cancelAssignment = async (req: Request, res: Response): Promise<void> => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }

  if (booking.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Only the customer can cancel the assignment', 'FORBIDDEN', 403);
    return;
  }

  if (booking.status !== BookingStatus.TechnicianRequested) {
    errorResponse(
      res,
      `Cannot cancel assignment — booking is ${booking.status}`,
      'INVALID_TRANSITION',
      400
    );
    return;
  }

  const previousTechnicianId = booking.technicianId?.toString();
  booking.status = BookingStatus.PendingTechnician;
  booking.technicianId = null;
  booking.assignedAt = null;
  await booking.save();

  // Cancel the pending 2-min timer.
  assignmentTimeout.cancel(booking._id.toString());

  // Tell the previous technician their request was withdrawn.
  if (previousTechnicianId) {
    socketService.emitBookingStatus(
      booking.customerId.toString(),
      previousTechnicianId,
      booking
    );
  }

  successResponse(res, booking, 'Assignment cancelled — pick another technician');
};

/**
 * Returns the customer's currently active booking, if any. Used by
 * the Android home screen to show a "you have a pending request"
 * banner that resumes the flow.
 */
export const getActiveBooking = async (req: Request, res: Response): Promise<void> => {
  const customerId = auth(req).user._id;
  const booking = await Booking.findOne({
    customerId,
    status: { $in: ACTIVE_STATUSES },
  })
    .sort({ createdAt: -1 })
    .populate('serviceId', 'name price durationMinutes')
    .populate('customerId', 'name avatarUrl')
    .populate('technicianId', 'name avatarUrl phone');
  successResponse(res, booking);
};

/**
 * Customer backs out of the current technician request without
 * cancelling the whole booking. Transitions
 * TechnicianRequested → PendingTechnician so they can pick someone
 * else immediately.
 */
export const cancelAssignment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }

  if (booking.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(
      res,
      'Only the customer can cancel the assignment',
      'FORBIDDEN',
      403,
    );
    return;
  }

  if (booking.status !== BookingStatus.TechnicianRequested) {
    errorResponse(
      res,
      `Cannot cancel assignment — booking is ${booking.status}`,
      'INVALID_TRANSITION',
      400,
    );
    return;
  }

  const previousTechnicianId = booking.technicianId?.toString();
  booking.status = BookingStatus.PendingTechnician;
  booking.technicianId = null;
  booking.assignedAt = null;
  await booking.save();

  // Cancel the pending 2-min timer.
  assignmentTimeout.cancel(booking._id.toString());

  // Tell the previous technician their request was withdrawn.
  if (previousTechnicianId) {
    socketService.emitBookingStatus(
      booking.customerId.toString(),
      previousTechnicianId,
      booking,
    );
  }

  successResponse(
    res,
    booking,
    'Assignment cancelled — pick another technician',
  );
};

/**
 * Returns the customer's currently active booking, if any. Used by
 * the Android home screen to show a "you have a pending request"
 * banner that resumes the flow.
 */
export const getActiveBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const customerId = auth(req).user._id;
  const booking = await Booking.findOne({
    customerId,
    status: { $in: ACTIVE_STATUSES },
  })
    .sort({ createdAt: -1 })
    .populate('serviceId', 'name price durationMinutes')
    .populate('customerId', 'name avatarUrl')
    .populate('technicianId', 'name avatarUrl phone');
  successResponse(res, booking);
};

export const getBookings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { status } = req.query as { status?: string };
  const { page, limit, skip } = paginate(req.query);
  const filter: Record<string, unknown> = {};

  if (auth(req).user.role === UserRole.Customer)
    filter.customerId = auth(req).user._id;
  else filter.technicianId = auth(req).user._id;

  if (status) filter.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('serviceId', 'name price durationMinutes')
      .populate('customerId', 'name avatarUrl')
      .populate('technicianId', 'name avatarUrl'),
    Booking.countDocuments(filter),
  ]);
  paginatedResponse(res, bookings, buildPagination(page, limit, total));
};

export const getBookingById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await Booking.findById(req.params.id)
    .populate('serviceId')
    .populate('customerId', 'name avatarUrl phone')
    .populate('technicianId', 'name avatarUrl phone');

  if (!booking) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }

  // technicianId is null for bookings in pending_technician status (no
  // technician picked yet). Only the customer can read the booking in
  // that case. Once a technician is assigned, either party can read.
  const uid = auth(req).user._id.toString();
  const custId = (booking.customerId as unknown as { _id: Types.ObjectId })._id.toString();
  const techId = booking.technicianId
    ? (booking.technicianId as unknown as { _id: Types.ObjectId })._id.toString()
    : null;
  if (uid !== custId && uid !== techId) {
    errorResponse(res, 'Access denied', 'FORBIDDEN', 403);
    return;
  }
  successResponse(res, booking);
};

export const cancelBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await transitionBooking(
    req,
    res,
    BookingStatus.Cancelled,
    UserRole.Customer,
  );
  if (!booking) return;
  successResponse(res, booking, 'Booking cancelled');
};

export const rescheduleBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { scheduledAt } = req.body as { scheduledAt?: string };
  if (!scheduledAt) {
    errorResponse(res, 'scheduledAt required', 'MISSING_FIELD', 400);
    return;
  }

  const existing = await Booking.findById(req.params.id);
  if (!existing) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }
  if (existing.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Only the customer can reschedule', 'FORBIDDEN', 403);
    return;
  }
  if (existing.status !== BookingStatus.Pending) {
    errorResponse(
      res,
      'Can only reschedule pending bookings',
      'INVALID_TRANSITION',
      400,
    );
    return;
  }

  existing.status = BookingStatus.Cancelled;
  await existing.save();

  const newBooking = await Booking.create({
    customerId: existing.customerId,
    technicianId: existing.technicianId,
    serviceId: existing.serviceId,
    addressSnapshot: existing.addressSnapshot,
    scheduledAt: new Date(scheduledAt),
    notes: existing.notes,
    invoice: existing.invoice,
  });

  socketService.emitBookingStatus(
    existing.customerId.toString(),
    existing.technicianId?.toString() ?? '',
    { ...newBooking.toObject(), rescheduled: true }
  );

  successResponse(res, newBooking, 'Booking rescheduled');
};

export const acceptBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await transitionBooking(
    req,
    res,
    BookingStatus.Accepted,
    UserRole.Technician,
  );
  if (!booking) return;
  // Tech responded in time — clear the 2-min auto-reject timer.
  assignmentTimeout.cancel(booking._id.toString());
  await fcmService.notifyBookingAccepted(
    booking.customerId as unknown as Types.ObjectId,
    booking._id as Types.ObjectId,
    auth(req).user.name,
  );
  successResponse(res, booking, 'Booking accepted');
};

/**
 * Technician declines the request. Under the new flow, this does
 * NOT kill the booking — it bounces it back to PendingTechnician so
 * the customer can pick someone else from the same booking record.
 *
 * The legacy hard-reject (status=Rejected, terminal) is preserved
 * only for already-Pending bookings created before the flow change.
 */
export const rejectBooking = async (req: Request, res: Response): Promise<void> => {
  const booking = await Booking.findById(req.params.id)
    .populate<{ customerId: { _id: Types.ObjectId; name: string } }>('customerId', 'name')
    .populate<{ technicianId: { _id: Types.ObjectId; name: string } | null }>('technicianId', 'name');

  if (!booking) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }

  const techId = booking.technicianId?._id.toString();
  if (!techId || techId !== auth(req).user._id.toString()) {
    errorResponse(res, 'Only the assigned technician can reject', 'FORBIDDEN', 403);
    return;
  }

  // Legacy bookings (status === Pending) keep the old terminal reject.
  if (booking.status === BookingStatus.Pending) {
    booking.status = BookingStatus.Rejected;
    if (req.body.reason) booking.rejectionReason = req.body.reason as string;
    await booking.save();
    socketService.emitBookingStatus(
      booking.customerId._id.toString(),
      techId,
      booking
    );
    await fcmService.notifyBookingRejected(
      booking.customerId._id,
      booking._id,
      (req.body as { reason?: string }).reason
    );
    successResponse(res, booking, 'Booking rejected');
    return;
  }

  // New flow: only TechnicianRequested can be rejected back to pool.
  if (booking.status !== BookingStatus.TechnicianRequested) {
    errorResponse(
      res,
      `Cannot reject — booking is ${booking.status}`,
      'INVALID_TRANSITION',
      400
    );
    return;
  }

  const customerId = booking.customerId._id.toString();
  const reason = (req.body as { reason?: string }).reason;

  booking.status = BookingStatus.PendingTechnician;
  booking.technicianId = null;
  booking.assignedAt = null;
  if (reason) booking.rejectionReason = reason;
  await booking.save();

  // Cancel the 2-min timer (tech responded in time, just declined).
  assignmentTimeout.cancel(booking._id.toString());

  // Notify the customer so the bottom sheet closes and they can pick
  // someone else. The technician's UI also gets the update so their
  // incoming-requests list clears.
  socketService.emitBookingStatus(customerId, techId, booking);

  // FCM in case the customer has the app backgrounded.
  await fcmService.notifyBookingRejected(
    booking.customerId._id,
    booking._id,
    reason ?? 'Technician declined — please choose another'
  );

  successResponse(res, booking, 'Request declined — customer can pick another technician');
};

export const startBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await transitionBooking(
    req,
    res,
    BookingStatus.Started,
    UserRole.Technician,
  );
  if (!booking) return;
  await fcmService.notifyBookingStarted(
    booking.customerId as unknown as Types.ObjectId,
    booking._id as Types.ObjectId,
  );
  successResponse(res, booking, 'Job started');
};

export const completeBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await transitionBooking(
    req,
    res,
    BookingStatus.Completed,
    UserRole.Technician,
  );
  if (!booking) return;
  await fcmService.notifyBookingCompleted(
    booking.customerId as unknown as Types.ObjectId,
    booking._id as Types.ObjectId,
  );
  successResponse(res, booking, 'Job completed');
};

export const getInvoice = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await Booking.findById(req.params.id)
    .populate('serviceId', 'name price durationMinutes')
    .populate('customerId', 'name email')
    .populate('technicianId', 'name');

  if (!booking) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }

  const uid = auth(req).user._id.toString();
  const custId = (booking.customerId as unknown as { _id: Types.ObjectId })._id.toString();
  // Same null-safety as getBookingById — pending_technician bookings have
  // no assigned technician yet. (In practice you wouldn't call getInvoice
  // on a pending_technician booking since the invoice is meaningless then,
  // but we guard anyway so the endpoint never 500s.)
  const techId = booking.technicianId
    ? (booking.technicianId as unknown as { _id: Types.ObjectId })._id.toString()
    : null;
  if (uid !== custId && uid !== techId) {
    errorResponse(res, 'Access denied', 'FORBIDDEN', 403);
    return;
  }

  const payment = await Payment.findOne({ bookingId: booking._id });
  successResponse(res, {
    booking: {
      id: booking._id,
      service: booking.serviceId,
      scheduledAt: booking.scheduledAt,
      status: booking.status,
    },
    invoice: booking.invoice,
    payment: payment
      ? {
          status: payment.status,
          method: payment.method,
          gatewayRef: payment.gatewayRef,
        }
      : null,
  });
};

export const getTracking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }
  if (booking.status !== BookingStatus.Started) {
    errorResponse(
      res,
      'Tracking only available when job is started',
      'NOT_ACTIVE',
      400,
    );
    return;
  }
  const profile = await TechnicianProfile.findOne({
    userId: booking.technicianId,
  });
  successResponse(res, {
    bookingId: booking._id,
    location: booking.trackingLocation,
    technicianLocation: profile
      ? {
          lat: profile.currentLocation.coordinates[1],
          lng: profile.currentLocation.coordinates[0],
        }
      : null,
  });
};

export const reportBooking = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { reason } = req.body as { reason?: string };
  if (!reason) {
    errorResponse(res, 'Reason required', 'MISSING_FIELD', 400);
    return;
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    errorResponse(res, 'Booking not found', 'NOT_FOUND', 404);
    return;
  }
  if (booking.customerId.toString() !== auth(req).user._id.toString()) {
    errorResponse(res, 'Only customer can report', 'FORBIDDEN', 403);
    return;
  }
  booking.reportedAt = new Date();
  booking.reportReason = reason;
  await booking.save();
  successResponse(res, null, 'Report submitted');
};

export const getTechnicianDashboard = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const techId = auth(req).user._id;
  const [pending, active, completed, earnings] = await Promise.all([
    Booking.countDocuments({
      technicianId: techId,
      status: BookingStatus.Pending,
    }),
    Booking.countDocuments({
      technicianId: techId,
      status: { $in: [BookingStatus.Accepted, BookingStatus.Started] },
    }),
    Booking.countDocuments({
      technicianId: techId,
      status: BookingStatus.Completed,
    }),
    Payment.aggregate([
      { $match: { status: 'success' } },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking',
        },
      },
      { $unwind: '$booking' },
      { $match: { 'booking.technicianId': techId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  successResponse(res, {
    pendingRequests: pending,
    activeJobs: active,
    completedJobs: completed,
    totalEarnings: (earnings[0] as { total?: number } | undefined)?.total ?? 0,
  });
};

export const getTechnicianRequests = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {
    technicianId: auth(req).user._id,
    status: BookingStatus.Pending,
  };
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('serviceId', 'name price')
      .populate('customerId', 'name avatarUrl phone'),
    Booking.countDocuments(filter),
  ]);
  paginatedResponse(res, bookings, buildPagination(page, limit, total));
};

export const getTechnicianJobs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { status } = req.query as { status?: string };
  const { page, limit, skip } = paginate(req.query);
  const filter: Record<string, unknown> = { technicianId: auth(req).user._id };
  if (status) filter.status = status;
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('serviceId', 'name price')
      .populate('customerId', 'name avatarUrl'),
    Booking.countDocuments(filter),
  ]);
  paginatedResponse(res, bookings, buildPagination(page, limit, total));
};

export const toggleTechnicianStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { isOnline } = req.body as { isOnline?: boolean };
  const profile = await TechnicianProfile.findOneAndUpdate(
    { userId: auth(req).user._id },
    { isOnline },
    { new: true, upsert: true },
  );
  socketService.emitTechnicianPresence(
    auth(req).user._id.toString(),
    isOnline ?? false,
  );
  successResponse(res, { isOnline: profile?.isOnline }, 'Status updated');
};

export const updateTechnicianLocation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (lat === undefined || lng === undefined) {
    errorResponse(res, 'lat and lng required', 'MISSING_FIELDS', 400);
    return;
  }
  await TechnicianProfile.findOneAndUpdate(
    { userId: auth(req).user._id },
    { currentLocation: { type: 'Point', coordinates: [lng, lat] } },
    { upsert: true },
  );
  const activeBooking = await Booking.findOne({
    technicianId: auth(req).user._id,
    status: BookingStatus.Started,
  });
  if (activeBooking) {
    activeBooking.trackingLocation = { lat, lng };
    await activeBooking.save();
    socketService.emitBookingLocation(
      activeBooking._id.toString(),
      activeBooking.customerId.toString(),
      { lat, lng },
    );
  }
  successResponse(res, { lat, lng }, 'Location updated');
};

export const updateTechnicianProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { bio, skills, experienceYears, technicianType } = req.body as {
    bio?: string;
    skills?: string[];
    experienceYears?: number;
    technicianType?: string;
  };

  if (
    technicianType &&
    !Object.values(TechnicianType).includes(technicianType as TechnicianType)
  ) {
    errorResponse(
      res,
      `Invalid technicianType. Valid: ${Object.values(TechnicianType).join(', ')}`,
      'INVALID_TYPE',
      400,
    );
    return;
  }

  const update: Record<string, unknown> = {};
  if (bio !== undefined) update.bio = bio;
  if (skills !== undefined) update.skills = skills;
  if (experienceYears !== undefined) update.experienceYears = experienceYears;
  if (technicianType !== undefined) update.technicianType = technicianType;

  const profile = await TechnicianProfile.findOneAndUpdate(
    { userId: auth(req).user._id },
    update,
    { new: true, upsert: true },
  );
  successResponse(res, profile, 'Profile updated');
};

export const uploadTechnicianDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.file) {
    errorResponse(res, 'No file uploaded', 'NO_FILE', 400);
    return;
  }
  const { type = 'other' } = req.body as { type?: string };

  const profile = await TechnicianProfile.findOneAndUpdate(
    { userId: auth(req).user._id },
    {
      $push: {
        documents: {
          type,
          url: (req.file as Express.Multer.File & { path: string }).path,
          publicId: (req.file as Express.Multer.File & { filename: string })
            .filename,
        },
      },
    },
    { new: true, upsert: true },
  );
  successResponse(res, profile?.documents, 'Document uploaded', 201);
};
