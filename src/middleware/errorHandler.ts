import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { errorResponse } from '../utils/responseHelper';

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: string | number;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, MongooseError.ValidatorError | MongooseError.CastError>;
}

const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('❌ Unhandled error:', err.stack || err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields,
    });
    return;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    errorResponse(res, `${field} already exists`, 'DUPLICATE_KEY', 409);
    return;
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    errorResponse(res, 'Invalid ID format', 'INVALID_ID', 400);
    return;
  }

  const status = err.status || err.statusCode || 500;
  errorResponse(
    res,
    err.message || 'Internal server error',
    (err.code as string) || 'SERVER_ERROR',
    status
  );
};

export default errorHandler;
