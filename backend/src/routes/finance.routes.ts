import { Router } from 'express';
import multer from 'multer';
import * as financeService from '../services/finance.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';
import { uploadFileToDiscord } from '../services/discord.service';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('รองรับเฉพาะไฟล์รูปภาพหรือ PDF เท่านั้น'));
  },
});

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

router.post('/payments', upload.single('slip'), async (req: AuthRequest, res) => {
  const amount = Number(req.body.amount);
  if (!req.body.amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'จำนวนเงินต้องมากกว่า 0' });
  }
  try {
    const body: any = { ...req.body };
    if (req.file) {
      body.slipUrl = await uploadFileToDiscord(
        req.tenantId!,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        `สลิปการชำระเงิน ${body.loanId || ''} ${Number(body.amount).toLocaleString('th-TH')} บาท`,
      );
      body.slipFileName = req.file.originalname;
    }
    res.json(await financeService.dbCreatePayment(body, req.userId!, req.tenantId!));
  }
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
