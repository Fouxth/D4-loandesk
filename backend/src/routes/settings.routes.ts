import { Router } from 'express';
import sql from '../db';

const router = Router();

// Get all settings
router.get('/', async (_req, res) => {
  try {
    const settings = await sql`SELECT * FROM settings`;
    const result = settings.reduce((acc: any, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Update specific setting
router.post('/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  
  // Ensure we are saving the correct object structure
  const dataToSave = value !== undefined ? value : req.body;

  try {
    await sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (${key}, ${dataToSave}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO 
      UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;
    res.json({ message: 'Setting updated successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
