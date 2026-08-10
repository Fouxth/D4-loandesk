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
        a.entity_type as "entityType",
        a.entity_id as "entityId",
        a.details,
        a.created_at as "createdAt",
        COALESCE(p.full_name, 'ระบบ') as "userName"
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
  const action = req.body.action;
  const entityType = req.body.entityType || req.body.entity_type || null;
  const entityId = req.body.entityId || req.body.entity_id || null;
  const details = req.body.details || null;
  try {
    await sql`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, tenant_id)
      VALUES (${req.userId}, ${action}, ${entityType}, ${entityId}, ${details ? JSON.stringify(details) : null}, ${req.tenantId!})
    `;
    res.json({ success: true });
  } catch (e) {
    handleRouteError(e, res, 'POST /activity');
  }
});

export default router;
