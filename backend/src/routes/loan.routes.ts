import { Router } from 'express';
import * as loanService from '../services/loans.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try { res.json(await loanService.getAllLoans()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/notifications', async (req, res) => {
  try { res.json(await loanService.getOverdueNotifications()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Must be BEFORE /:id to avoid "customer" being treated as an id
router.get('/customer/:customerId', async (req, res) => {
  try { res.json(await loanService.getLoansByCustomerId(req.params.customerId)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try { res.json(await loanService.getLoanById(req.params.id)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const loanNumber = `L${Date.now().toString().slice(-6)}`;
    res.json(await loanService.dbCreateLoan(req.body, loanNumber, req.userId!));
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/refinance', async (req: AuthRequest, res) => {
  try {
    const loanNumber = `R${Date.now().toString().slice(-6)}`;
    res.json(await loanService.dbRefinanceLoan(req.params.id as string, req.body, loanNumber, req.userId!));
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
