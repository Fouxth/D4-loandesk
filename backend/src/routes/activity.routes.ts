import { Router } from 'express';
import sql from '../db';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Get activity logs with user info joined
router.get('/', async (req, res) => {
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
      ORDER BY a.created_at DESC
      LIMIT 100
    `;
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Log a new activity
router.post('/', async (req: any, res) => {
  const { action, entityType, entityId, details } = req.body;
  try {
    await sql`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (${req.userId}, ${action}, ${entityType ?? null}, ${entityId ?? null}, ${details ? JSON.stringify(details) : null})
    `;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
