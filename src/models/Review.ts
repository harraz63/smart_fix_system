import mongoose, { Schema, Model } from 'mongoose';
import { IReview } from '../types';

const reviewSchema = new Schema<IReview>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    editWindowExpires: { type: Date, required: true },
  },
  { timestamps: true }
);

reviewSchema.index({ technicianId: 1, createdAt: -1 });

const Review: Model<IReview> = mongoose.model<IReview>('Review', reviewSchema);
export default Review;
