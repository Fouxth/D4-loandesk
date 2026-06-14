import * as XLSX from 'xlsx';
import { addDays, isoToBeShort, parseThaiDate, todayIso } from './thaiDate';
import { buildTpNote, DEFAULT_TP_CONFIG, isTpCell } from './tpPenalty';
import {
  calcTpExtraOwed,
  calcTpSettlementAmount,
  resolveTpComponents,
  type TpConfig,
} from '../utils/tpPayment';
import type { ParsedLoan, ParsedPayment, ParseResult } from './types';

const CURRENT_PORTFOLIO_SHEETS = new Set(['ดอกลอย', 'รายเดือน', 'รับจำนำ']);

export function filterLoansByBeYear(loans: ParsedLoan[], beYear: number): ParsedLoan[] {
  return loans.filter((loan) => {
    if (CURRENT_PORTFOLIO_SHEETS.has(loan.sourceSheet)) return true;
    return isoToBeShort(loan.startDate) === beYear;
  });
}

type Row = unknown[];

const SKIP_NAMES = new Set(['รวมทั้งหมด', 'ชื่อ', 'รายเดือน', 'รับจำนำ', 'เรทราคา']);

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/\.-/g, ''));
  return isNaN(n) ? null : n;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function isPaymentAmount(value: unknown): number | null {
  const n = toNumber(value);
  if (n != null && n > 0) return n;
  return null;
}

function calcLoanAmounts(principal: number, installment: number, installments: number, isInterestOnly: boolean) {
  const totalPayable = isInterestOnly ? principal : installment * installments;
  const interestAmount = Math.max(totalPayable - principal, 0);
  const interestRate = principal > 0 ? (interestAmount / principal) * 100 : 0;
  return { totalPayable, interestAmount, interestRate: Math.round(interestRate * 100) / 100 };
}

function inferStatus(
  paidCount: number,
  installmentsCount: number,
  dueDate: string | null,
  forceCompleted = false,
): 'active' | 'completed' | 'overdue' {
  if (forceCompleted || (installmentsCount > 0 && paidCount >= installmentsCount)) return 'completed';
  if (dueDate && dueDate < todayIso()) return 'overdue';
  return 'active';
}

function countPaidInstallments(payments: ParsedPayment[]): number {
  return payments.filter((p) => p.category !== 'roll_penalty').length;
}

function parseDayPayments(
  row: Row,
  dayStartCol: number,
  dayCount: number,
  startDate: string,
  defaultAmount: number,
  principal: number,
  tpConfig: TpConfig,
): { payments: ParsedPayment[]; notes: string[]; rollCount: number } {
  const payments: ParsedPayment[] = [];
  const notes: string[] = [];
  let priorPaidCount = 0;
  let priorPaidTotal = 0;
  let rollCount = 0;

  for (let i = 0; i < dayCount; i++) {
    const cell = row[dayStartCol + i];
    const amount = isPaymentAmount(cell);
    if (amount != null) {
      priorPaidCount++;
      priorPaidTotal += amount;
      payments.push({
        paymentDate: addDays(startDate, i),
        amount,
        installmentNumber: i + 1,
        category: 'principal',
      });
    } else if (isTpCell(cell)) {
      const { roll, penalty } = resolveTpComponents(defaultAmount, tpConfig);
      const tpNote = buildTpNote(
        i + 1,
        principal,
        defaultAmount,
        priorPaidCount,
        priorPaidTotal,
        tpConfig,
      );
      rollCount++;
      payments.push({
        paymentDate: addDays(startDate, i),
        amount: 0,
        installmentNumber: i + 1,
        category: 'roll_penalty',
        notes: tpNote,
        rolledAmount: roll,
        penaltyAmount: penalty,
      });
      notes.push(tpNote);
    } else if (cell != null && String(cell).trim() && !String(cell).trim().match(/^0$/)) {
      const text = String(cell).trim();
      if (!text.startsWith('#')) notes.push(`งวด${i + 1}: ${text}`);
    }
  }

  return { payments, notes, rollCount };
}

