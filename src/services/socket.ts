import { Server } from 'socket.io';

let io: Server | null = null;

export const init = (socketIo: Server): void => {
  io = socketIo;
};

export const getIo = (): Server | null => io;

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const emitNewMessage = (bookingId: string, message: unknown): void => {
  if (!io) return;
  io.to(`booking:${bookingId}`).emit('message:receive', message);
};

export const emitMessageRead = (bookingId: string, messageId: string, readerId: string): void => {
  if (!io) return;
  io.to(`booking:${bookingId}`).emit('message:read', { messageId, readerId });
};

// ─── Booking ──────────────────────────────────────────────────────────────────

export const emitNewBookingRequest = (technicianUserId: string, booking: unknown): void => {
  if (!io) return;
  io.to(`user:${technicianUserId}`).emit('booking:new-request', booking);
};

export const emitBookingStatus = (
  customerId: string,
  technicianUserId: string,
  booking: unknown
): void => {
  if (!io) return;
  io.to(`user:${customerId}`).emit('booking:status', booking);
  io.to(`user:${technicianUserId}`).emit('booking:status', booking);
};

export const emitBookingLocation = (
  bookingId: string,
  customerId: string,
  location: { lat: number; lng: number }
): void => {
  if (!io) return;
  io.to(`booking:${bookingId}`).emit('booking:location', location);
  io.to(`user:${customerId}`).emit('booking:location', { bookingId, ...location });
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const emitNotification = (userId: string, notification: unknown): void => {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification:new', notification);
};

// ─── Presence ─────────────────────────────────────────────────────────────────

export const emitTechnicianPresence = (technicianUserId: string, isOnline: boolean): void => {
  if (!io) return;
  io.emit('technician:online', { technicianUserId, isOnline });
};

// ─── Payment ──────────────────────────────────────────────────────────────────

export const emitPaymentConfirmed = (
  customerId: string,
  technicianUserId: string,
  paymentData: unknown
): void => {
  if (!io) return;
  io.to(`user:${customerId}`).emit('payment:confirmed', paymentData);
  io.to(`user:${technicianUserId}`).emit('payment:confirmed', paymentData);
};
