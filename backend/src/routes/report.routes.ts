import { Router } from 'express';
import * as reportService from '../services/reports.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';

const router = Router();

router.use(authenticate);

router.get('/dashboard', async (req: AuthRequest, res) => {
  const { monthStart } = req.query;
  try { res.json(await reportService.fetchDashboardRawData(req.tenantId!, monthStart as string)); }
  catch (e) { handleRouteError(e, res, 'GET /reports/dashboard'); }
});

router.get('/reports', async (req: AuthRequest, res) => {
  const { monthStart } = req.query;
  try { res.json(await reportService.fetchReportRawData(req.tenantId!, monthStart as string)); }
  catch (e) { handleRouteError(e, res, 'GET /reports/reports'); }
});

export default router;

