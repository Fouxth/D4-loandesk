import { daysBetween } from './format';

export type LoanCategory =
  | 'รายวัน 3-5-7'
  | 'รายวัน 14'
  | 'รายวัน 12-24'
  | 'รายเดือน'
  | 'ดอกลอย'
  | 'รับจำนำ'
  | 'อื่นๆ';

const SHEET_CATEGORY_MAP: Record<string, LoanCategory> = {
  'รายวัน 3-5-7 วัน': 'รายวัน 3-5-7',
  'รายวัน14วัน': 'รายวัน 14',
  'รายวัน12-24วัน': 'รายวัน 12-24',
  'รายเดือน': 'รายเดือน',
  'ดอกลอย': 'ดอกลอย',
  'รับจำนำ': 'รับจำนำ',
};

function periodDays(loan: {
  installmentsCount?: number;
  installments_count?: number;
  startDate?: string;
  start_date?: string;
  dueDate?: string | null;
  due_date?: string | null;
}): number {
  const installments = Number(loan.installmentsCount ?? loan.installments_count ?? 0);
  if (installments > 0) return installments;

  const start = loan.startDate ?? loan.start_date;
  const due = loan.dueDate ?? loan.due_date;
  if (start && due) return Math.abs(daysBetween(start, due));

  return 0;
}

/** วิเคราะห์ประเภทสัญญาจาก notes, งวด, หรือช่วงวันเริ่ม–ครบกำหนด */
export function getLoanCategory(loan: {
  notes?: string | null;
  isPawn?: boolean;
  is_pawn?: boolean;
  isInterestOnly?: boolean;
  is_interest_only?: boolean;
  isIndefinite?: boolean;
  is_indefinite?: boolean;
  paymentType?: string;
  payment_type?: string;
  installmentsCount?: number;
  installments_count?: number;
  startDate?: string;
  start_date?: string;
  dueDate?: string | null;
  due_date?: string | null;
}): LoanCategory {
  const notes = loan.notes ?? '';
  const sheetMatch = notes.match(/นำเข้าจาก ([^;(]+)/);
  if (sheetMatch) {
    const sheet = sheetMatch[1].trim();
    if (SHEET_CATEGORY_MAP[sheet]) return SHEET_CATEGORY_MAP[sheet];
    if (sheet.includes('3-5-7') || sheet.includes('3 5 7')) return 'รายวัน 3-5-7';
    if (sheet.includes('14')) return 'รายวัน 14';
    if (sheet.includes('12-24') || sheet.includes('12 24')) return 'รายวัน 12-24';
  }

  const isPawn = loan.isPawn ?? loan.is_pawn;
  const isInterestOnly = loan.isInterestOnly ?? loan.is_interest_only;
  const isIndefinite = loan.isIndefinite ?? loan.is_indefinite;
  const paymentType = loan.paymentType ?? loan.payment_type ?? 'daily';

  if (isPawn) return 'รับจำนำ';
  if (isInterestOnly && isIndefinite) {
    return paymentType === 'monthly' ? 'รายเดือน' : 'ดอกลอย';
  }

  const days = periodDays(loan);

  if (paymentType === 'daily') {
    if ([3, 5, 7].includes(days)) return 'รายวัน 3-5-7';
    if (days === 14) return 'รายวัน 14';
    if (days >= 12 && days <= 24) return 'รายวัน 12-24';
  }

  if (paymentType === 'monthly') return 'รายเดือน';

  return 'อื่นๆ';
}

export const LOAN_CATEGORY_OPTIONS: LoanCategory[] = [
  'รายวัน 3-5-7',
  'รายวัน 14',
  'รายวัน 12-24',
  'รายเดือน',
  'ดอกลอย',
  'รับจำนำ',
];
