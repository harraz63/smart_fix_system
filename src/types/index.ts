import { Request } from 'express';
import { Document, Types } from 'mongoose';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum UserRole {
  Customer = 'customer',
  Technician = 'technician',
}

export enum TechnicianType {
  Painting     = 'painting',
  Carpentry    = 'carpentry',
  Conditioning = 'conditioning',
  Electricity  = 'electricity',
  Plumbing     = 'plumbing',
}

export enum BookingStatus {
  Pending   = 'pending',
  Accepted  = 'accepted',
  Rejected  = 'rejected',
  Started   = 'started',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum MessageType {
  Text  = 'text',
  Image = 'image',
  File  = 'file',
}

export enum PaymentStatus {
  Pending = 'pending',
  Success = 'success',
  Failed  = 'failed',
}

export enum DocumentType {
  Identity      = 'identity',
  Certification = 'certification',
  Other         = 'other',
}

// ─── Sub-document interfaces ──────────────────────────────────────────────────

export interface IAddress {
  _id?: Types.ObjectId;
  label: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface IPrivacySettings {
  showPhone: boolean;
  showEmail: boolean;
  showOnlineStatus: boolean;
}

export interface INotificationSettings {
  bookingUpdates: boolean;
  chatMessages: boolean;
  promotions: boolean;
}

export interface ITechnicianDocument {
  type: DocumentType;
  url: string;
  publicId?: string;
}

export interface IInvoiceBreakdown {
  label: string;
  amount: number;
}

export interface IInvoice {
  amount: number;
  breakdown: IInvoiceBreakdown[];
}

export interface ITrackingLocation {
  lat: number | null;
  lng: number | null;
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

// ─── Document interfaces ──────────────────────────────────────────────────────

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  username?: string;
  dob?: Date;
  gender?: 'male' | 'female' | 'other' | null;
  language: 'en' | 'ar';
  theme: 'light' | 'dark';
  addresses: Types.DocumentArray<IAddress & Document>;
  fcmToken: string | null;
  privacySettings: IPrivacySettings;
  notificationSettings: INotificationSettings;
  isActive: boolean;
  isVerified: boolean;
  refreshToken: string | null;
  otpCode?: string | null;
  otpExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
  toPublicJSON(): Partial<IUser>;
}

export interface ITechnicianProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  technicianType: TechnicianType;
  bio: string;
  skills: string[];
  experienceYears: number;
  documents: ITechnicianDocument[];
  isOnline: boolean;
  currentLocation: IGeoPoint;
  rating: number;
  totalReviews: number;
  totalEarnings: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  technicianType: TechnicianType;
  icon: string;
  description: string;
  isActive: boolean;
}

export interface IService extends Document {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface IBooking extends Document {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  serviceId: Types.ObjectId;
  addressSnapshot: Partial<IAddress>;
  scheduledAt: Date;
  notes: string;
  status: BookingStatus;
  rejectionReason: string | null;
  invoice: IInvoice;
  trackingLocation: ITrackingLocation;
  reportedAt: Date | null;
  reportReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  senderId: Types.ObjectId;
  type: MessageType;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  body: string;
  type: string;
  refId: Types.ObjectId | null;
  isRead: boolean;
  createdAt: Date;
}

export interface IReview extends Document {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  customerId: Types.ObjectId;
  technicianId: Types.ObjectId;
  rating: number;
  comment: string;
  editWindowExpires: Date;
  createdAt: Date;
}

export interface IPayment extends Document {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  customerId: Types.ObjectId;
  amount: number;
  currency: string;
  method: string;
  status: PaymentStatus;
  gatewayRef: string | null;
  createdAt: Date;
}

// ─── Express Request extensions ───────────────────────────────────────────────

export interface AuthRequest extends Request {
  user: IUser;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
  fields?: { field: string; message: string }[];
}

export interface ApiPaginated<T = unknown> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ─── Socket types ─────────────────────────────────────────────────────────────

export interface SocketUser {
  userId: string;
  userRole: UserRole;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
