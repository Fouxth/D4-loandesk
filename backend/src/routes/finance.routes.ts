import { Router } from 'express';
import multer from 'multer';
import sql from '../db';
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
  if (req.body.amount === undefined || req.body.amount === null || req.body.amount === '' || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'จำนวนเงินต้องมากกว่า 0 บาท' });
  }
  try {
    const body: any = { ...req.body };
    if (!body.loanId) {
      return res.status(400).json({ error: 'กรุณาระบุสัญญาเงินกู้' });
    }

    // Finding 6: Validate loan ownership BEFORE triggering external Discord upload
    const [loan] = await sql`
      SELECT l.id, l.loan_number, c.full_name as customer_name
      FROM loans l
      LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.id = ${body.loanId} AND l.tenant_id = ${req.tenantId!}
    `;
    if (!loan) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลสัญญา หรือคุณไม่มีสิทธิ์เข้าถึงสัญญานี้' });
    }

    if (req.file) {
      const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const formattedAmount = Number(body.amount).toLocaleString('th-TH');
      const customizedMessage = [
        `💳 **มีสลิปการชำระเงินใหม่ถูกอัปเข้าระบบ!**`,
        `👤 **ลูกค้า:** \`${loan.customer_name || 'ไม่ระบุ'}\``,
        `🏷 **สัญญา:** \`${loan.loan_number || body.loanId}\``,
        `💸 **ยอดชำระ:** \`${formattedAmount} บาท\``,
        `📂 **ไฟล์ต้นทาง:** \`${req.file.originalname}\``,
        `⏰ **เวลาอัปโหลด:** ${nowStr}`,
      ].join('\n');

      body.slipUrl = await uploadFileToDiscord(
        req.tenantId!,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        customizedMessage,
      );
      body.slipFileName = req.file.originalname;
    }
    res.json(await financeService.dbCreatePayment(body, req.userId!, req.tenantId!));
  }
  catch (e) { handleRouteError(e, res, 'POST /finance/payments'); }
});

router.post('/payments/bulk', async (req: AuthRequest, res) => {
  try {
    const { payments } = req.body;
    res.json(await financeService.dbCreateBulkPayments(payments, req.userId!, req.tenantId!));
  } catch (e) {
    handleRouteError(e, res, 'POST /finance/payments/bulk');
  }
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
