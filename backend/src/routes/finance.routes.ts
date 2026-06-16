import { Router } from 'express';
import * as financeService from '../services/finance.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';

const router = Router();

router.use(authenticate);

// Payments
router.get('/payments', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbGetPayments(req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /finance/payments'); }
});

router.get('/payments/loan/:loanId', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbGetPaymentsByLoan(req.params.loanId as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /finance/payments/loan/:id'); }
});

router.post('/payments', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbCreatePayment(req.body, req.userId!, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'POST /finance/payments'); }
});

router.delete('/payments/:id', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbDeletePayment(req.params.id as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'DELETE /finance/payments/:id'); }
});

// Expenses
router.get('/expenses', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbGetExpenses(req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /finance/expenses'); }
});

router.post('/expenses', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbCreateExpense(req.body, req.userId!, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'POST /finance/expenses'); }
});

router.delete('/expenses/:id', async (req: AuthRequest, res) => {
  try { res.json(await financeService.dbDeleteExpense(req.params.id as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'DELETE /finance/expenses/:id'); }
});

export default router;
