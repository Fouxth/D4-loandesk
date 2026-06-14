import { calcLateFee, type LendingConfig } from './lendingConfig';

export type LateFeeMode = 'auto' | 'waive' | 'custom';

export interface LoanLateFeeOverride {
  lateFeeMode?: LateFeeMode | string | null;
  late_fee_mode?: LateFeeMode | string | null;
  lateFeeAmount?: number | string | null;
  late_fee_amount?: number | string | null;
  lateFeeNote?: string | null;
  late_fee_note?: string | null;
}

export function getLateFeeMode(loan: LoanLateFeeOverride): LateFeeMode {
  const mode = loan.lateFeeMode ?? loan.late_fee_mode ?? 'auto';
  if (mode === 'waive' || mode === 'custom') return mode;
  return 'auto';
}

export function resolveLateFee(
  lending: LendingConfig,
  loan: LoanLateFeeOverride,
  rawDaysOverdue: number,
  dueDate?: string | null,
): { autoFee: number; effectiveFee: number; daysOverdue: number; hoursOverdue: number; mode: LateFeeMode } {
  const { daysOverdue, hoursOverdue, lateFeeTotal: autoFee } = calcLateFee(lending, rawDaysOverdue, dueDate);
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
