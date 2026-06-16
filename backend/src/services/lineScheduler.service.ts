import { getBangkokDateStr, getBangkokHourMinute } from './lineConfig';
import { runScheduledLineNotifications } from './lineDigest.service';

let lastMorningRunDate = '';
let lastEveningRunDate = '';

function getCronTime(envKey: string, defaultHour: number, defaultMinute: number) {
  const raw = process.env[envKey];
  if (!raw) return { hour: defaultHour, minute: defaultMinute };
  const [h, m] = raw.split(':').map(Number);
  return {
    hour: Number.isFinite(h) ? h : defaultHour,
    minute: Number.isFinite(m) ? m : defaultMinute,
  };
}

async function tick() {
  const { hour, minute } = getBangkokHourMinute();
  const today = getBangkokDateStr();

  const morning = getCronTime('LINE_CRON_MORNING', 7, 0);
  if (hour === morning.hour && minute === morning.minute && lastMorningRunDate !== today) {
    lastMorningRunDate = today;
    console.log('[LINE Cron] Running morning digest...');
    await runScheduledLineNotifications('morning');
  }

  const evening = getCronTime('LINE_CRON_EVENING', 18, 0);
  if (hour === evening.hour && minute === evening.minute && lastEveningRunDate !== today) {
    lastEveningRunDate = today;
    console.log('[LINE Cron] Running evening overdue reminder...');
    await runScheduledLineNotifications('evening');
  }
}

export function startLineScheduler() {
  if (process.env.DISABLE_LINE_CRON === 'true') return;
  if (process.env.VERCEL) return;

  console.log('[LINE Cron] Scheduler started (Asia/Bangkok)');
  setInterval(() => {
    tick().catch((err) => console.error('[LINE Cron] tick error:', err));
  }, 60_000);
  tick().catch((err) => console.error('[LINE Cron] initial tick error:', err));
}
