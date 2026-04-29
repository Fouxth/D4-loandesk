import { Router } from 'express';
import * as customerService from '../services/customers.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try { res.json(await customerService.dbGetCustomers()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try { res.json(await customerService.dbGetCustomerById(req.params.id)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbCreateCustomer(req.body, req.userId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try { res.json(await customerService.dbUpdateCustomer(req.params.id, req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { res.json(await customerService.dbDeleteCustomer(req.params.id)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
