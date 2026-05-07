import { Response } from 'express';
import { ApiSuccess, ApiError, ApiPaginated, PaginationMeta } from '../types';

export const successResponse = <T>(
  res: Response,
  data: T,
  message?: string,
  status = 200,
): Response => {
  const body: ApiSuccess<T> = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
};

export const errorResponse = (
  res: Response,
  error: string,
  code = 'ERROR',
  status = 400,
  details?: Record<string, unknown>,
): Response => {
  const body: ApiError = { success: false, error, code };
  if (details) body.details = details;
  return res.status(status).json(body);
};

export const paginatedResponse = <T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
): Response => {
  const body: ApiPaginated<T> = { success: true, data, pagination };
  return res.status(200).json(body);
};
