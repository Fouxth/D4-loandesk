import { getBangkokDateStr, getBangkokHourMinute } from './lineConfig';
import { runAllTenantsBackup } from './backup.service';

let lastBackupRunDate = '';

async function tick() {
  const { hour, minute } = getBangkokHourMinute();
  const today = getBangkokDateStr();

  const backupTime = process.env.BACKUP_CRON_TIME || '00:00';
  const [h, m] = backupTime.split(':').map(Number);
  const targetHour = Number.isFinite(h) ? h : 0;
  const targetMinute = Number.isFinite(m) ? m : 0;

  if (hour === targetHour && minute === targetMinute && lastBackupRunDate !== today) {
    lastBackupRunDate = today;
    console.log('[Backup Cron] Starting daily automated database backup to Discord...');
    try {
      const results = await runAllTenantsBackup();
      console.log(`[Backup Cron] ✅ Automated backup completed for ${results.length} tenants.`);
    } catch (err: any) {
      console.error('[Backup Cron] ❌ Backup failed:', err.message);
    }
  }
}

export function startBackupScheduler() {
  if (process.env.DISABLE_BACKUP_CRON === 'true') return;
  if (process.env.VERCEL) return;

  setInterval(() => {
    tick().catch((err) => console.error('[Backup Cron] tick error:', err));
  }, 60_000);
}