function findDayColumns(header: Row): { startCol: number; count: number } {
  let startCol = -1;
  let count = 0;
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? '').trim();
    if (h.includes('วันที่')) {
      if (startCol === -1) startCol = i;
      count++;
    }
  }
  return { startCol, count };
}

function isDayCellFilled(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return Boolean(text && text !== '0');
}

/** อนุมานจำนวนงวดจริงจากแถว Excel (ไม่ใช่จำนวนคอลัมน์สูงสุดในหัวตาราง) */
function inferInstallmentsCount(row: Row, startCol: number, maxDayCols: number): number {
  let lastAny = 0;
  for (let i = 0; i < maxDayCols; i++) {
    if (isDayCellFilled(row[startCol + i])) lastAny = i + 1;
  }
  if (lastAny === 0) return 12;

  for (let i = 12; i < maxDayCols; i++) {
    if (isDayCellFilled(row[startCol + i])) return lastAny;
  }

  return 12;
}

/** รายวัน 3-5-7 วัน — 3 parallel blocks */
export function parseDaily357Sheet(rows: Row[], sheetName: string): ParseResult {
  const loans: ParsedLoan[] = [];
  const skipped: ParseResult['skipped'] = [];
  const blocks = [
    { startCol: 0, installments: 3 },
    { startCol: 8, installments: 5 },
    { startCol: 16, installments: 7 },
  ];

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    for (const block of blocks) {
      const name = normalizeName(String(row[block.startCol] ?? ''));
      const principal = toNumber(row[block.startCol + 1]);
      const startDate = parseThaiDate(row[block.startCol + 2]);
      const endDate = parseThaiDate(row[block.startCol + 3]);
      const totalPaid = toNumber(row[block.startCol + 4]);

      if (!name || SKIP_NAMES.has(name)) continue;
      if (principal == null || principal <= 0) {
        skipped.push({ sheet: sheetName, row: r + 1, reason: `ข้าม ${name}: ไม่มียอดต้น` });
        continue;
      }

      const installments = block.installments;
      const totalPayable = totalPaid ?? principal;
      const installmentAmount = Math.round(totalPayable / installments);
      const { interestAmount, interestRate } = calcLoanAmounts(principal, installmentAmount, installments, false);
      const dueDate = endDate ?? (startDate ? addDays(startDate, installments) : null);
      const completed = totalPaid != null && totalPaid > 0;

      loans.push({
        customerName: name,
        sourceSheet: sheetName,
        principal,
        installmentAmount,
        installmentsCount: installments,
        paymentType: 'daily',
        interestRate,
        interestAmount,
        totalPayable,
        startDate: startDate ?? todayIso(),
        dueDate,
        status: inferStatus(completed ? installments : 0, installments, dueDate, completed),
        notes: `นำเข้าจาก ${sheetName} (${installments} วัน)`,
        isInterestOnly: false,
        isIndefinite: false,
        isPawn: false,
        pawnItem: null,
        payments: completed && startDate
          ? [{ paymentDate: dueDate ?? startDate, amount: totalPayable, installmentNumber: 1 }]
          : [],
      });
    }
  }

  return { loans, skipped };
}

