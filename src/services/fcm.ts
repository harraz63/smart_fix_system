import { Types } from 'mongoose';
import admin from '../config/firebase';
import Notification from '../models/Notification';
import User from '../models/User';
import { emitNotification } from './socket';

const sendPush = async (userId: Types.ObjectId, title: string, body: string, data: Record<string, string> = {}): Promise<void> => {
  try {
    if (!admin.apps.length) return;
    const user = await User.findById(userId).select('fcmToken');
    if (!user?.fcmToken) return;

    await admin.messaging().send({
      notification: { title, body },
      data,
      token: user.fcmToken,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('FCM send error:', message);
  }
};

const createAndEmitNotification = async (
  userId: Types.ObjectId,
  title: string,
  body: string,
  type: string,
  refId?: Types.ObjectId
): Promise<void> => {
  const notif = await Notification.create({
    userId,
    title,
    body,
    type,
    refId: refId ?? null,
  });
  emitNotification(userId.toString(), notif);
};

export const notifyNewBookingRequest = async (
  technicianUserId: Types.ObjectId,
  bookingId: Types.ObjectId,
  customerName: string,
  serviceName: string
): Promise<void> => {
  const title = 'New Booking Request';
  const body = `${customerName} requested ${serviceName}`;
  await createAndEmitNotification(technicianUserId, title, body, 'booking_request', bookingId);
  await sendPush(technicianUserId, title, body, { bookingId: bookingId.toString(), type: 'booking_request' });
};

export const notifyBookingAccepted = async (
  customerId: Types.ObjectId,
  bookingId: Types.ObjectId,
  technicianName: string
): Promise<void> => {
  const title = 'Booking Accepted';
  const body = `${technicianName} accepted your booking`;
  await createAndEmitNotification(customerId, title, body, 'booking_accepted', bookingId);
  await sendPush(customerId, title, body, { bookingId: bookingId.toString(), type: 'booking_accepted' });
};

export const notifyBookingRejected = async (
  customerId: Types.ObjectId,
  bookingId: Types.ObjectId,
  reason?: string
): Promise<void> => {
  const title = 'Booking Rejected';
  const body = reason ? `Booking rejected: ${reason}` : 'Your booking was rejected';
  await createAndEmitNotification(customerId, title, body, 'booking_rejected', bookingId);
  await sendPush(customerId, title, body, { bookingId: bookingId.toString(), type: 'booking_rejected' });
};

export const notifyBookingStarted = async (
  customerId: Types.ObjectId,
  bookingId: Types.ObjectId
): Promise<void> => {
  const title = 'Technician On the Way';
  const body = 'Your technician has started the job';
  await createAndEmitNotification(customerId, title, body, 'booking_started', bookingId);
  await sendPush(customerId, title, body, { bookingId: bookingId.toString(), type: 'booking_started' });
};

export const notifyBookingCompleted = async (
  customerId: Types.ObjectId,
  bookingId: Types.ObjectId
): Promise<void> => {
  const title = 'Job Completed';
  const body = 'Your booking has been marked complete';
  await createAndEmitNotification(customerId, title, body, 'booking_completed', bookingId);
  await sendPush(customerId, title, body, { bookingId: bookingId.toString(), type: 'booking_completed' });
};

export const notifyNewMessage = async (
  recipientId: Types.ObjectId,
  bookingId: Types.ObjectId,
  senderName: string
): Promise<void> => {
  const title = 'New Message';
  const body = `${senderName} sent you a message`;
  await createAndEmitNotification(recipientId, title, body, 'chat_message', bookingId);
  await sendPush(recipientId, title, body, { bookingId: bookingId.toString(), type: 'chat_message' });
};

export const notifyPaymentConfirmed = async (
  customerId: Types.ObjectId,
  bookingId: Types.ObjectId,
  amount: number
): Promise<void> => {
  const title = 'Payment Confirmed';
  const body = `Payment of $${amount} confirmed`;
  await createAndEmitNotification(customerId, title, body, 'payment_confirmed', bookingId);
  await sendPush(customerId, title, body, { bookingId: bookingId.toString(), type: 'payment_confirmed' });
};
