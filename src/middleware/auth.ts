import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import User from '../models/User';
import { AuthRequest, UserRole } from '../types';
import { errorResponse } from '../utils/responseHelper';

interface JwtPayload {
  id: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    errorResponse(res, 'No token provided', 'NO_TOKEN', 401);
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user || !user.isActive) {
      errorResponse(res, 'User not found or deactivated', 'USER_NOT_FOUND', 401);
      return;
    }

    (req as AuthRequest).user = user;
    next();
  } catch {
    errorResponse(res, 'Invalid or expired token', 'INVALID_TOKEN', 401);
  }
};

export const requireRole = (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;
    if (!roles.includes(user.role)) {
      errorResponse(res, 'Access forbidden for your role', 'FORBIDDEN', 403);
      return;
    }
    next();
  };

export const socketAuth = (socket: Socket, next: (err?: Error) => void): void => {
  const token =
    (socket.handshake.query.token as string) ||
    (socket.handshake.auth.token as string);

  if (!token) {
    next(new Error('NO_TOKEN'));
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    (socket as unknown as { userId: string; userRole: UserRole }).userId = decoded.id;
    (socket as unknown as { userId: string; userRole: UserRole }).userRole = decoded.role;
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
};
