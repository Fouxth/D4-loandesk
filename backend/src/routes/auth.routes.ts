import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { getJwtSecret } from '../utils/jwt';
import { handleRouteError } from '../utils/apiError';
import sql from '../db';

const router = Router();

router.post('/login', async (req: any, res) => {
  const { username, password } = req.body;
  
  // Debug info for mobile/cross-site issues
  const origin = req.headers.origin;
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const crossSiteCookies = process.env.CROSS_SITE_COOKIES === 'true';

  try {
    const user = await authService.getUserByUsername(username);
    
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify if the tenant is active
    const [tenant] = await sql`SELECT is_active FROM tenants WHERE id = ${user.tenantId}`;
    if (tenant && tenant.isActive === false) {
      return res.status(403).json({ error: 'บัญชีร้านค้าถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อปลดล็อก' });
    }

    const token = jwt.sign({ userId: user.id, tenantId: user.tenantId || 'bkj' }, getJwtSecret(), { expiresIn: '7d' });
    
    // Auto-detect if we should use Secure/SameSite=None
    // In production/HTTPS, we MUST use SameSite=None to support mobile and cross-site access
    const useSecure = isHttps || (process.env.NODE_ENV === 'production');
    const sameSiteValue = useSecure ? 'none' : 'lax';

    res.cookie('session', token, {
      httpOnly: true,
      secure: useSecure,
      sameSite: sameSiteValue,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ 
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenantId || 'bkj'
      }
    });
  } catch (e: any) {
    console.error('Login Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

router.post('/signup', async (req, res) => {
  const { username, password, fullName } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await authService.createUser(username, passwordHash, fullName);

    const token = jwt.sign({ userId: user.id, tenantId: user.tenantId || 'bkj' }, getJwtSecret(), { expiresIn: '7d' });
    
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const useSecure = isHttps || (process.env.NODE_ENV === 'production');
    const sameSiteValue = useSecure ? 'none' : 'lax';

    res.cookie('session', token, {
      httpOnly: true,
      secure: useSecure,
      sameSite: sameSiteValue,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ 
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenantId || 'bkj'
      }
    });
  } catch (e: any) {
    handleRouteError(e, res, 'POST /auth/signup');
  }
});

router.post('/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const useSecure = isHttps || (process.env.NODE_ENV === 'production');
  const sameSiteValue = useSecure ? 'none' : 'lax';

  res.clearCookie('session', {
    httpOnly: true,
    secure: useSecure,
    sameSite: sameSiteValue,
    path: '/',
  });
  res.json({ success: true });
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await authService.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Kick out user if their tenant has been suspended
    if (user.tenantIsActive === false) {
      return res.status(403).json({ error: 'บัญชีร้านค้าถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
    }
    const roles = await authService.getUserRoles(req.userId!);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenantId || 'bkj',
        tenantName: user.tenantName || 'D4-LoanDesk',
        user_metadata: { full_name: user.fullName, avatar_url: user.avatarUrl }
      },
      roles
    });
  } catch (e: any) {
    console.error('Auth Me Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

router.post('/change-password', authenticate, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await authService.getUserById(req.userId!);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await authService.updateUserPassword(user.id, newPasswordHash);

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (e: any) {
    console.error('Change Password Error:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// ── Staff management (admin only) ─────────────────────────────────────────

async function requireAdmin(req: AuthRequest, res: any, next: any) {
  try {
    const roles = await authService.getUserRoles(req.userId!);
    if (!roles.includes('admin')) return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    next();
  } catch (e) {
    handleRouteError(e, res, 'requireAdmin');
  }
}

router.get('/users', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try { res.json(await authService.getUsersByTenant(req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /auth/users'); }
});

router.post('/users', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { username, password, fullName } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้ ชื่อจริง และรหัสผ่าน' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await authService.createUser(username, passwordHash, fullName, req.tenantId!, 'staff');
    res.json(user);
  } catch (e) { handleRouteError(e, res, 'POST /auth/users'); }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const targetId = req.params.id as string;
  if (targetId === req.userId) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  }
  try {
    // Prevent locking the tenant out: never delete its last admin
    const targetRole = await authService.getUserRole(targetId);
    if (targetRole === 'admin') {
      const adminCount = await authService.getAdminCountByTenant(req.tenantId!);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายของร้านได้' });
      }
    }
    await authService.deleteUserFromTenant(targetId, req.tenantId!);
    res.json({ success: true });
  } catch (e) { handleRouteError(e, res, 'DELETE /auth/users/:id'); }
});

router.patch('/users/:id/password', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const targetId = req.params.id as string;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await authService.adminResetPassword(targetId, req.tenantId!, hash);
    res.json({ success: true });
  } catch (e) { handleRouteError(e, res, 'PATCH /auth/users/:id/password'); }
});

export default router;
