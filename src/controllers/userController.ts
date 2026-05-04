import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import cloudinary from '../config/cloudinary';
import User from '../models/User';
import { AuthRequest } from '../types';
import { successResponse, errorResponse } from '../utils/responseHelper';
import { emitter } from '../utils/emailHelper';

const auth = (req: Request): AuthRequest => req as AuthRequest;

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(auth(req).user._id)
    .select('-passwordHash -refreshToken -otpCode -otpExpires');
  successResponse(res, user);
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const { name, username, dob, gender, phone } = req.body as {
    name?: string; username?: string; dob?: string; gender?: string; phone?: string;
  };
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (username !== undefined) update.username = username;
  if (dob !== undefined) update.dob = dob;
  if (gender !== undefined) update.gender = gender;
  if (phone !== undefined) update.phone = phone;

  const user = await User.findByIdAndUpdate(auth(req).user._id, update, {
    new: true, runValidators: true,
  }).select('-passwordHash -refreshToken -otpCode -otpExpires');
  successResponse(res, user, 'Profile updated');
};

export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { errorResponse(res, 'No file uploaded', 'NO_FILE', 400); return; }

  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }

  if (user.avatarPublicId) {
    try { await cloudinary.uploader.destroy(user.avatarPublicId); } catch { /* ignore */ }
  }
  user.avatarUrl = (req.file as Express.Multer.File & { path: string }).path;
  user.avatarPublicId = (req.file as Express.Multer.File & { filename: string }).filename;
  await user.save();

  successResponse(res, { avatarUrl: user.avatarUrl }, 'Avatar uploaded');
};

export const deleteAvatar = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  if (user.avatarPublicId) {
    try { await cloudinary.uploader.destroy(user.avatarPublicId); } catch { /* ignore */ }
  }
  user.avatarUrl = null;
  user.avatarPublicId = null;
  await user.save();
  successResponse(res, null, 'Avatar removed');
};

export const getQrCode = async (req: Request, res: Response): Promise<void> => {
  const profileUrl = `${process.env.FRONTEND_URL}/profile/${auth(req).user._id}`;
  const qrCode = await QRCode.toDataURL(profileUrl);
  successResponse(res, { qrCode, profileUrl });
};

export const getShareLink = async (req: Request, res: Response): Promise<void> => {
  const link = `${process.env.FRONTEND_URL}/profile/${auth(req).user._id}?ref=${auth(req).user._id}`;
  successResponse(res, { shareLink: link });
};

export const getInviteLink = async (req: Request, res: Response): Promise<void> => {
  const link = `${process.env.FRONTEND_URL}/invite?ref=${auth(req).user._id}`;
  successResponse(res, { inviteLink: link });
};

export const verifyPassword = async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (!password) { errorResponse(res, 'Password required', 'MISSING_FIELD', 400); return; }

  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  const match = await user.comparePassword(password);
  if (!match) { errorResponse(res, 'Incorrect password', 'WRONG_PASSWORD', 401); return; }
  successResponse(res, { verified: true }, 'Password verified');
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string; newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    errorResponse(res, 'Both passwords required', 'MISSING_FIELDS', 400);
    return;
  }

  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  const match = await user.comparePassword(currentPassword);
  if (!match) { errorResponse(res, 'Current password incorrect', 'WRONG_PASSWORD', 401); return; }

  const salt = await bcrypt.genSalt(12);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  await user.save();

  emitter.emit('sendEmail', {
    to: user.email,
    subject: 'Password changed for SmartFix',
    content: 'Your password has been changed',
  });

  successResponse(res, null, 'Password changed');
};

export const getAddresses = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(auth(req).user._id).select('addresses');
  successResponse(res, user?.addresses ?? []);
};

export const addAddress = async (req: Request, res: Response): Promise<void> => {
  const { label, lat, lng } = req.body as { label?: string; lat?: number; lng?: number };
  if (!label || lat === undefined || lng === undefined) {
    errorResponse(res, 'label, lat and lng required', 'MISSING_FIELDS', 400);
    return;
  }
  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  user.addresses.push({
    label, lat, lng,
    isDefault: user.addresses.length === 0,
  } as never);
  await user.save();
  successResponse(res, user.addresses, 'Address added', 201);
};

