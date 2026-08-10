import { Router } from 'express';
import sql from '../db';
import { authenticate } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';

const router = Router();

router.use(authenticate);

// Get activity logs with user info joined
router.get('/', async (req: any, res) => {
  try {
    const logs = await sql`
      SELECT 
        a.id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.details,
        a.created_at,
        COALESCE(NULLIF(p.full_name, ''), NULLIF(u.username, ''), 'ผู้ดูแลระบบ') as user_name
      FROM activity_logs a
      LEFT JOIN profiles p ON p.id::text = a.user_id
      LEFT JOIN users u ON u.id::text = a.user_id
      WHERE a.tenant_id = ${req.tenantId!}
      ORDER BY a.created_at DESC NULLS LAST, a.id DESC
      LIMIT 100
    `;
    const formatted = logs.map((l: any) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType || l.entity_type,
      entityId: l.entityId || l.entity_id,
      details: l.details,
      createdAt: l.createdAt || l.created_at || null,
      userName: l.userName || l.user_name || 'ผู้ดูแลระบบ'
    }));
    res.json(formatted);
  } catch (e) {
    handleRouteError(e, res, 'GET /activity');
  }
});

// Log a new activity
router.post('/', async (req: any, res) => {
  const action = req.body.action;
  const entityType = req.body.entityType || req.body.entity_type || null;
  const entityId = req.body.entityId || req.body.entity_id || null;
  const details = req.body.details || null;
  try {
    await sql`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, tenant_id, created_at)
      VALUES (${req.userId}, ${action}, ${entityType}, ${entityId}, ${details ? JSON.stringify(details) : null}, ${req.tenantId!}, CURRENT_TIMESTAMP)
    `;
    res.json({ success: true });
  } catch (e) {
    handleRouteError(e, res, 'POST /activity');
  }
});

export default router;
