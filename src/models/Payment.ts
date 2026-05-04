import mongoose, { Schema, Model } from 'mongoose';
import { IPayment, PaymentStatus } from '../types';

const paymentSchema = new Schema<IPayment>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    method: { type: String, default: 'card' },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.Pending,
    },
    gatewayRef: { type: String, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ customerId: 1, createdAt: -1 });

const Payment: Model<IPayment> = mongoose.model<IPayment>('Payment', paymentSchema);
export default Payment;
