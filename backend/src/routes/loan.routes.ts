import { Router } from 'express';
import * as loanService from '../services/loans.service';
import * as uploadService from '../services/upload.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/loans';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

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
  try { res.json(await loanService.getLoansByCustomerId(req.params.customerId as string)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try { res.json(await loanService.getLoanById(req.params.id as string)); }
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

router.put('/:id', async (req, res) => {
  try { res.json(await loanService.dbUpdateLoan(req.params.id as string, req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    res.json(await loanService.dbDeleteLoan(req.params.id as string));
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Attachments
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadService.dbAddAttachment(req.params.id as string, req.file.path, req.file.originalname);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
