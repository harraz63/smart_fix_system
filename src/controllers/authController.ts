import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import User from '../models/User';
import TechnicianProfile from '../models/TechnicianProfile';
import { AuthRequest, UserRole, TechnicianType } from '../types';
import { successResponse, errorResponse } from '../utils/responseHelper';
import { emitter } from '../utils/emailHelper';

const signAccessToken = (user: {
  _id: Types.ObjectId;
  role: UserRole;
}): string =>
  jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '15m' },
  );

const signRefreshToken = (user: { _id: Types.ObjectId }): string =>
  jwt.sign(
    { id: user._id.toString() },
    (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET) as string,
    { expiresIn: '30d' },
  );

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, role, phone } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    phone?: string;
  };

  if (!name || !email || !password || !role) {
    errorResponse(
      res,
      'name, email, password, role required',
      'MISSING_FIELDS',
      400,
    );
    return;
  }
  if (!Object.values(UserRole).includes(role as UserRole)) {
    errorResponse(
      res,
      'role must be customer or technician',
      'INVALID_ROLE',
      400,
    );
    return;
  }

  const technicianType = (req.body as Record<string, unknown>)
    .technicianType as string | undefined;
  if (role === UserRole.Technician) {
    if (!technicianType) {
      errorResponse(
        res,
        `technicianType required for technicians. Valid: ${Object.values(TechnicianType).join(', ')}`,
        'MISSING_TECHNICIAN_TYPE',
        400,
      );
      return;
    }
    if (
      !Object.values(TechnicianType).includes(technicianType as TechnicianType)
    ) {
      errorResponse(
        res,
        `Invalid technicianType. Valid: ${Object.values(TechnicianType).join(', ')}`,
        'INVALID_TYPE',
        400,
      );
      return;
    }
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    errorResponse(res, 'Email already registered', 'DUPLICATE_EMAIL', 409);
    return;
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role,
    otpCode,
    otpExpires,
    isVerified: false,
    isActive: true,
  });

  if (role === UserRole.Technician) {
    await TechnicianProfile.create({
      userId: user._id,
      technicianType: technicianType as TechnicianType,
    });
  }

  emitter.emit('sendEmail', {
    to: email,
    subject: 'OTP for SmartFix',
    content: `Your OTP is ${otpCode}`,
  });

  successResponse(
    res,
    { userId: user._id, email: user.email, role: user.role },
    'Registration successful. Please verify your OTP.',
    201,
  );
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  const { userId, otp } = req.body as { userId?: string; otp?: string };
  if (!userId || !otp) {
    errorResponse(res, 'userId and otp required', 'MISSING_FIELDS', 400);
    return;
  }

  const user = await User.findById(userId);
  if (!user) {
    errorResponse(res, 'User not found', 'NOT_FOUND', 404);
    return;
  }
  if (user.isVerified) {
    errorResponse(res, 'Already verified', 'ALREADY_VERIFIED', 400);
    return;
  }
  if (!user.otpCode || user.otpCode !== otp) {
    errorResponse(res, 'Invalid OTP', 'INVALID_OTP', 400);
    return;
  }
  if (user.otpExpires && new Date() > user.otpExpires) {
    errorResponse(res, 'OTP expired', 'OTP_EXPIRED', 400);
    return;
  }

  user.isVerified = true;
  user.otpCode = null;
  user.otpExpires = null;

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();

  successResponse(
    res,
    { accessToken, refreshToken, user: user.toPublicJSON() },
    'OTP verified',
  );
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    errorResponse(res, 'userId required', 'MISSING_FIELD', 400);
    return;
  }

  const user = await User.findById(userId);
  if (!user) {
    errorResponse(res, 'User not found', 'NOT_FOUND', 404);
    return;
  }
  if (user.isVerified) {
    errorResponse(res, 'Already verified', 'ALREADY_VERIFIED', 400);
    return;
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  user.otpCode = otpCode;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  emitter.emit('sendEmail', {
    to: user.email,
    subject: 'Resend OTP for SmartFix',
    content: `Your OTP is ${otpCode}`,
  });

  successResponse(res, null, 'OTP resent');
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    errorResponse(res, 'email and password required', 'MISSING_FIELDS', 400);
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    errorResponse(res, 'Invalid credentials', 'INVALID_CREDENTIALS', 401);
    return;
  }
  if (!user.isActive) {
    errorResponse(res, 'Account deactivated', 'DEACTIVATED', 403);
    return;
  }

  const match = await user.comparePassword(password);
  if (!match) {
    errorResponse(res, 'Invalid credentials', 'INVALID_CREDENTIALS', 401);
    return;
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();

  successResponse(res, {
    accessToken,
    refreshToken,
    user: user.toPublicJSON(),
    isVerified: user.isVerified,
  });
};

export const refreshToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { refreshToken: token } = req.body as { refreshToken?: string };
  if (!token) {
    errorResponse(res, 'refreshToken required', 'MISSING_FIELD', 400);
    return;
  }

  let decoded: { id: string };
  try {
    decoded = jwt.verify(
      token,
      (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET) as string,
    ) as { id: string };
  } catch {
    errorResponse(
      res,
      'Invalid or expired refresh token',
      'INVALID_TOKEN',
      401,
    );
    return;
  }

  const user = await User.findById(decoded.id);
  if (!user || user.refreshToken !== token) {
    errorResponse(res, 'Refresh token revoked', 'TOKEN_REVOKED', 401);
    return;
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);
  user.refreshToken = newRefreshToken;
  await user.save();

  successResponse(res, { accessToken, refreshToken: newRefreshToken });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  await User.findByIdAndUpdate((req as AuthRequest).user._id, {
    refreshToken: null,
    fcmToken: null,
  });
  successResponse(res, null, 'Logged out');
};

export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) {
    errorResponse(res, 'email required', 'MISSING_FIELD', 400);
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    successResponse(res, null, 'If this email exists, a reset code was sent');
    return;
  }

  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  user.otpCode = resetCode;
  user.otpExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  emitter.emit('sendEmail', {
    to: user.email,
    subject: 'Reset Code for SmartFix',
    content: `Your reset code is ${resetCode}`,
  });

  successResponse(res, null, 'If this email exists, a reset code was sent');
};

export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, code, newPassword } = req.body as {
    email?: string;
    code?: string;
    newPassword?: string;
  };
  if (!email || !code || !newPassword) {
    errorResponse(
      res,
      'email, code, and newPassword required',
      'MISSING_FIELDS',
      400,
    );
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || user.otpCode !== code) {
    errorResponse(res, 'Invalid reset code', 'INVALID_CODE', 400);
    return;
  }
  if (user.otpExpires && new Date() > user.otpExpires) {
    errorResponse(res, 'Reset code expired', 'CODE_EXPIRED', 400);
    return;
  }

  const salt = await bcrypt.genSalt(12);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  user.otpCode = null;
  user.otpExpires = null;
  user.refreshToken = null;
  await user.save();

  successResponse(res, null, 'Password reset successfully');
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const user = await User.findById(authReq.user._id).select(
    '-passwordHash -refreshToken -otpCode -otpExpires',
  );
  let profile = null;
  if (authReq.user.role === UserRole.Technician) {
    profile = await TechnicianProfile.findOne({ userId: authReq.user._id });
  }
  successResponse(res, { user, profile });
};
