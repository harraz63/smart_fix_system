import mongoose, { Schema, Model } from 'mongoose';
import { ITechnicianProfile, TechnicianType, DocumentType } from '../types';

const technicianProfileSchema = new Schema<ITechnicianProfile>(
  {
    userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    technicianType: {
      type:     String,
      enum:     Object.values(TechnicianType),
      required: true,
      default:  TechnicianType.Plumbing,
    },
    bio:            { type: String, default: '' },
    skills:         [{ type: String }],
    experienceYears:{ type: Number, default: 0 },
    documents: [
      {
        type:      { type: String, enum: Object.values(DocumentType), required: true },
        url:       { type: String, required: true },
        publicId:  { type: String },
      },
    ],
    isOnline: { type: Boolean, default: false },
    currentLocation: {
      type:        { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    rating:        { type: Number, default: 0 },
    totalReviews:  { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

technicianProfileSchema.index({ currentLocation: '2dsphere' });
technicianProfileSchema.index({ technicianType: 1 });
technicianProfileSchema.index({ rating: -1 });

const TechnicianProfile: Model<ITechnicianProfile> = mongoose.model<ITechnicianProfile>(
  'TechnicianProfile',
  technicianProfileSchema
);
export default TechnicianProfile;