/** รายวัน 14 วัน / รายวัน 12-24 วัน — wide grid */
export function parseDailyGridSheet(
  rows: Row[],
  sheetName: string,
  defaultInstallments?: number,
  tpConfig?: TpConfig,
): ParseResult {
  const loans: ParsedLoan[] = [];
  const skipped: ParseResult['skipped'] = [];
  if (rows.length < 2) return { loans, skipped };

  const header = rows[0] || [];
  const { startCol, count: maxDayCols } = findDayColumns(header);
  if (startCol === -1 || maxDayCols === 0) {
    skipped.push({ sheet: sheetName, row: 1, reason: 'ไม่พบคอลัมน์ วันที่' });
    return { loans, skipped };
  }

  const resolvedTpConfig = tpConfig ?? DEFAULT_TP_CONFIG;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = normalizeName(String(row[0] ?? ''));
    const principal = toNumber(row[1]);
    const installmentAmount = toNumber(row[2]);
    const startDate = parseThaiDate(row[3]);

    if (!name || SKIP_NAMES.has(name)) continue;
    if (principal == null || principal <= 0) {
      skipped.push({ sheet: sheetName, row: r + 1, reason: `ข้าม ${name}: ไม่มียอดต้น` });
      continue;
    }
    if (installmentAmount == null || installmentAmount <= 0) {
      skipped.push({ sheet: sheetName, row: r + 1, reason: `ข้าม ${name}: ไม่มียอดส่งวันละ` });
      continue;
    }

    const effectiveStart = startDate ?? todayIso();
    const installmentsCount = defaultInstallments ?? inferInstallmentsCount(row, startCol, maxDayCols);
    const { totalPayable, interestAmount, interestRate } = calcLoanAmounts(
      principal,
      installmentAmount,
      installmentsCount,
      false,
    );
    const dueDate = addDays(effectiveStart, installmentsCount);
    const { payments, notes, rollCount } = parseDayPayments(
      row,
      startCol,
      installmentsCount,
      effectiveStart,
      installmentAmount,
      principal,
      resolvedTpConfig,
    );
    const paidInstallments = countPaidInstallments(payments);
    const regularPaid = payments
      .filter((p) => p.category !== 'roll_penalty')
      .reduce((a, p) => a + p.amount, 0);
    const tpSettlement = rollCount * calcTpSettlementAmount(installmentAmount, resolvedTpConfig);
    const paidTotal = regularPaid + tpSettlement;
    const totalOwed =
      rollCount > 0
        ? totalPayable + rollCount * calcTpExtraOwed(installmentAmount, resolvedTpConfig)
        : totalPayable;
    const status =
      paidTotal >= totalOwed - 0.01
        ? 'completed'
        : inferStatus(paidInstallments, installmentsCount, dueDate);
    const noteParts = [`นำเข้าจาก ${sheetName}`];
    if (rollCount > 0) noteParts.push(`ท+ป ${rollCount} ครั้ง`);
    noteParts.push(...notes.filter((n) => !n.startsWith('ท+ป')));

    loans.push({
      customerName: name,
      sourceSheet: sheetName,
      principal,
      installmentAmount,
      installmentsCount,
      paymentType: 'daily',
      interestRate,
      interestAmount,
      totalPayable,
      startDate: effectiveStart,
      dueDate,
      status,
      notes: noteParts.filter(Boolean).join('; '),
      isInterestOnly: false,
      isIndefinite: false,
      isPawn: false,
      pawnItem: null,
      payments,
    });
  }

  return { loans, skipped };
}

