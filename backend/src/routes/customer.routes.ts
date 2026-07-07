import { Router } from 'express';
import multer from 'multer';
import * as customerService from '../services/customers.service';
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

router.get('/', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbGetCustomers(req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /customers'); }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbGetCustomerById(req.params.id as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'GET /customers/:id'); }
});

router.post('/', upload.single('idDocument'), async (req: AuthRequest, res) => {
  try {
    const body: any = { ...req.body };
    if (req.file) {
      body.idDocumentUrl = await uploadFileToDiscord(
        req.tenantId!,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        `เอกสารลูกค้า ${body.fullName || ''}`,
      );
      body.idDocumentFileName = req.file.originalname;
    }
    res.json(await customerService.dbCreateCustomer(body, req.userId!, req.tenantId!));
  }
  catch (e) { handleRouteError(e, res, 'POST /customers'); }
});

router.put('/:id', upload.single('idDocument'), async (req: AuthRequest, res) => {
  try {
    const body: any = { ...req.body };
    if (req.file) {
      body.idDocumentUrl = await uploadFileToDiscord(
        req.tenantId!,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        `เอกสารลูกค้า ${body.fullName || req.params.id}`,
      );
      body.idDocumentFileName = req.file.originalname;
    }
    res.json(await customerService.dbUpdateCustomer(req.params.id as string, body, req.tenantId!));
  }
  catch (e) { handleRouteError(e, res, 'PUT /customers/:id'); }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try { res.json(await customerService.dbDeleteCustomer(req.params.id as string, req.tenantId!)); }
  catch (e) { handleRouteError(e, res, 'DELETE /customers/:id'); }
});

export default router;

