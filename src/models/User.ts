import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, UserRole } from '../types';

const addressSchema = new Schema(
  {
    label: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), required: true },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    username: { type: String, trim: true, sparse: true },
    dob: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', null], default: null },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    addresses: { type: [addressSchema], default: [] },
    fcmToken: { type: String, default: null },
    privacySettings: {
      showPhone: { type: Boolean, default: true },
      showEmail: { type: Boolean, default: false },
      showOnlineStatus: { type: Boolean, default: true },
    },
    notificationSettings: {
      bookingUpdates: { type: Boolean, default: true },
      chatMessages: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    refreshToken: { type: String, default: null },
    otpCode: { type: String, default: null },
    otpExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash as string);
};

userSchema.methods.toPublicJSON = function (): Partial<IUser> {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshToken;
  delete obj.otpCode;
  delete obj.otpExpires;
  return obj;
};

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
