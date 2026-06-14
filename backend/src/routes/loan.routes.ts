import { Router } from 'express';
import * as loanService from '../services/loans.service';
import * as uploadService from '../services/upload.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import { uploadFileToDiscord } from '../services/discord.service';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported attachment file type'));
    }

    cb(null, true);
  },
});

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res) => {
  try { res.json(await loanService.getAllLoans(req.tenantId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/notifications', async (req: AuthRequest, res) => {
  try { res.json(await loanService.getOverdueNotifications(req.tenantId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Must be BEFORE /:id to avoid "customer" being treated as an id
router.get('/customer/:customerId', async (req: AuthRequest, res) => {
  try { res.json(await loanService.getLoansByCustomerId(req.params.customerId as string, req.tenantId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try { res.json(await loanService.getLoanById(req.params.id as string, req.tenantId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const loanNumber = `L${Date.now().toString().slice(-6)}`;
    res.json(await loanService.dbCreateLoan(req.body, loanNumber, req.userId!, req.tenantId!));
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/refinance', async (req: AuthRequest, res) => {
  try {
    const loanNumber = `R${Date.now().toString().slice(-6)}`;
    res.json(await loanService.dbRefinanceLoan(req.params.id as string, req.body, loanNumber, req.userId!, req.tenantId!));
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try { res.json(await loanService.dbUpdateLoan(req.params.id as string, req.body, req.tenantId!)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/late-fee', async (req: AuthRequest, res) => {
  try {
    const { mode, amount, note } = req.body;
    const result = await loanService.dbUpdateLoanLateFee(
      req.params.id as string,
      { mode, amount, note },
      req.userId!,
      req.tenantId!,
    );
    res.json(result[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    res.json(await loanService.dbDeleteLoan(req.params.id as string, req.tenantId!));
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Attachments
router.post('/:id/attachments', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Fetch loan & customer info to build a rich message
    const loan = await loanService.getLoanById(req.params.id as string, req.tenantId!);
    let customizedMessage = `📎 อัปโหลดรูปภาพหลักฐานจากระบบของ **${req.tenantId!}**`;
    if (loan) {
      customizedMessage = `📸 **มีรูปหลักฐานใหม่ถูกแนบเข้าระบบ!**\n👤 **ลูกค้า:** \`${loan.customerName}\`\n📝 **เลขที่สัญญา:** \`${loan.loanNumber}\`\n📂 **ไฟล์ต้นทาง:** \`${req.file.originalname}\`\n⏰ **เวลาอัปโหลด:** ${new Date().toLocaleString('th-TH')}`;
    }
    
    // 1. Upload to Discord and retrieve dynamic CDN link
    const discordUrl = await uploadFileToDiscord(
      req.tenantId!, 
      req.file.buffer, 
      req.file.originalname, 
      req.file.mimetype,
      customizedMessage
    );
    
    // 2. Add to database attachments table with full url as file_path
    const result = await uploadService.dbAddAttachment(req.params.id as string, discordUrl, req.file.originalname);
    res.json(result);
  } catch (e: any) { 
    console.error('Attachment upload failed:', e);
    res.status(500).json({ error: e.message }); 
  }
});

router.get('/:id/attachments', async (req, res) => {
  try { res.json(await uploadService.dbGetAttachments(req.params.id as string)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/attachments/:id', async (req, res) => {
  try { res.json(await uploadService.dbDeleteAttachment(req.params.id as string)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
