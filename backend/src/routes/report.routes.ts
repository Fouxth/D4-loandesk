import { Router } from 'express';
import * as reportService from '../services/reports.service';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/dashboard', async (req, res) => {
  const { monthStart } = req.query;
  try { res.json(await reportService.fetchDashboardRawData(monthStart as string)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/reports', async (req, res) => {
  const { monthStart } = req.query;
  try { res.json(await reportService.fetchReportRawData(monthStart as string)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
