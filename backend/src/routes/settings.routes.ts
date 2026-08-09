import { Router } from 'express';
import sql from '../db';
import * as authService from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';
import { DEFAULT_LINE_EVENTS } from '../services/lineConfig';
import { sendLineTestNotification } from '../services/lineDigest.service';

const router = Router();

router.use(authenticate);

// Finding 7: Restrict setting updates to tenant admin users
async function requireAdmin(req: AuthRequest, res: any, next: any) {
  try {
    const roles = await authService.getUserRoles(req.userId!);
    if (!roles.includes('admin')) {
      return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์แก้ไขการตั้งค่า' });
    }
    next();
  } catch (e) {
    handleRouteError(e, res, 'requireAdmin');
  }
}

const DEFAULT_TENANT_SETTINGS: Record<string, any> = {
  business_profile: { nameTH: '', nameEN: '', phone: '', address: '', logoUrl: '' },
  line_notify: {
    enabled: false,
    token: '',
    userId: '',
    userIds: [],
    events: { ...DEFAULT_LINE_EVENTS },
  },
  lending_config: {
    defaultInterestRate: 10,
    lateFeePerDay: 50,
    gracePeriodDays: 3,
  },
  backup_config: {
    enabled: true,
    notifyDiscord: true,
  },
};

// Get all settings for the logged-in tenant
router.get('/', async (req: AuthRequest, res) => {
  try {
    let settings = await sql`SELECT * FROM settings WHERE tenant_id = ${req.tenantId!}`;
    
    // Finding 9: Seed explicit default settings from application constants rather than copying raw bkj DB rows
    if (settings.length === 0 && req.tenantId! !== 'bkj') {
      for (const [key, val] of Object.entries(DEFAULT_TENANT_SETTINGS)) {
        await sql`
          INSERT INTO settings (tenant_id, key, value, updated_at)
          VALUES (${req.tenantId!}, ${key}, ${val}, CURRENT_TIMESTAMP)
          ON CONFLICT (tenant_id, key) DO NOTHING
        `;
      }
      // Re-fetch now that we seeded the defaults
      settings = await sql`SELECT * FROM settings WHERE tenant_id = ${req.tenantId!}`;
    }

    // Finding 1: Check user role and redact sensitive credentials for non-admin staff users
    const roles = await authService.getUserRoles(req.userId!);
    const isAdmin = roles.includes('admin');

    const result = settings.reduce((acc: any, curr) => {
      let val = curr.value;
      if (!isAdmin && curr.key === 'line_notify' && val && typeof val === 'object') {
        val = {
          ...val,
          token: val.token ? '••••••••' : '',
          channelSecret: val.channelSecret ? '••••••••' : '',
        };
      }
      acc[curr.key] = val;
      return acc;
    }, {});
    res.json(result);
  } catch (e) {
    handleRouteError(e, res, 'GET /settings');
  }
});

import { runTenantBackup, restoreTenantBackup } from '../services/backup.service';

router.post('/backup/run', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await runTenantBackup(req.tenantId!);
    res.json({ message: 'ส่งไฟล์สำรองข้อมูลเข้า Discord เรียบร้อยแล้ว', result });
  } catch (e) {
    handleRouteError(e, res, 'POST /settings/backup/run');
  }
});

router.post('/backup/restore', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await restoreTenantBackup(req.tenantId!, req.body);
    res.json({ message: 'นำเข้าข้อมูลคืนสู่ PostgreSQL เรียบร้อยแล้ว', result });
  } catch (e) {
    handleRouteError(e, res, 'POST /settings/backup/restore');
  }
});

router.post('/line-notify/test', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await sendLineTestNotification(req.tenantId!);
    res.json({ message: 'ส่งข้อความทดสอบแล้ว' });
  } catch (e) {
    handleRouteError(e, res, 'POST /settings/line-notify/test');
  }
});

// Update specific setting for the logged-in tenant
router.post('/:key', requireAdmin, async (req: AuthRequest, res) => {
  const { key } = req.params;
  const { value } = req.body;
  
  // Ensure we are saving the correct object structure
  const dataToSave = value !== undefined ? value : req.body;

  try {
    await sql`
      INSERT INTO settings (tenant_id, key, value, updated_at)
      VALUES (${req.tenantId!}, ${key as string}, ${dataToSave}, CURRENT_TIMESTAMP)
      ON CONFLICT (tenant_id, key) DO 
      UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;
    res.json({ message: 'Setting updated successfully' });
  } catch (e) {
    handleRouteError(e, res, 'POST /settings/:key');
  }
});

export default router;

