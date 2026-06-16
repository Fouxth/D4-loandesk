import { Router } from 'express';
import * as customerService from '../services/customers.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbGetCustomers(req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /customers'); }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbGetCustomerById(req.params.id as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /customers/:id'); }
});

router.post('/', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbCreateCustomer(req.body, req.userId!, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'POST /customers'); }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbUpdateCustomer(req.params.id as string, req.body, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'PUT /customers/:id'); }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbDeleteCustomer(req.params.id as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'DELETE /customers/:id'); }
});

export default router;

