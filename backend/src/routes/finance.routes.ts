import { Router } from 'express';
import * as financeService from '../services/finance.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Payments
router.get('/payments', async (req, res) => {
  try { res.json(await financeService.dbGetPayments()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/payments/loan/:loanId', async (req, res) => {
  try { res.json(await financeService.dbGetPaymentsByLoan(req.params.loanId)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/payments', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbCreatePayment(req.body, req.userId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:id', async (req, res) => {
  try { res.json(await financeService.dbDeletePayment(req.params.id)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Expenses
router.get('/expenses', async (req, res) => {
  try { res.json(await financeService.dbGetExpenses()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/expenses', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbCreateExpense(req.body, req.userId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/expenses/:id', async (req, res) => {
  try { res.json(await financeService.dbDeleteExpense(req.params.id)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
