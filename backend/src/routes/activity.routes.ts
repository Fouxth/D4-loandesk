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
        p.full_name as user_name
      FROM activity_logs a
      LEFT JOIN profiles p ON p.id = a.user_id
      WHERE a.tenant_id = ${req.tenantId!}
      ORDER BY a.created_at DESC
      LIMIT 100
    `;
    res.json(logs);
  } catch (e) {
    handleRouteError(e, res, 'GET /activity');
  }
});

// Log a new activity
router.post('/', async (req: any, res) => {
  const { action, entityType, entityId, details } = req.body;
  try {
    await sql`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, tenant_id)
      VALUES (${req.userId}, ${action}, ${entityType ?? null}, ${entityId ?? null}, ${details ? JSON.stringify(details) : null}, ${req.tenantId!})
    `;
    res.json({ success: true });
  } catch (e) {
    handleRouteError(e, res, 'POST /activity');
  }
});

export default router;
