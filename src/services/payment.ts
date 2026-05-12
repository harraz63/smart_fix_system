import { Types } from 'mongoose';
import stripe from '../config/stripe';
import Payment from '../models/Payment';
import Booking from '../models/Booking';
import { IBooking, IService, PaymentStatus } from '../types';
import { emitPaymentConfirmed } from './socket';
import { notifyPaymentConfirmed } from './fcm';

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export const createPaymentIntent = async (booking: IBooking, service: IService) => {
  const amount = Math.round(service.price * 100);
  const currency = 'usd';
  let gatewayRef = `demo_${Date.now()}`;

  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata: { bookingId: booking._id.toString() },
      });
      gatewayRef = intent.id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Stripe error:', message);
    }
  }

  const payment = await Payment.create({
    bookingId: booking._id,
    customerId: booking.customerId,
    amount: service.price,
    currency,
    method: 'card',
    status: PaymentStatus.Pending,
    gatewayRef,
  });

  return payment;
};

export const confirmPayment = async (paymentId: Types.ObjectId) => {
  const payment = await Payment.findById(paymentId).populate<{ bookingId: IBooking }>('bookingId');
  if (!payment) {
    const err = new Error('Payment not found') as Error & { status: number; code: string };
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  payment.status = PaymentStatus.Success;
  await payment.save();

  const booking = payment.bookingId as IBooking;
  if (booking) {
    emitPaymentConfirmed(
      booking.customerId.toString(),
      booking.technicianId?.toString() ?? '',
      { paymentId, bookingId: booking._id, amount: payment.amount, status: 'success' }
    );
    await notifyPaymentConfirmed(
      booking.customerId as Types.ObjectId,
      booking._id as Types.ObjectId,
      payment.amount
    );
  }

  return payment;
};

export const getPaymentMethods = (): PaymentMethod[] => [
  { id: 'card_test_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2025 },
  { id: 'card_test_2', brand: 'mastercard', last4: '5555', expMonth: 8, expYear: 2026 },
];
