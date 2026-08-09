import { Router, Request, Response } from 'express';
import { runScheduledLineNotifications } from '../services/lineDigest.service';
import { handleRouteError } from '../utils/apiError';

const router = Router();

function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Finding 6: Fail closed whenever CRON_SECRET is absent
    return false;
  }

  const auth = String(req.headers.authorization ?? '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const headerSecret = String(req.headers['x-cron-secret'] ?? '');
  return (bearer !== '' && bearer === secret) || (headerSecret !== '' && headerSecret === secret);
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

import { runAllTenantsBackup } from '../services/backup.service';

router.get('/backup', async (req: Request, res: Response) => {
  if (!authorizeCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const results = await runAllTenantsBackup();
    res.json({ ok: true, backupCount: results.length, timestamp: new Date().toISOString() });
  } catch (e) {
    handleRouteError(e, res, 'CRON backup');
  }
});
router.post('/backup', async (req: Request, res: Response) => {
  if (!authorizeCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const results = await runAllTenantsBackup();
    res.json({ ok: true, backupCount: results.length, timestamp: new Date().toISOString() });
  } catch (e) {
    handleRouteError(e, res, 'CRON backup');
  }
});

router.get('/line-notifications/morning', (req, res) => handleCron(req, res, 'morning'));
router.get('/line-notifications/evening', (req, res) => handleCron(req, res, 'evening'));
router.post('/line-notifications/morning', (req, res) => handleCron(req, res, 'morning'));
router.post('/line-notifications/evening', (req, res) => handleCron(req, res, 'evening'));

export default router;
