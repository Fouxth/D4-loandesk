import { Router, Request, Response } from 'express';
import { runScheduledLineNotifications } from '../services/lineDigest.service';
import { handleRouteError } from '../utils/apiError';

const router = Router();

function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const auth = String(req.headers.authorization ?? '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const headerSecret = String(req.headers['x-cron-secret'] ?? '');
  return bearer === secret || headerSecret === secret;
}

async function handleCron(req: Request, res: Response, kind: 'morning' | 'evening') {
  if (!authorizeCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await runScheduledLineNotifications(kind);
    res.json({ ok: true, kind, timestamp: new Date().toISOString() });
  } catch (e) {
    handleRouteError(e, res, `CRON line-notifications/${kind}`);
  }
}

router.get('/line-notifications/morning', (req, res) => handleCron(req, res, 'morning'));
router.get('/line-notifications/evening', (req, res) => handleCron(req, res, 'evening'));
router.post('/line-notifications/morning', (req, res) => handleCron(req, res, 'morning'));
router.post('/line-notifications/evening', (req, res) => handleCron(req, res, 'evening'));

export default router;
