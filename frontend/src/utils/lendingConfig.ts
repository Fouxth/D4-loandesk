import type { LoanCategory } from './loanType';

export const LENDING_RATE_CATEGORIES = [
  { key: 'daily357', label: 'รายวัน 3-5-7' },
  { key: 'daily14', label: 'รายวัน 14' },
  { key: 'daily1224', label: 'รายวัน 12-24' },
  { key: 'monthly', label: 'รายเดือน' },
  { key: 'interestOnly', label: 'ดอกลอย' },
  { key: 'pawn', label: 'รับจำนำ' },
] as const;

export type LendingRateKey = (typeof LENDING_RATE_CATEGORIES)[number]['key'];

export type CategoryInterestRates = Record<LendingRateKey, number>;

export interface LendingConfig {
  categoryRates: CategoryInterestRates;
  /** เปิดคิดค่าปรับล่าช้าทุกสัญญา */
  applyLateFee: boolean;
  /** ท+ป ทบ — 0 = ตามยอดส่งรายวันของสัญญา */
  tpRollAmount: number;
  /** ท+ป จ่าย — 0 = ตามยอดส่งรายวันของสัญญา */
  tpPayAmount: number;
  /** ท+ป ปรับ (บาทต่อครั้ง) */
  tpPenaltyAmount: number;
  /** ค่าปรับจ่ายช้า (บาท/ชั่วโมง) — ใช้เมื่อ > 0 */
  lateFeePerHour: number;
  /** จำกัดชั่วโมงคิดค่าปรับสูงสุด (0 = ไม่จำกัด) */
  lateFeeMaxHours: number;
  /** @deprecated ใช้ lateFeePerHour แทน */
  lateFeePerDay: number;
  /** @deprecated ใช้ lateFeeMaxHours แทน */
  lateFeeMaxDays: number;
  deductInterestUpfront: boolean;
}

export const DEFAULT_CATEGORY_RATES: CategoryInterestRates = {
  daily357: 25,
  daily14: 40,
  daily1224: 10,
  monthly: 10,
  interestOnly: 2,
  pawn: 10,
};

export const DEFAULT_LENDING_CONFIG: LendingConfig = {
  categoryRates: { ...DEFAULT_CATEGORY_RATES },
  applyLateFee: false,
  tpRollAmount: 0,
  tpPayAmount: 0,
  tpPenaltyAmount: 100,
  lateFeePerHour: 0,
  lateFeeMaxHours: 0,
  lateFeePerDay: 200,
  lateFeeMaxDays: 0,
  deductInterestUpfront: true,
};

function calcHoursOverdue(dueDate: string): number {
  const due = new Date(String(dueDate).split('T')[0]);
  if (isNaN(due.getTime())) return 0;
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60)));
}

export function calcLateFee(
  lending: LendingConfig,
  rawDaysOverdue: number,
  dueDate?: string | null,
): { daysOverdue: number; hoursOverdue: number; lateFeeTotal: number } {
  if (!lending.applyLateFee || rawDaysOverdue <= 0) {
    return { daysOverdue: 0, hoursOverdue: 0, lateFeeTotal: 0 };
  }

  const perHour = Number(lending.lateFeePerHour) || 0;
  if (perHour > 0 && dueDate) {
    let hours = calcHoursOverdue(dueDate);
    if (hours <= 0) return { daysOverdue: rawDaysOverdue, hoursOverdue: 0, lateFeeTotal: 0 };
    const maxHours = Number(lending.lateFeeMaxHours) || 0;
    if (maxHours > 0) hours = Math.min(hours, maxHours);
    return { daysOverdue: rawDaysOverdue, hoursOverdue: hours, lateFeeTotal: hours * perHour };
  }

  const rate = Number(lending.lateFeePerDay) || 0;
  if (rate <= 0) return { daysOverdue: rawDaysOverdue, hoursOverdue: 0, lateFeeTotal: 0 };

  let days = rawDaysOverdue;
  const maxDays = Number(lending.lateFeeMaxDays) || 0;
  if (maxDays > 0) days = Math.min(days, maxDays);

  return { daysOverdue: days, hoursOverdue: 0, lateFeeTotal: days * rate };
}

const CATEGORY_TO_RATE_KEY: Partial<Record<LoanCategory, LendingRateKey>> = {
  'รายวัน 3-5-7': 'daily357',
  'รายวัน 14': 'daily14',
  'รายวัน 12-24': 'daily1224',
  'รายเดือน': 'monthly',
  'ดอกลอย': 'interestOnly',
  'รับจำนำ': 'pawn',
};

export function normalizeLendingConfig(raw?: Record<string, unknown> | null): LendingConfig {
  const legacyDefault = Number(raw?.defaultInterestRate);
  const fallback = Number.isFinite(legacyDefault) ? legacyDefault : DEFAULT_CATEGORY_RATES.monthly;
  const rawRates = (raw?.categoryRates ?? {}) as Partial<CategoryInterestRates>;

  const categoryRates = { ...DEFAULT_CATEGORY_RATES };
  for (const { key } of LENDING_RATE_CATEGORIES) {
    const value = rawRates[key];
    categoryRates[key] = Number.isFinite(value) ? Number(value) : fallback;
  }

  return {
    categoryRates,
    applyLateFee: raw?.applyLateFee ?? DEFAULT_LENDING_CONFIG.applyLateFee,
    tpRollAmount: Number(raw?.tpRollAmount ?? DEFAULT_LENDING_CONFIG.tpRollAmount),
    tpPayAmount: Number(raw?.tpPayAmount ?? DEFAULT_LENDING_CONFIG.tpPayAmount),
    tpPenaltyAmount: Number(raw?.tpPenaltyAmount ?? DEFAULT_LENDING_CONFIG.tpPenaltyAmount),
    lateFeePerHour: Number(raw?.lateFeePerHour ?? DEFAULT_LENDING_CONFIG.lateFeePerHour),
    lateFeeMaxHours: Number(raw?.lateFeeMaxHours ?? DEFAULT_LENDING_CONFIG.lateFeeMaxHours),
    lateFeePerDay: Number(raw?.lateFeePerDay ?? DEFAULT_LENDING_CONFIG.lateFeePerDay),
    lateFeeMaxDays: Number(raw?.lateFeeMaxDays ?? DEFAULT_LENDING_CONFIG.lateFeeMaxDays),
    deductInterestUpfront: raw?.deductInterestUpfront ?? DEFAULT_LENDING_CONFIG.deductInterestUpfront,
  };
}

export function getInterestRateForCategory(
  lending: LendingConfig,
  category: LoanCategory,
): number {
  const key = CATEGORY_TO_RATE_KEY[category];
  if (key) return lending.categoryRates[key];
  return lending.categoryRates.monthly;
}
