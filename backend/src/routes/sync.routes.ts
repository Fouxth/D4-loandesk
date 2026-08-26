import { Router } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as authService from '../services/auth.service';
import { handleRouteError, ApiError } from '../utils/apiError';
import {
  auditGoogleSheetVsDb,
  syncGoogleSheetToDb,
  fetchSheetBuffer,
  getGoogleSyncConfig,
  saveGoogleSyncConfig,
  type SyncOptions,
} from '../services/googleSync.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

async function requireAdmin(req: AuthRequest, res: any, next: any) {
  try {
    const roles = await authService.getUserRoles(req.userId!);
    if (!roles.includes('admin')) {
      return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ดำเนินการ' });
    }
    next();
  } catch (e) {
    handleRouteError(e, res, 'requireAdmin');
  }
}

// Get Google Sync Config
router.get('/google-sheet/config', async (req: AuthRequest, res) => {
  try {
    const config = await getGoogleSyncConfig(req.tenantId!);
    res.json(config);
  } catch (e) {
    handleRouteError(e, res, 'GET /sync/google-sheet/config');
  }
});

// Save Google Sync Config
router.put('/google-sheet/config', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const config = await saveGoogleSyncConfig(req.tenantId!, req.body);
    res.json(config);
  } catch (e) {
    handleRouteError(e, res, 'PUT /sync/google-sheet/config');
  }
});

// Audit / Reconcile check
router.post('/google-sheet/audit', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    let sheetBuffer: Buffer;
    const body = req.body || {};

    if (req.file) {
      sheetBuffer = req.file.buffer;
    } else {
      const url = body.sheetUrl;
      if (!url) {
        throw new ApiError(400, 'กรุณาระบุ Google Sheets URL หรืออัปโหลดไฟล์ Excel');
      }
      sheetBuffer = await fetchSheetBuffer(url);
    }

    const options: SyncOptions = {
      sheetUrl: body.sheetUrl,
      beYear: body.beYear ? parseInt(body.beYear, 10) : undefined,
      skipClosed: body.skipClosed !== false && body.skipClosed !== 'false',
    };

    const audit = await auditGoogleSheetVsDb(req.tenantId!, sheetBuffer, options);
    res.json(audit);
  } catch (e) {
    handleRouteError(e, res, 'POST /sync/google-sheet/audit');
  }
});

// Apply Sync
router.post('/google-sheet/apply', requireAdmin, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    let sheetBuffer: Buffer;
    const body = req.body || {};

    if (req.file) {
      sheetBuffer = req.file.buffer;
    } else {
      const url = body.sheetUrl;
      if (!url) {
        throw new ApiError(400, 'กรุณาระบุ Google Sheets URL หรืออัปโหลดไฟล์ Excel');
      }
      sheetBuffer = await fetchSheetBuffer(url);
    }

    const options: SyncOptions = {
      sheetUrl: body.sheetUrl,
      beYear: body.beYear ? parseInt(body.beYear, 10) : undefined,
      skipClosed: body.skipClosed !== false && body.skipClosed !== 'false',
    };

    const summary = await syncGoogleSheetToDb(req.tenantId!, req.userId!, sheetBuffer, options);
    
    // Update lastSyncAt in config
    const currentConfig = await getGoogleSyncConfig(req.tenantId!);
    await saveGoogleSyncConfig(req.tenantId!, {
      ...currentConfig,
      sheetUrl: body.sheetUrl || currentConfig.sheetUrl,
      skipClosed: options.skipClosed,
      lastSyncAt: new Date().toISOString(),
    });

    res.json({
      message: 'ซิงค์ข้อมูลสำเร็จเรียบร้อยแล้ว',
      summary,
    });
  } catch (e) {
    handleRouteError(e, res, 'POST /sync/google-sheet/apply');
  }
});

export default router;