export const updateAddress = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { label, lat, lng } = req.body as { label?: string; lat?: number; lng?: number };
  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  const addr = user.addresses.id(id);
  if (!addr) { errorResponse(res, 'Address not found', 'NOT_FOUND', 404); return; }
  if (label !== undefined) addr.label = label;
  if (lat !== undefined) addr.lat = lat;
  if (lng !== undefined) addr.lng = lng;
  await user.save();
  successResponse(res, user.addresses);
};

export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  const addr = user.addresses.id(id);
  if (!addr) { errorResponse(res, 'Address not found', 'NOT_FOUND', 404); return; }
  addr.deleteOne();
  await user.save();
  successResponse(res, user.addresses, 'Address deleted');
};

export const setDefaultAddress = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = await User.findById(auth(req).user._id);
  if (!user) { errorResponse(res, 'User not found', 'NOT_FOUND', 404); return; }
  const addr = user.addresses.id(id);
  if (!addr) { errorResponse(res, 'Address not found', 'NOT_FOUND', 404); return; }
  user.addresses.forEach((a) => { a.isDefault = false; });
  addr.isDefault = true;
  await user.save();
  successResponse(res, user.addresses, 'Default address set');
};

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(auth(req).user._id).select('language theme notificationSettings');
  successResponse(res, {
    language: user?.language,
    theme: user?.theme,
    notifications: user?.notificationSettings,
  });
};

export const updateLanguage = async (req: Request, res: Response): Promise<void> => {
  const { language } = req.body as { language?: string };
  if (!['en', 'ar'].includes(language ?? '')) {
    errorResponse(res, 'Invalid language', 'INVALID_VALUE', 400);
    return;
  }
  await User.findByIdAndUpdate(auth(req).user._id, { language });
  successResponse(res, { language }, 'Language updated');
};

export const updateTheme = async (req: Request, res: Response): Promise<void> => {
  const { theme } = req.body as { theme?: string };
  if (!['light', 'dark'].includes(theme ?? '')) {
    errorResponse(res, 'Invalid theme', 'INVALID_VALUE', 400);
    return;
  }
  await User.findByIdAndUpdate(auth(req).user._id, { theme });
  successResponse(res, { theme }, 'Theme updated');
};

export const getPrivacySettings = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(auth(req).user._id).select('privacySettings');
  successResponse(res, user?.privacySettings);
};

export const updatePrivacySettings = async (req: Request, res: Response): Promise<void> => {
  const { showPhone, showEmail, showOnlineStatus } = req.body as {
    showPhone?: boolean; showEmail?: boolean; showOnlineStatus?: boolean;
  };
  const update: Record<string, unknown> = {};
  if (showPhone !== undefined) update['privacySettings.showPhone'] = showPhone;
  if (showEmail !== undefined) update['privacySettings.showEmail'] = showEmail;
  if (showOnlineStatus !== undefined) update['privacySettings.showOnlineStatus'] = showOnlineStatus;
  const user = await User.findByIdAndUpdate(auth(req).user._id, update, { new: true })
    .select('privacySettings');
  successResponse(res, user?.privacySettings, 'Privacy settings updated');
};

export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  await User.findByIdAndUpdate(auth(req).user._id, { isActive: false });
  successResponse(res, null, 'Account deactivated');
};

export const getPrivacyPolicy = async (_req: Request, res: Response): Promise<void> => {
  successResponse(res, {
    content: `SmartFix Privacy Policy\n\nLast updated: ${new Date().getFullYear()}\n\nWe collect your personal information to provide home maintenance services. Your data is stored securely and never sold to third parties. You may request deletion of your data at any time.\n\nContact: privacy@smartfix.app`,
  });
};

export const getContactUs = async (_req: Request, res: Response): Promise<void> => {
  successResponse(res, {
    email: 'support@smartfix.app',
    phone: '+20-100-000-0000',
    social: {
      facebook: 'https://facebook.com/smartfix',
      instagram: 'https://instagram.com/smartfix',
      twitter: 'https://twitter.com/smartfix',
    },
  });
};

export const getAppVersion = async (_req: Request, res: Response): Promise<void> => {
  successResponse(res, { version: process.env.APP_VERSION ?? '1.0.0' });
};
