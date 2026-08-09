import { Router } from 'express';
import * as tenantService from '../services/tenant.service';
import * as authService from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';

const router = Router();

// Apply auth middleware to protect these routes
router.use(authenticate);

// Finding 3: Enforce both system tenant AND admin role check for super-admin routes
async function requireSuperAdmin(req: AuthRequest, res: any, next: any) {
  if (req.tenantId !== 'system') {
    return res.status(403).json({ error: 'ปฏิเสธการเข้าถึง: สำหรับผู้ดูแลระบบสูงสุดเท่านั้น' });
  }
  try {
    const roles = await authService.getUserRoles(req.userId!);
    if (!roles.includes('admin')) {
      return res.status(403).json({ error: 'ปฏิเสธการเข้าถึง: ต้องมีสิทธิ์แอดมินระบบระบบเท่านั้น' });
    }
    next();
  } catch (e) {
    handleRouteError(e, res, 'requireSuperAdmin');
  }
}

/**
 * Super Admin endpoint to list all active tenants
 * GET /api/tenants
 */
router.get('/', requireSuperAdmin, async (req: AuthRequest, res: any) => {
  try {
    const tenants = await tenantService.getAllTenants();
    res.json({
      success: true,
      data: tenants
    });
  } catch (e) {
    handleRouteError(e, res, 'GET /tenants');
  }
});

/**
 * Super Admin endpoint to generate a new tenant system instantly
 * POST /api/tenants/generate
 */
router.post('/generate', requireSuperAdmin, async (req: AuthRequest, res: any) => {
  const { name } = req.body;
  try {
    const result = await tenantService.createTenantAutomatically(name);
    res.json({
      success: true,
      message: 'สร้างระบบเก็บกู้ร้านใหม่เรียบร้อยแล้ว!',
      data: result
    });
  } catch (e) {
    handleRouteError(e, res, 'POST /tenants/generate');
  }
});

/**
 * Super Admin endpoint to toggle tenant active status
 * PUT /api/tenants/:id/status
 */
router.put('/:id/status', requireSuperAdmin, async (req: AuthRequest, res: any) => {
  const id = req.params.id as string;
  const { isActive } = req.body;

  try {
    const result = await tenantService.updateTenantStatus(id, isActive);
    res.json({
      success: true,
      message: isActive ? 'เปิดใช้งานระบบเรียบร้อย!' : 'ระงับการใช้งานระบบเรียบร้อย!',
      data: result[0]
    });
  } catch (e) {
    handleRouteError(e, res, 'PUT /tenants/:id/status');
  }
});

export default router;

