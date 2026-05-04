import { PaginationParams, PaginationMeta } from '../types';

export const paginate = (query: Record<string, unknown>): PaginationParams => {
  const page = Math.max(1, parseInt((query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) || '20', 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildPagination = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});