/** รายเดือน */
export function parseMonthlySheet(rows: Row[], sheetName: string): ParseResult {
  const loans: ParsedLoan[] = [];
  const skipped: ParseResult['skipped'] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = normalizeName(String(row[0] ?? ''));
    const principal = toNumber(row[1]);
    const dueDay = toNumber(row[2]);
    const installmentAmount = toNumber(row[3]);

    if (!name || SKIP_NAMES.has(name)) continue;
    if (principal == null || principal <= 0) continue;
    if (installmentAmount == null || installmentAmount <= 0) continue;

    const interestRate = principal > 0 ? Math.round((installmentAmount / principal) * 10000) / 100 : 0;
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay ?? 1, 28)).padStart(2, '0')}`;

    loans.push({
      customerName: name,
      sourceSheet: sheetName,
      principal,
      installmentAmount,
      installmentsCount: 0,
      paymentType: 'monthly',
      interestRate,
      interestAmount: installmentAmount,
      totalPayable: principal,
      startDate,
      dueDate: null,
      status: 'active',
      notes: `นำเข้าจาก ${sheetName}; ชำระทุกวันที่ ${dueDay ?? '-'}`,
      isInterestOnly: true,
      isIndefinite: true,
      isPawn: false,
      pawnItem: null,
      payments: [],
    });
  }

  return { loans, skipped };
}

/** ดอกลอย */
export function parseInterestOnlySheet(rows: Row[], sheetName: string): ParseResult {
  const loans: ParsedLoan[] = [];
  const skipped: ParseResult['skipped'] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = normalizeName(String(row[0] ?? ''));
    const principal = toNumber(row[1]);
    const dailyAmount = toNumber(row[2]);

    if (!name || SKIP_NAMES.has(name)) continue;
    if (principal == null || principal <= 0) continue;
    if (dailyAmount == null || dailyAmount <= 0) continue;

    const interestRate = principal > 0 ? Math.round((dailyAmount / principal) * 10000) / 100 : 0;

    loans.push({
      customerName: name,
      sourceSheet: sheetName,
      principal,
      installmentAmount: dailyAmount,
      installmentsCount: 0,
      paymentType: 'daily',
      interestRate,
      interestAmount: dailyAmount,
      totalPayable: principal,
      startDate: todayIso(),
      dueDate: null,
      status: 'active',
      notes: `นำเข้าจาก ${sheetName} (ดอกลอย)`,
      isInterestOnly: true,
      isIndefinite: true,
      isPawn: false,
      pawnItem: null,
      payments: [],
    });
  }

  return { loans, skipped };
}

/** รับจำนำ */
export function parsePawnSheet(rows: Row[], sheetName: string): ParseResult {
  const loans: ParsedLoan[] = [];
  const skipped: ParseResult['skipped'] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const item = normalizeName(String(row[0] ?? ''));
    const principal = toNumber(row[1]);
    const dueDay = toNumber(row[2]);
    const installmentAmount = toNumber(row[3]);
    const extraNote = String(row[4] ?? '').trim();

    if (!item || SKIP_NAMES.has(item)) continue;
    if (principal == null || principal <= 0) continue;
    if (installmentAmount == null || installmentAmount <= 0) continue;

    const interestRate = principal > 0 ? Math.round((installmentAmount / principal) * 10000) / 100 : 0;
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay ?? 1, 28)).padStart(2, '0')}`;
    const notes = [`นำเข้าจาก ${sheetName}`, `ชำระทุกวันที่ ${dueDay ?? '-'}`, extraNote].filter(Boolean).join('; ');

    loans.push({
      customerName: item,
      sourceSheet: sheetName,
      principal,
      installmentAmount,
      installmentsCount: 0,
      paymentType: 'monthly',
      interestRate,
      interestAmount: installmentAmount,
      totalPayable: principal,
      startDate,
      dueDate: null,
      status: 'active',
      notes,
      isInterestOnly: true,
      isIndefinite: true,
      isPawn: true,
      pawnItem: item,
      payments: [],
    });
  }

  return { loans, skipped };
}

const SHEET_PARSERS: Record<string, (rows: Row[], tpConfig?: TpConfig) => ParseResult> = {
  'รายวัน 3-5-7 วัน': (rows) => parseDaily357Sheet(rows, 'รายวัน 3-5-7 วัน'),
  'รายวัน14วัน': (rows, tp) => parseDailyGridSheet(rows, 'รายวัน14วัน', 14, tp),
  'รายวัน12-24วัน': (rows, tp) => parseDailyGridSheet(rows, 'รายวัน12-24วัน', undefined, tp),
  'รายเดือน': (rows) => parseMonthlySheet(rows, 'รายเดือน'),
  'ดอกลอย': (rows) => parseInterestOnlySheet(rows, 'ดอกลอย'),
  'รับจำนำ': (rows) => parsePawnSheet(rows, 'รับจำนำ'),
};

export function parseWorkbook(
  filePath: string,
  beYear?: number,
  options?: { tpConfig?: TpConfig },
): ParseResult {
  const wb = XLSX.readFile(filePath);
  const allLoans: ParsedLoan[] = [];
  const allSkipped: ParseResult['skipped'] = [];

  const tpConfig = options?.tpConfig ?? DEFAULT_TP_CONFIG;

  for (const sheetName of wb.SheetNames) {
    const parser = SHEET_PARSERS[sheetName];
    if (!parser) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: '', raw: false });
    const result = parser(rows, tpConfig);
    allLoans.push(...result.loans);
    allSkipped.push(...result.skipped);
  }

  const loans = beYear != null ? filterLoansByBeYear(allLoans, beYear) : allLoans;
  return { loans, skipped: allSkipped };
}
