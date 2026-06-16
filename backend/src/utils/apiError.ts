import { Response } from 'express';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleRouteError(e: unknown, res: Response, context?: string): void {
  if (e instanceof ApiError) {
    res.status(e.statusCode).json({ error: e.message });
    return;
  }
  console.error(`[API Error]${context ? ` ${context}` : ''}`, e);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
}
