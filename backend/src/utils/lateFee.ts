export type LateFeeMode = 'auto' | 'waive' | 'custom';

export interface LateFeeConfig {
  applyLateFee?: boolean;
  lateFeePerHour?: number;
  lateFeeMaxHours?: number;
  lateFeePerDay?: number;
  lateFeeMaxDays?: number;
}

export interface LoanLateFeeOverride {
  lateFeeMode?: LateFeeMode | string | null;
  late_fee_mode?: LateFeeMode | string | null;
  lateFeeAmount?: number | string | null;
  late_fee_amount?: number | string | null;
}

function calcHoursOverdue(dueDate: string): number {
  const parts = String(dueDate).split('T')[0].split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const [y, m, d] = parts;

  // Cutoff is 18:00:00 on the due date
  const dueCutoff = new Date(y, m - 1, d, 18, 0, 0, 0);
  const now = new Date();

  if (now.getTime() <= dueCutoff.getTime()) {
    return 0;
  }

  const elapsedMs = Math.max(0, now.getTime() - dueCutoff.getTime());
  return Math.floor(elapsedMs / (1000 * 60 * 60));
}

function splitOverdueTime(totalHours: number) {
  return {
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
  };
}

export function calcAutoLateFee(
  config: LateFeeConfig,
  rawDaysOverdue: number,
  dueDate?: string | null,
): { fee: number; hoursOverdue: number; daysOverdue: number } {
  if (!config.applyLateFee) {
    return { fee: 0, hoursOverdue: 0, daysOverdue: 0 };
  }

  const perDay = Number(config.lateFeePerDay) || 0;
  const perHour = Number(config.lateFeePerHour) || 0;

  if (dueDate) {
    const totalHours = calcHoursOverdue(dueDate);
    if (totalHours <= 0) return { fee: 0, hoursOverdue: 0, daysOverdue: 0 };

    const { days, hours } = splitOverdueTime(totalHours);
    return {
      fee: days * perDay + hours * perHour,
      hoursOverdue: hours,
      daysOverdue: days,
    };
  }

  if (perDay <= 0 || rawDaysOverdue <= 0) {
    return { fee: 0, hoursOverdue: 0, daysOverdue: 0 };
  }

  return { fee: rawDaysOverdue * perDay, hoursOverdue: 0, daysOverdue: rawDaysOverdue };
}

/** @deprecated use calcAutoLateFee */
export function calcLateFee(config: LateFeeConfig, rawDaysOverdue: number): number {
  return calcAutoLateFee(config, rawDaysOverdue).fee;
}

export function getLateFeeMode(loan: LoanLateFeeOverride): LateFeeMode {
  const mode = loan.lateFeeMode ?? loan.late_fee_mode ?? 'auto';
  if (mode === 'waive' || mode === 'custom') return mode;
  return 'auto';
}

export function resolveLateFee(
  config: LateFeeConfig,
  loan: LoanLateFeeOverride,
  rawDaysOverdue: number,
  dueDate?: string | null,
): { autoFee: number; effectiveFee: number; daysOverdue: number; hoursOverdue: number; mode: LateFeeMode } {
  const { fee: autoFee, hoursOverdue, daysOverdue } = calcAutoLateFee(config, rawDaysOverdue, dueDate);
  const mode = getLateFeeMode(loan);

  if (mode === 'waive') {
    return { autoFee, effectiveFee: 0, daysOverdue, hoursOverdue, mode };
  }
  if (mode === 'custom') {
    const amount = Number(loan.lateFeeAmount ?? loan.late_fee_amount ?? 0);
    return { autoFee, effectiveFee: Math.max(0, amount), daysOverdue, hoursOverdue, mode };
  }
  return { autoFee, effectiveFee: autoFee, daysOverdue, hoursOverdue, mode };
}
