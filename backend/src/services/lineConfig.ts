export type LineEventType =
  | 'payment'
  | 'loan'
  | 'expense'
  | 'fraud'
  | 'refinance'
  | 'completed'
  | 'pawn_forfeited'
  | 'morning_digest'
  | 'overdue_alert'
  | 'late_fee';

export interface LineNotifyConfig {
  enabled?: boolean;
  userId?: string;
  userIds?: string[];
  token?: string;
  events?: Partial<Record<LineEventType, boolean>>;
}

export const DEFAULT_LINE_EVENTS: Record<LineEventType, boolean> = {
  payment: true,
  loan: true,
  expense: true,
  fraud: true,
  refinance: true,
  completed: true,
  pawn_forfeited: true,
  morning_digest: true,
  overdue_alert: true,
  late_fee: true,
};

export function resolveLineRecipients(config: LineNotifyConfig): string[] {
  const ids = new Set<string>();
  for (const id of config.userIds ?? []) {
    const trimmed = String(id).trim();
    if (trimmed) ids.add(trimmed);
  }
  const legacy = config.userId?.trim();
  if (legacy) ids.add(legacy);
  return [...ids];
}

export function parseUserIdsInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatUserIdsInput(ids: string[]): string {
  return ids.join('\n');
}

export function isLineEventEnabled(
  config: LineNotifyConfig,
  eventType: LineEventType,
): boolean {
  if (config.events && config.events[eventType] === false) return false;
  return true;
}

export function getBangkokDateStr(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
}

export function getBangkokHourMinute(date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { hour, minute };
}
