import { Router } from 'express';
import multer from 'multer';
import * as customerService from '../services/customers.service';
import * as uploadService from '../services/upload.service';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { handleRouteError } from '../utils/apiError';
import { uploadFileToDiscord } from '../services/discord.service';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

// Attachments (documents, contract photos, ID card photos, etc. — unlimited count per customer)
router.post('/:id/attachments', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const customer = await customerService.dbGetCustomerById(req.params.id as string, req.tenantId!);
    let customizedMessage = `📎 อัปโหลดเอกสารลูกค้าจากระบบของ ${req.tenantId!}`;
    if (customer) {
      customizedMessage = `📎 **มีเอกสารลูกค้าใหม่ถูกแนบเข้าระบบ!**\n👤 **ลูกค้า:** \`${customer.fullName}\`\n📂 **ไฟล์ต้นทาง:** \`${req.file.originalname}\`\n⏰ **เวลาอัปโหลด:** ${new Date().toLocaleString('th-TH')}`;
    }

    const discordUrl = await uploadFileToDiscord(
      req.tenantId!,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      customizedMessage,
    );

    const result = await uploadService.dbAddCustomerAttachment(req.params.id as string, discordUrl, req.file.originalname);
    res.json(result);
  } catch (e) {
    handleRouteError(e, res, 'POST /customers/:id/attachments');
  }
});

router.get('/:id/attachments', async (req: AuthRequest, res) => {
  try { res.json(await uploadService.dbGetCustomerAttachments(req.params.id as string)); }
  catch (e) { handleRouteError(e, res, 'GET /customers/:id/attachments'); }
});

router.delete('/attachments/:id', async (req: AuthRequest, res) => {
  try { res.json(await uploadService.dbDeleteCustomerAttachment(req.params.id as string)); }
  catch (e) { handleRouteError(e, res, 'DELETE /customers/attachments/:id'); }
});

export default router;
