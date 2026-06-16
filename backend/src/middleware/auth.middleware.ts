import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwt';
import sql from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies.session || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; tenantId: string };
    if (!decoded.userId || !decoded.tenantId) {
      return res.status(401).json({ error: 'Invalid token: missing claims' });
    }
    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;

    // Check tenant is_active on every request (skip for system super-admin)
    if (req.tenantId !== 'system') {
      const [tenant] = await sql`SELECT is_active FROM tenants WHERE id = ${req.tenantId}`;
      if (tenant && tenant.isActive === false) {
        return res.status(403).json({
          error: 'บัญชีร้านค้าถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อปลดล็อก'
        });
      }
    }

    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
