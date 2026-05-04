import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Message from '../models/Message';
import Booking from '../models/Booking';
import { AuthRequest, IBooking, MessageType } from '../types';
import { successResponse, errorResponse, paginatedResponse } from '../utils/responseHelper';
import { paginate, buildPagination } from '../utils/pagination';
import { emitNewMessage, emitMessageRead } from '../services/socket';
import { notifyNewMessage } from '../services/fcm';

const auth = (req: Request): AuthRequest => req as AuthRequest;

const checkBookingAccess = async (
  bookingId: string,
  userId: string
): Promise<IBooking | null | false> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return null;
  const isParticipant =
    booking.customerId.toString() === userId ||
    booking.technicianId.toString() === userId;
  return isParticipant ? (booking as unknown as IBooking) : false;
};

export const getChats = async (req: Request, res: Response): Promise<void> => {
  const userId = auth(req).user._id;
  const bookings = await Booking.find({
    $or: [{ customerId: userId }, { technicianId: userId }],
  })
    .select('_id customerId technicianId serviceId status updatedAt')
    .populate('serviceId', 'name')
    .populate('customerId', 'name avatarUrl')
    .populate('technicianId', 'name avatarUrl')
    .sort({ updatedAt: -1 });

  const chats = await Promise.all(
    bookings.map(async (b) => {
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne({ bookingId: b._id }).sort({ createdAt: -1 }),
        Message.countDocuments({ bookingId: b._id, senderId: { $ne: userId }, isRead: false }),
      ]);
      return { booking: b, lastMessage, unreadCount };
    })
  );
  successResponse(res, chats);
};

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  const { bookingId } = req.params;
  const { page, limit, skip } = paginate(req.query);

  const booking = await checkBookingAccess(bookingId, auth(req).user._id.toString());
  if (booking === null) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }
  if (booking === false) { errorResponse(res, 'Access denied', 'FORBIDDEN', 403); return; }

  const [messages, total] = await Promise.all([
    Message.find({ bookingId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'name avatarUrl'),
    Message.countDocuments({ bookingId }),
  ]);
  paginatedResponse(res, messages, buildPagination(page, limit, total));
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const { bookingId } = req.params;
  const { content } = req.body as { content?: string };
  if (!content) { errorResponse(res, 'content required', 'MISSING_FIELD', 400); return; }

  const booking = await checkBookingAccess(bookingId, auth(req).user._id.toString());
  if (booking === null) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }
  if (booking === false) { errorResponse(res, 'Access denied', 'FORBIDDEN', 403); return; }

  const message = await Message.create({
    bookingId,
    senderId: auth(req).user._id,
    type: MessageType.Text,
    content,
  });
  await message.populate('senderId', 'name avatarUrl');
  emitNewMessage(bookingId, message);

  const recipientId =
    booking.customerId.toString() === auth(req).user._id.toString()
      ? booking.technicianId as Types.ObjectId
      : booking.customerId as Types.ObjectId;

  await notifyNewMessage(recipientId, booking._id as Types.ObjectId, auth(req).user.name);
  successResponse(res, message, 'Message sent', 201);
};

export const sendAttachment = async (req: Request, res: Response): Promise<void> => {
  const { bookingId } = req.params;
  if (!req.file) { errorResponse(res, 'No file uploaded', 'NO_FILE', 400); return; }

  const booking = await checkBookingAccess(bookingId, auth(req).user._id.toString());
  if (booking === null) { errorResponse(res, 'Booking not found', 'NOT_FOUND', 404); return; }
  if (booking === false) { errorResponse(res, 'Access denied', 'FORBIDDEN', 403); return; }

  const isImage = req.file.mimetype?.startsWith('image/');
  const message = await Message.create({
    bookingId,
    senderId: auth(req).user._id,
    type: isImage ? MessageType.Image : MessageType.File,
    content: (req.file as Express.Multer.File & { path: string }).path,
  });
  await message.populate('senderId', 'name avatarUrl');
  emitNewMessage(bookingId, message);

  const recipientId =
    booking.customerId.toString() === auth(req).user._id.toString()
      ? booking.technicianId as Types.ObjectId
      : booking.customerId as Types.ObjectId;

  await notifyNewMessage(recipientId, booking._id as Types.ObjectId, auth(req).user.name);
  successResponse(res, message, 'Attachment sent', 201);
};

export const markMessageRead = async (req: Request, res: Response): Promise<void> => {
  const { bookingId, id } = req.params;
  const booking = await checkBookingAccess(bookingId, auth(req).user._id.toString());
  if (!booking) { errorResponse(res, 'Access denied', 'FORBIDDEN', 403); return; }

  const message = await Message.findOneAndUpdate(
    { _id: id, bookingId },
    { isRead: true },
    { new: true }
  );
  if (!message) { errorResponse(res, 'Message not found', 'NOT_FOUND', 404); return; }

  emitMessageRead(bookingId, id, auth(req).user._id.toString());
  successResponse(res, message, 'Message marked as read');
};
