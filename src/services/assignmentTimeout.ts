import { Types } from 'mongoose';
import Booking from '../models/Booking';
import { BookingStatus } from '../types';
import * as socketService from './socket';
import * as fcmService from './fcm';

/**
 * Manages the 2-minute "technician must respond" timer for each
 * outstanding `technician_requested` booking.
 *
 * Lifecycle:
 *   1. Customer hits POST /bookings/:id/assign-technician
 *      → controller calls schedule(bookingId) here
 *   2a. Technician accepts within 2 min → controller calls cancel(bookingId)
 *   2b. Technician rejects within 2 min → controller calls cancel(bookingId)
 *   2c. 2 minutes elapse with no response → this module:
 *       - reverts the booking to pending_technician
 *       - clears technicianId / assignedAt
 *       - notifies the customer via socket + FCM
 *       - notifies the technician (so their incoming-requests list clears)
 *
 * This is in-memory only. If the server restarts, in-flight timers are
 * lost. The reconcile() function recovers from this on startup by
 * scanning for any stale technician_requested bookings.
 */

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per spec.

const handles = new Map<string, NodeJS.Timeout>();

/** Schedule the auto-reject timer for a freshly assigned booking. */
export const schedule = (bookingId: string): void => {
  cancel(bookingId); // defensive: clear any previous handle
  const handle = setTimeout(() => {
    void expire(bookingId);
  }, REQUEST_TIMEOUT_MS);
  handles.set(bookingId, handle);
};

/** Cancel a pending timer (call on accept/reject/cancel-assignment). */
export const cancel = (bookingId: string): void => {
  const existing = handles.get(bookingId);
  if (existing) {
    clearTimeout(existing);
    handles.delete(bookingId);
  }
};

/**
 * Fires when the 2-minute window elapses without a response.
 * Reverts the booking to PendingTechnician so the customer can
 * pick someone else.
 */
const expire = async (bookingId: string): Promise<void> => {
  handles.delete(bookingId);
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return;
    // Only revert if still in technician_requested — accept/reject
    // races may have transitioned us out already.
    if (booking.status !== BookingStatus.TechnicianRequested) return;

    const technicianId = booking.technicianId?.toString();
    booking.status = BookingStatus.PendingTechnician;
    booking.technicianId = null;
    booking.assignedAt = null;
    await booking.save();

    // Notify both sides over socket so their UIs update immediately.
    if (technicianId) {
      socketService.emitBookingStatus(
        booking.customerId.toString(),
        technicianId,
        booking
      );
    } else {
      // Edge case: emit only to customer.
      socketService.emitNotification(
        booking.customerId.toString(),
        { type: 'booking:status', booking }
      );
    }

    // FCM ping to the customer in case the app is backgrounded.
    await fcmService.notifyBookingRejected(
      booking.customerId,
      booking._id,
      'Technician did not respond — please choose another.'
    );
  } catch (err) {
    console.error('[assignmentTimeout] expire failed', err);
  }
};

/**
 * Recovery pass on server boot. Scans for any technician_requested
 * bookings whose assignedAt is older than the timeout window and
 * expires them. Should be called once from server.ts on startup.
 */
export const reconcileOnBoot = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - REQUEST_TIMEOUT_MS);
  const stale = await Booking.find({
    status: BookingStatus.TechnicianRequested,
    assignedAt: { $lte: cutoff },
  });
  for (const booking of stale) {
    await expire(booking._id.toString());
  }
  // For non-stale ones, schedule remaining time.
  const fresh = await Booking.find({
    status: BookingStatus.TechnicianRequested,
    assignedAt: { $gt: cutoff },
  });
  for (const booking of fresh) {
    if (!booking.assignedAt) continue;
    const elapsed = Date.now() - booking.assignedAt.getTime();
    const remaining = REQUEST_TIMEOUT_MS - elapsed;
    const handle = setTimeout(() => {
      void expire(booking._id.toString());
    }, Math.max(0, remaining));
    handles.set(booking._id.toString(), handle);
  }
  if (stale.length || fresh.length) {
    console.log(
      `[assignmentTimeout] reconciled on boot: expired=${stale.length}, rescheduled=${fresh.length}`
    );
  }
};
