import mongoose, { Schema, Model } from 'mongoose';
import { ICategory, TechnicianType } from '../types';

const categorySchema = new Schema<ICategory>(
  {
    name:           { type: String, required: true, trim: true },
    technicianType: { type: String, enum: Object.values(TechnicianType), required: true },
    icon:           { type: String, default: '🔧' },
    description:    { type: String, default: '' },
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.index({ technicianType: 1 });

const Category: Model<ICategory> = mongoose.model<ICategory>('Category', categorySchema);
export default Category;
