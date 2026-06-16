import { Router } from 'express';
import * as tenantService from '../services/tenant.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';

const router = Router();

// Apply auth middleware to protect these routes
router.use(authenticate);

/**
 * Super Admin endpoint to list all active tenants
 * GET /api/tenants
 */
router.get('/', async (req: AuthRequest, res: any) => {
  // Only users in system can manage/view other tenants
  if (req.tenantId !== 'system') {
    return res.status(403).json({ error: 'ปฏิเสธการเข้าถึง: สำหรับผู้ดูแลระบบสูงสุดเท่านั้น' });
  }

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
router.post('/generate', async (req: AuthRequest, res: any) => {
  // Only users in system can generate new tenants
  if (req.tenantId !== 'system') {
    return res.status(403).json({ error: 'ปฏิเสธการเข้าถึง: สำหรับผู้ดูแลระบบสูงสุดเท่านั้น' });
  }

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
router.put('/:id/status', async (req: AuthRequest, res: any) => {
  if (req.tenantId !== 'system') {
    return res.status(403).json({ error: 'ปฏิเสธการเข้าถึง: สำหรับผู้ดูแลระบบสูงสุดเท่านั้น' });
  }

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

