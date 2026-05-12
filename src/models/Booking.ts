import mongoose, { Schema, Model } from 'mongoose';
import { IBooking, BookingStatus } from '../types';

const bookingSchema = new Schema<IBooking>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    addressSnapshot: {
      label: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
    scheduledAt: { type: Date, required: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PendingTechnician,
    },
    rejectionReason: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    invoice: {
      amount: { type: Number, default: 0 },
      breakdown: [{ label: String, amount: Number }],
    },
    trackingLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    reportedAt: { type: Date, default: null },
    reportReason: { type: String, default: null },
  },
  { timestamps: true }
);

bookingSchema.index({ customerId: 1, status: 1 });
bookingSchema.index({ technicianId: 1, status: 1 });

const Booking: Model<IBooking> = mongoose.model<IBooking>('Booking', bookingSchema);
export default Booking;
