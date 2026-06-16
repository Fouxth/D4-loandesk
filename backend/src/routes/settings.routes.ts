import { Router } from 'express';
import sql from '../db';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';
import { DEFAULT_LINE_EVENTS } from '../services/lineConfig';
import { sendLineTestNotification } from '../services/lineDigest.service';

const router = Router();

router.use(authenticate);

// Get all settings for the logged-in tenant
router.get('/', async (req: AuthRequest, res) => {
  try {
    let settings = await sql`SELECT * FROM settings WHERE tenant_id = ${req.tenantId!}`;
    
    // Auto-seed default settings if this is a newly generated tenant with no settings
    if (settings.length === 0 && req.tenantId! !== 'bkj') {
      const defaultSettings = await sql`SELECT * FROM settings WHERE tenant_id = 'bkj'`;
      for (const ds of defaultSettings) {
        // Adjust default name to D4-LoanDesk for general defaults, or keep it generic
        let val = ds.value;
        if (ds.key === 'business_profile') {
          // Reset business name to empty or default for the new tenant to customize
          val = { ...ds.value, nameTH: '', nameEN: '', phone: '', address: '' };
        } else if (ds.key === 'line_notify') {
          // Reset LINE Notify credentials to prevent leakage
          val = {
            enabled: false,
            token: '',
            userId: '',
            userIds: [],
            events: { ...DEFAULT_LINE_EVENTS },
          };
        }
        await sql`
          INSERT INTO settings (tenant_id, key, value, updated_at)
          VALUES (${req.tenantId!}, ${ds.key}, ${val}, CURRENT_TIMESTAMP)
          ON CONFLICT (tenant_id, key) DO NOTHING
        `;
      }
      // Re-fetch now that we seeded the defaults
      settings = await sql`SELECT * FROM settings WHERE tenant_id = ${req.tenantId!}`;
    }

    const result = settings.reduce((acc: any, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(result);
  } catch (e) {
    handleRouteError(e, res, 'GET /settings');
  }
});

router.post('/line-notify/test', async (req: AuthRequest, res) => {
  try {
    await sendLineTestNotification(req.tenantId!);
    res.json({ message: 'ส่งข้อความทดสอบแล้ว' });
  } catch (e) {
    handleRouteError(e, res, 'POST /settings/line-notify/test');
  }
});

// Update specific setting for the logged-in tenant
router.post('/:key', async (req: AuthRequest, res) => {
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

