import mongoose, { Schema, Model } from 'mongoose';
import { IService } from '../types';

const serviceSchema = new Schema<IService>(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Service: Model<IService> = mongoose.model<IService>('Service', serviceSchema);
export default Service;
