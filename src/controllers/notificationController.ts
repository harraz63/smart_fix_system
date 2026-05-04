import { Request, Response } from 'express';
import Notification from '../models/Notification';
import User from '../models/User';
import { AuthRequest } from '../types';
import { successResponse, errorResponse, paginatedResponse } from '../utils/responseHelper';
import { paginate, buildPagination } from '../utils/pagination';

const auth = (req: Request): AuthRequest => req as AuthRequest;

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { userId: auth(req).user._id };
  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);
  paginatedResponse(res, notifications, buildPagination(page, limit, total));
};

export const markRead = async (req: Request, res: Response): Promise<void> => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: auth(req).user._id },
    { isRead: true },
    { new: true }
  );
  if (!notif) { errorResponse(res, 'Notification not found', 'NOT_FOUND', 404); return; }
  successResponse(res, notif);
};

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  await Notification.updateMany({ userId: auth(req).user._id, isRead: false }, { isRead: true });
  successResponse(res, null, 'All notifications marked as read');
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  const notif = await Notification.findOneAndDelete({
    _id: req.params.id,
    userId: auth(req).user._id,
  });
  if (!notif) { errorResponse(res, 'Notification not found', 'NOT_FOUND', 404); return; }
  successResponse(res, null, 'Notification deleted');
};

export const registerPushToken = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token) { errorResponse(res, 'token required', 'MISSING_FIELD', 400); return; }
  await User.findByIdAndUpdate(auth(req).user._id, { fcmToken: token });
  successResponse(res, null, 'Push token registered');
};

export const unregisterPushToken = async (req: Request, res: Response): Promise<void> => {
  await User.findByIdAndUpdate(auth(req).user._id, { fcmToken: null });
  successResponse(res, null, 'Push token unregistered');
};

export const getNotificationSettings = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(auth(req).user._id).select('notificationSettings');
  successResponse(res, user?.notificationSettings);
};

export const updateNotificationSettings = async (req: Request, res: Response): Promise<void> => {
  const { bookingUpdates, chatMessages, promotions } = req.body as {
    bookingUpdates?: boolean; chatMessages?: boolean; promotions?: boolean;
  };
  const update: Record<string, unknown> = {};
  if (bookingUpdates !== undefined) update['notificationSettings.bookingUpdates'] = bookingUpdates;
  if (chatMessages !== undefined) update['notificationSettings.chatMessages'] = chatMessages;
  if (promotions !== undefined) update['notificationSettings.promotions'] = promotions;
  const user = await User.findByIdAndUpdate(auth(req).user._id, update, { new: true })
    .select('notificationSettings');
  successResponse(res, user?.notificationSettings, 'Settings updated');
};
