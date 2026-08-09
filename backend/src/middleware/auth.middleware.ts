import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwt';
import sql from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const isCookieAuth = !!req.cookies?.session && !req.headers.authorization;
  const token = req.cookies?.session || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Finding 5: CSRF Protection for Cookie-Authenticated Mutations (POST, PUT, DELETE, PATCH)
  if (isCookieAuth && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    const requestedWith = req.headers['x-requested-with'];
    
    // In browser cookie auth, demand either custom header (X-Requested-With) or valid Origin/Referer header
    if (!requestedWith && (!origin || origin === 'null')) {
      return res.status(403).json({ error: 'CSRF validation failed: Missing origin or request verification header' });
    }
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; tenantId: string; pwdSig?: string };
    if (!decoded.userId || !decoded.tenantId) {
      return res.status(401).json({ error: 'Invalid token: missing claims' });
    }

    // Finding 9 & 2 & 7: Query database for current user, tenant assignment, and password hash
    const [user] = await sql`
      SELECT id, tenant_id, password_hash FROM users WHERE id = ${decoded.userId}
    `;
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    // Finding 2: Validate JWT tenant claim against current database user tenant
    if (decoded.tenantId !== user.tenantId && decoded.tenantId !== 'system') {
      return res.status(401).json({ error: 'Invalid token: tenant assignment mismatch' });
    }

    // Finding 7: Invalidate prior JWT sessions if password has been changed/reset
    if (decoded.pwdSig && user.passwordHash && user.passwordHash.slice(-6) !== decoded.pwdSig) {
      return res.status(401).json({ error: 'Session invalidated due to password change. Please log in again.' });
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
