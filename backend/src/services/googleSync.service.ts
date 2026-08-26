import crypto from 'crypto';
import sql from '../db';
import { parseWorkbookFromBuffer, ParseWorkbookOptions } from '../import/excelParsers';
import type { ParsedLoan } from '../import/types';
import {
  tpConfigFromSettings,
  type TpConfig,
} from '../utils/tpPayment';
import { dbLogActivity } from './activity.service';
import { ApiError } from '../utils/apiError';

import { transliterateThai } from '../utils/transliterate';

export interface SyncOptions {
  sheetUrl?: string;
  beYear?: number;
  skipClosed?: boolean;
  sheetNames?: string[];
}

export function normalizeSheetUrl(inputUrl: string): string {
  let url = (inputUrl || '').trim();
  if (!url) throw new ApiError(400, 'กรุณาระบุ URL ของ Google Sheets');

  // Extract sheet ID: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/...
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    const sheetId = match[1];
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  }

  // If already ends with export or format, return as is
  return url;
}

export async function fetchSheetBuffer(inputUrl: string): Promise<Buffer> {
  const exportUrl = normalizeSheetUrl(inputUrl);
  try {
    const response = await fetch(exportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(
          400,
          'ไม่สามารถเข้าถึง Google Sheets ได้ กรุณาเปิดการแชร์เป็น "ทุกคนที่มีลิงก์สามารถดูได้" (Anyone with the link can view)',
        );
      }
      throw new ApiError(400, `ไม่สามารถดาวน์โหลด Google Sheets ได้ (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, `เชื่อมต่อ Google Sheets ไม่สำเร็จ: ${err.message || String(err)}`);
  }
}

export function normName(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeThaiText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\u0e40\u0e40/g, '\u0e41') // double sara-e -> sara-ae
    .replace(/[\u0e48-\u0e4e\u0e3a]/g, '') // strip tone marks & garun
    .replace(/^(พี่|น้อง|ป้า|ลุง|น้า|อา|ช่าง|หมอ|สจ\.|สจ|ผญ\.|ผญ|เฮีย|เจ๊)\s*/g, '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function isThaiNameFuzzyMatch(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const nA = normName(nameA);
  const nB = normName(nameB);
  if (nA === nB) return true;

  const cleanA = normalizeThaiText(nameA);
  const cleanB = normalizeThaiText(nameB);
  if (cleanA && cleanB) {
    if (cleanA === cleanB) return true;
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }

  // Transliterate phonetic check
  const pA = transliterateThai(cleanA).replace(/[^a-z0-9]/g, '');
  const pB = transliterateThai(cleanB).replace(/[^a-z0-9]/g, '');
  if (pA && pB) {
    if (pA === pB) return true;
    if (pA.includes(pB) || pB.includes(pA)) return true;
  }

  return false;
}

function toIsoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function loanKey(startDate: string, principal: number, installmentAmount: number, customerName: string): string {
  return `${startDate}|${Math.round(principal)}|${Math.round(installmentAmount)}|${normName(customerName)}`;
}

export interface PaymentDiff {
  installmentNumber: number;
  date: string;
  amount: number;
  category: string;
  notes?: string;
  action: 'insert' | 'update' | 'match';
  dbAmount?: number;
  dbCategory?: string;
}

export interface LoanDiffItem {
  id?: string;
  loanNumber?: string;
  customerName: string;
  sourceSheet: string;
  principal: number;
  installmentAmount: number;
  installmentsCount: number;
  totalPayable: number;
  startDate: string;
  dueDate: string | null;
  status: 'active' | 'completed' | 'overdue';
  isBlackHighlighted?: boolean;
  rowNumber?: number;
  notes: string;
  // Diff Details
  isNew: boolean;
  fieldChanges?: Record<string, { from: unknown; to: unknown }>;
  paymentDiffs?: PaymentDiff[];
  missingPaymentsCount: number;
  totalPaymentsInSheet: number;
  totalPaymentsInDb: number;
}

export interface AuditResult {
  summary: {
    totalInSheet: number;
    totalActiveInSheet: number;
    blackRowsCount: number;
    totalInDb: number;
    syncedCount: number;
    mismatchedCount: number;
    newLoansCount: number;
    dbOnlyCount: number;
    skippedRowsCount: number;
  };
  loansBySheet: Record<string, { total: number; active: number; black: number }>;
  newLoans: LoanDiffItem[];
  mismatchedLoans: LoanDiffItem[];
  syncedLoans: LoanDiffItem[];
  dbOnlyLoans: Array<{
    id: string;
    loanNumber: string;
    customerName: string;
    principal: number;
    installmentAmount: number;
    startDate: string;
    status: string;
    paidCount: number;
  }>;
  skippedRows: { sheet: string; row: number; reason: string }[];
}

export async function auditGoogleSheetVsDb(
  tenantId: string,
  sheetBuffer: Buffer,
  options: SyncOptions = {},
): Promise<AuditResult> {
  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${tenantId}
  `;
  const tpConfig: TpConfig = tpConfigFromSettings(settingsRow?.value as Record<string, unknown>);

  const parseOpts: ParseWorkbookOptions = {
    tpConfig,
    skipClosed: false, // Parse all first so we can report stats on black vs active
  };

  const { loans: allSheetLoans, skipped: skippedRows } = parseWorkbookFromBuffer(
    sheetBuffer,
    options.beYear,
    parseOpts,
  );

  // Group stats by sheet
  const loansBySheet: Record<string, { total: number; active: number; black: number }> = {};
  let totalBlackCount = 0;

  for (const l of allSheetLoans) {
    if (!loansBySheet[l.sourceSheet]) {
      loansBySheet[l.sourceSheet] = { total: 0, active: 0, black: 0 };
    }
    loansBySheet[l.sourceSheet].total++;
    if (l.isBlackHighlighted || l.status === 'completed') {
      loansBySheet[l.sourceSheet].black++;
      totalBlackCount++;
    } else {
      loansBySheet[l.sourceSheet].active++;
    }
  }

  // Filter if skipClosed is enabled (default: true)
  const shouldSkipClosed = options.skipClosed !== false;
  const targetSheetLoans = shouldSkipClosed
    ? allSheetLoans.filter((l) => !l.isBlackHighlighted && l.status !== 'completed')
    : allSheetLoans;

  // Fetch DB data
  const dbLoans = await sql`
    SELECT l.id, l.loan_number, l.principal, l.installment_amount, l.installments_count,
           l.total_payable, l.start_date, l.due_date, l.status, l.notes,
           l.is_interest_only, l.is_indefinite, l.is_pawn, l.pawn_item,
           c.full_name AS customer_name
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${tenantId}
    ORDER BY l.created_at DESC
  `;

  const dbPayments = await sql`
    SELECT id, loan_id, installment_number, amount, category, payment_date, notes
    FROM payments WHERE tenant_id = ${tenantId}
    ORDER BY loan_id, installment_number
  `;

  const paysByLoan = new Map<string, any[]>();
  for (const p of dbPayments) {
    const list = paysByLoan.get(p.loanId) ?? [];
    list.push(p);
    paysByLoan.set(p.loanId, list);
  }

  // Index Excel by key (queue for multiple identical loans)
  const excelByKey = new Map<string, ParsedLoan[]>();
  for (const loan of targetSheetLoans) {
    const key = loanKey(loan.startDate, loan.principal, loan.installmentAmount, loan.customerName);
    const list = excelByKey.get(key) ?? [];
    list.push(loan);
    excelByKey.set(key, list);
  }

  const matchedDbIds = new Set<string>();
  const syncedLoans: LoanDiffItem[] = [];
  const mismatchedLoans: LoanDiffItem[] = [];
  for (const db of dbLoans) {
    const key = loanKey(
      toIsoDate(db.startDate),
      Number(db.principal),
      Number(db.installmentAmount),
      db.customerName || db.pawnItem || '',
    );
    let parsed: ParsedLoan | undefined;
    const candidates = excelByKey.get(key);
    if (candidates?.length) {
      parsed = candidates.shift()!;
      if (!candidates.length) excelByKey.delete(key);
      else excelByKey.set(key, candidates);
    } else {
      // Fuzzy fallback: match by same date & amounts + Thai fuzzy name similarity
      for (const [exKey, list] of excelByKey) {
        if (!list.length) continue;
        const candidate = list[0];
        const sameNumbers =
          candidate.startDate === toIsoDate(db.startDate) &&
          Math.abs(candidate.principal - Number(db.principal)) < 0.01 &&
          Math.abs(candidate.installmentAmount - Number(db.installmentAmount)) < 0.01;
        if (sameNumbers && isThaiNameFuzzyMatch(db.customerName || db.pawnItem || '', candidate.customerName)) {
          parsed = list.shift()!;
          if (!list.length) excelByKey.delete(exKey);
          else excelByKey.set(exKey, list);
          break;
        }
      }
    }
    if (!parsed) continue;

    matchedDbIds.add(db.id);

    // Compare DB vs Parsed Excel
    const dbPays = paysByLoan.get(db.id) ?? [];
    const fieldChanges: Record<string, { from: unknown; to: unknown }> = {};

    if (Number(db.installmentsCount) !== parsed.installmentsCount) {
      fieldChanges['installmentsCount'] = { from: db.installmentsCount, to: parsed.installmentsCount };
    }
    if (Math.abs(Number(db.totalPayable) - parsed.totalPayable) > 0.01) {
      fieldChanges['totalPayable'] = { from: db.totalPayable, to: parsed.totalPayable };
    }
    if (toIsoDate(db.dueDate) !== (parsed.dueDate || '')) {
      fieldChanges['dueDate'] = { from: toIsoDate(db.dueDate), to: parsed.dueDate };
    }
    if (db.status !== parsed.status) {
      fieldChanges['status'] = { from: db.status, to: parsed.status };
    }

    // Compare Payments
    const paymentDiffs: PaymentDiff[] = [];
    let missingPaymentsCount = 0;

    for (const exP of parsed.payments) {
      const dbP = dbPays.find((p) => Number(p.installmentNumber) === exP.installmentNumber);
      if (!dbP) {
        missingPaymentsCount++;
        paymentDiffs.push({
          installmentNumber: exP.installmentNumber,
          date: exP.paymentDate,
          amount: exP.amount,
          category: exP.category ?? 'principal',
          notes: exP.notes,
          action: 'insert',
        });
      } else {
        const amountDiff = Math.abs(Number(dbP.amount) - exP.amount) > 0.01;
        const catDiff = (dbP.category || 'principal') !== (exP.category || 'principal');
        if (amountDiff || catDiff) {
          paymentDiffs.push({
            installmentNumber: exP.installmentNumber,
            date: exP.paymentDate,
            amount: exP.amount,
            category: exP.category ?? 'principal',
            notes: exP.notes,
            action: 'update',
            dbAmount: Number(dbP.amount),
            dbCategory: dbP.category,
          });
        }
      }
    }

    const hasDiff = Object.keys(fieldChanges).length > 0 || paymentDiffs.length > 0;
    const diffItem: LoanDiffItem = {
      id: db.id,
      loanNumber: db.loanNumber,
      customerName: parsed.customerName,
      sourceSheet: parsed.sourceSheet,
      principal: parsed.principal,
      installmentAmount: parsed.installmentAmount,
      installmentsCount: parsed.installmentsCount,
      totalPayable: parsed.totalPayable,
      startDate: parsed.startDate,
      dueDate: parsed.dueDate,
      status: parsed.status,
      isBlackHighlighted: parsed.isBlackHighlighted,
      rowNumber: parsed.rowNumber,
      notes: parsed.notes,
      isNew: false,
      fieldChanges: hasDiff ? fieldChanges : undefined,
      paymentDiffs: paymentDiffs.length > 0 ? paymentDiffs : undefined,
      missingPaymentsCount,
      totalPaymentsInSheet: parsed.payments.length,
      totalPaymentsInDb: dbPays.length,
    };

    if (hasDiff) {
      mismatchedLoans.push(diffItem);
    } else {
      syncedLoans.push(diffItem);
    }
  }

  // Loans in Excel that were not matched in DB -> newLoans
  const newLoans: LoanDiffItem[] = [];
  for (const [, list] of excelByKey) {
    for (const loan of list) {
      newLoans.push({
        customerName: loan.customerName,
        sourceSheet: loan.sourceSheet,
        principal: loan.principal,
        installmentAmount: loan.installmentAmount,
        installmentsCount: loan.installmentsCount,
        totalPayable: loan.totalPayable,
        startDate: loan.startDate,
        dueDate: loan.dueDate,
        status: loan.status,
        isBlackHighlighted: loan.isBlackHighlighted,
        rowNumber: loan.rowNumber,
        notes: loan.notes,
        isNew: true,
        missingPaymentsCount: loan.payments.length,
        totalPaymentsInSheet: loan.payments.length,
        totalPaymentsInDb: 0,
        paymentDiffs: loan.payments.map((p) => ({
          installmentNumber: p.installmentNumber,
          date: p.paymentDate,
          amount: p.amount,
          category: p.category ?? 'principal',
          notes: p.notes,
          action: 'insert',
        })),
      });
    }
  }

  // DB loans not in Excel
  const dbOnlyLoans = dbLoans
    .filter((db) => !matchedDbIds.has(db.id))
    .map((db) => ({
      id: db.id,
      loanNumber: db.loanNumber,
      customerName: db.customerName || db.pawnItem || 'ไม่ระบุชื่อ',
      principal: Number(db.principal),
      installmentAmount: Number(db.installmentAmount),
      startDate: toIsoDate(db.startDate),
      status: db.status,
      paidCount: (paysByLoan.get(db.id) ?? []).length,
    }));

  return {
    summary: {
      totalInSheet: allSheetLoans.length,
      totalActiveInSheet: targetSheetLoans.length,
      blackRowsCount: totalBlackCount,
      totalInDb: dbLoans.length,
      syncedCount: syncedLoans.length,
      mismatchedCount: mismatchedLoans.length,
      newLoansCount: newLoans.length,
      dbOnlyCount: dbOnlyLoans.length,
      skippedRowsCount: skippedRows.length,
    },
    loansBySheet,
    newLoans,
    mismatchedLoans,
    syncedLoans,
    dbOnlyLoans,
    skippedRows,
  };
}

export interface SyncSummaryResult {
  customersCreated: number;
  loansCreated: number;
  loansUpdated: number;
  paymentsCreated: number;
  paymentsUpdated: number;
}

export async function syncGoogleSheetToDb(
  tenantId: string,
  userId: string,
  sheetBuffer: Buffer,
  options: SyncOptions = {},
): Promise<SyncSummaryResult> {
  const audit = await auditGoogleSheetVsDb(tenantId, sheetBuffer, options);

  let customersCreated = 0;
  let loansCreated = 0;
  let loansUpdated = 0;
  let paymentsCreated = 0;
  let paymentsUpdated = 0;

  // Cache existing customers
  const existingCustomers = await sql`
    SELECT id, full_name FROM customers WHERE tenant_id = ${tenantId}
  `;
  const customerMap = new Map<string, string>();
  for (const c of existingCustomers) {
    customerMap.set(normName(c.fullName || c.full_name), c.id);
  }

  await sql.begin(async (tx) => {
    // 1. Process New Loans
    for (const loan of audit.newLoans) {
      const cKey = normName(loan.customerName);
      let customerId = customerMap.get(cKey);

      if (!customerId) {
        for (const [existingKey, existingId] of customerMap) {
          if (isThaiNameFuzzyMatch(loan.customerName, existingKey)) {
            customerId = existingId;
            break;
          }
        }
      }

      if (!customerId) {
        const newCustomerId = crypto.randomUUID();
        await tx`
          INSERT INTO customers ${tx({
            id: newCustomerId,
            fullName: loan.customerName,
            notes: `นำเข้าจาก ${loan.sourceSheet}`,
            riskLevel: 'medium',
            category: 'new',
            createdBy: userId,
            tenantId,
          })}
        `;
        customerId = newCustomerId;
        customerMap.set(cKey, newCustomerId);
        customersCreated++;
      }

      const loanId = crypto.randomUUID();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const loanNumber = `L${Date.now().toString().slice(-4)}${randomSuffix}`;

      await tx`
        INSERT INTO loans ${tx({
          id: loanId,
          customerId,
          principal: loan.principal,
          interestRate: (loan as any).interestRate ?? 0,
          interestAmount: (loan as any).interestAmount ?? 0,
          totalPayable: loan.totalPayable,
          installmentsCount: loan.installmentsCount,
          installmentAmount: loan.installmentAmount,
          paymentType: (loan as any).paymentType ?? 'daily',
          startDate: loan.startDate,
          dueDate: loan.dueDate,
          status: loan.status,
          notes: loan.notes,
          isInterestOnly: Boolean((loan as any).isInterestOnly),
          isIndefinite: Boolean((loan as any).isIndefinite),
          isPawn: Boolean((loan as any).isPawn),
          pawnItem: (loan as any).pawnItem ?? null,
          pawnStatus: (loan as any).isPawn ? 'in_storage' : null,
          loanNumber,
          createdBy: userId,
          tenantId,
        })}
      `;
      loansCreated++;

      // Insert Payments for this new loan
      if (loan.paymentDiffs && loan.paymentDiffs.length > 0) {
        for (const p of loan.paymentDiffs) {
          await tx`
            INSERT INTO payments ${tx({
              id: crypto.randomUUID(),
              loanId,
              amount: p.amount,
              paymentDate: p.date,
              installmentNumber: p.installmentNumber,
              method: 'cash',
              category: p.category ?? 'principal',
              notes: p.notes ?? null,
              createdBy: userId,
              tenantId,
            })}
          `;
          paymentsCreated++;
        }
      }
    }

    // 2. Process Mismatched Loans (Update fields and Insert/Update Payments)
    for (const loan of audit.mismatchedLoans) {
      if (!loan.id) continue;

      if (loan.fieldChanges && Object.keys(loan.fieldChanges).length > 0) {
        await tx`
          UPDATE loans SET
            installments_count = ${loan.installmentsCount},
            total_payable = ${loan.totalPayable},
            due_date = ${loan.dueDate},
            status = ${loan.status},
            notes = ${loan.notes}
          WHERE id = ${loan.id} AND tenant_id = ${tenantId}
        `;
        loansUpdated++;
      }

      if (loan.paymentDiffs && loan.paymentDiffs.length > 0) {
        for (const p of loan.paymentDiffs) {
          if (p.action === 'insert') {
            await tx`
              INSERT INTO payments ${tx({
                id: crypto.randomUUID(),
                loanId: loan.id,
                amount: p.amount,
                paymentDate: p.date,
                installmentNumber: p.installmentNumber,
                method: 'cash',
                category: p.category ?? 'principal',
                notes: p.notes ?? null,
                createdBy: userId,
                tenantId,
              })}
            `;
            paymentsCreated++;
          } else if (p.action === 'update') {
            await tx`
              UPDATE payments SET
                amount = ${p.amount},
                category = ${p.category ?? 'principal'},
                notes = ${p.notes ?? null}
              WHERE loan_id = ${loan.id}
                AND installment_number = ${p.installmentNumber}
                AND tenant_id = ${tenantId}
            `;
            paymentsUpdated++;
          }
        }
      }
    }
  });

  // Log activity
  await dbLogActivity(
    tenantId,
    userId,
    'SYNC_GOOGLE_SHEET',
    'system',
    null,
    {
      customersCreated,
      loansCreated,
      loansUpdated,
      paymentsCreated,
      paymentsUpdated,
      options,
    },
  );

  return {
    customersCreated,
    loansCreated,
    loansUpdated,
    paymentsCreated,
    paymentsUpdated,
  };
}

export async function getGoogleSyncConfig(tenantId: string) {
  const [row] = await sql`
    SELECT value FROM settings WHERE key = 'google_sheet_sync' AND tenant_id = ${tenantId}
  `;
  return row?.value || {
    sheetUrl: '',
    skipClosed: true,
    defaultYear: 69,
  };
}

export async function saveGoogleSyncConfig(tenantId: string, config: any) {
  await sql`
    INSERT INTO settings (tenant_id, key, value, updated_at)
    VALUES (${tenantId}, 'google_sheet_sync', ${config}, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = ${config}, updated_at = CURRENT_TIMESTAMP
  `;
  return config;
}
