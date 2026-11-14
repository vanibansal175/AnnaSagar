import { Response } from 'express';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: { total: number; page: number; limit: number }
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data
  };

  if (meta) {
    body.meta = meta;
  }

  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message
    }
  };

  return res.status(statusCode).json(body);
}
