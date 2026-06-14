/**
 * ตรวจ Excel บัญชืเงินกู้.xlsx เทียบ DB tenant bkj อย่างละเอียด
 * Usage: npx ts-node audit_excel_vs_db.ts [--year=69]
 */
import fs from 'fs';
import path from 'path';
import sql from './src/db';
import { parseWorkbook } from './src/import/excelParsers';
import type { ParsedLoan, ParsedPayment } from './src/import/types';
import {
  calcLoanPaidTotal,
  calcLoanTotalOwed,
  calcTpSettlementAmount,
  tpConfigFromSettings,
} from './src/utils/tpPayment';

const TENANT_ID = 'bkj';
const FILE = path.join(__dirname, '..', 'บัญชืเงินกู้.xlsx');
const beYear = parseInt(process.argv.find((a) => a.startsWith('--year='))?.split('=')[1] || '69', 10);

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function loanKey(loan: { startDate: string; principal: number; installmentAmount: number; customerName: string }): string {
  return `${loan.startDate}|${loan.principal}|${loan.installmentAmount}|${normName(loan.customerName)}`;
}

function dbKey(row: {
  startDate: unknown;
  principal: unknown;
  installmentAmount: unknown;
  customerName: string;
}): string {
  return `${toIsoDate(row.startDate)}|${Number(row.principal)}|${Number(row.installmentAmount)}|${normName(row.customerName)}`;
}

function summarizePayments(payments: ParsedPayment[]) {
  const regular = payments.filter((p) => p.category !== 'roll_penalty');
  const tp = payments.filter((p) => p.category === 'roll_penalty');
  const byInst = new Map<number, { amount: number; category: string; date: string }>();
  for (const p of payments) {
    byInst.set(p.installmentNumber, {
      amount: Number(p.amount),
      category: p.category ?? 'principal',
      date: p.paymentDate,
    });
  }
  return {
    regularCount: regular.length,
    tpCount: tp.length,
    regularSum: regular.reduce((a, p) => a + Number(p.amount), 0),
    byInst,
    tpDays: tp.map((p) => p.installmentNumber).sort((a, b) => a - b),
  };
}

type DbPaymentRow = {
  installmentNumber: number;
  amount: string;
  category: string | null;
  paymentDate: unknown;
};

async function main() {
  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
  `;
  const tpConfig = tpConfigFromSettings(settingsRow?.value as Record<string, unknown>);

  console.log('=== Excel vs DB Audit ===');
  console.log('File:', FILE);
  console.log('Tenant:', TENANT_ID);
  console.log('Year filter (BE):', beYear);
  console.log('ท+ป config:', tpConfig);
  console.log('');

  const { loans: excelLoans, skipped } = parseWorkbook(FILE, beYear, { tpConfig });
  console.log(`Excel parsed: ${excelLoans.length} loans, skipped rows: ${skipped.length}`);

  const dbLoans = await sql`
    SELECT l.id, l.loan_number, l.principal, l.installment_amount, l.installments_count,
           l.total_payable, l.start_date, l.due_date, l.status, l.notes,
           c.full_name AS customer_name
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${TENANT_ID}
    ORDER BY l.loan_number
  `;

  const dbPayments = await sql`
    SELECT loan_id, installment_number, amount, category, payment_date
    FROM payments WHERE tenant_id = ${TENANT_ID}
    ORDER BY loan_id, installment_number
  `;

  const paysByLoan = new Map<string, DbPaymentRow[]>();
  for (const p of dbPayments) {
    const list = paysByLoan.get(p.loanId) ?? [];
    list.push(p as DbPaymentRow);
    paysByLoan.set(p.loanId, list);
  }

  console.log(`DB: ${dbLoans.length} loans, ${dbPayments.length} payments\n`);

  // Index Excel by key (queue for duplicates)
  const excelByKey = new Map<string, ParsedLoan[]>();
  for (const loan of excelLoans) {
    const key = loanKey(loan);
    const list = excelByKey.get(key) ?? [];
    list.push(loan);
    excelByKey.set(key, list);
  }

  const issues: string[] = [];
  const fieldMismatches: string[] = [];
  const paymentMismatches: string[] = [];
  let matched = 0;
  let unmatchedDb = 0;
  const matchedExcelKeys = new Set<string>();

  for (const db of dbLoans) {
    const key = dbKey({
      startDate: db.startDate,
      principal: db.principal,
      installmentAmount: db.installmentAmount,
      customerName: db.customerName,
    });
    const candidates = excelByKey.get(key);
    if (!candidates?.length) {
      unmatchedDb++;
      if (unmatchedDb <= 30) {
        issues.push(`DB ไม่มีใน Excel: ${db.loanNumber} ${db.customerName} key=${key} notes=${String(db.notes).slice(0, 50)}`);
      }
      continue;
    }
    const parsed = candidates.shift()!;
    if (!candidates.length) excelByKey.delete(key);
    else excelByKey.set(key, candidates);
    matchedExcelKeys.add(key);
    matched++;

    const excelPay = summarizePayments(parsed.payments);
    const dbPayList = paysByLoan.get(db.id) ?? [];
    const dbRegular = dbPayList.filter((p) => p.category !== 'roll_penalty');
    const dbTp = dbPayList.filter((p) => p.category === 'roll_penalty');
    const dbRegularSum = dbRegular.reduce((a, p) => a + Number(p.amount), 0);

    if (Number(db.installmentsCount) !== parsed.installmentsCount) {
      fieldMismatches.push(
        `${db.loanNumber} installments: DB=${db.installmentsCount} Excel=${parsed.installmentsCount}`,
      );
    }
    if (Math.abs(Number(db.totalPayable) - parsed.totalPayable) > 0.01) {
      fieldMismatches.push(
        `${db.loanNumber} totalPayable: DB=${db.totalPayable} Excel=${parsed.totalPayable}`,
      );
    }
    if (toIsoDate(db.startDate) !== parsed.startDate) {
      fieldMismatches.push(`${db.loanNumber} startDate: DB=${toIsoDate(db.startDate)} Excel=${parsed.startDate}`);
    }

    if (excelPay.regularCount !== dbRegular.length) {
      paymentMismatches.push(
        `${db.loanNumber} ${db.customerName} regularCount: DB=${dbRegular.length} Excel=${excelPay.regularCount}`,
      );
    }
    if (excelPay.tpCount !== dbTp.length) {
      paymentMismatches.push(
        `${db.loanNumber} ${db.customerName} ท+ป: DB=${dbTp.length} Excel=${excelPay.tpCount} excelDays=[${excelPay.tpDays.join(',')}]`,
      );
    }
    if (Math.abs(excelPay.regularSum - dbRegularSum) > 0.01) {
      paymentMismatches.push(
        `${db.loanNumber} regularSum: DB=${dbRegularSum} Excel=${excelPay.regularSum}`,
      );
    }

    // Per-installment compare
    for (const [inst, ex] of excelPay.byInst) {
      const dbP = dbPayList.find((p) => Number(p.installmentNumber) === inst);
      if (!dbP) {
        paymentMismatches.push(`${db.loanNumber} งวด${inst}: missing in DB (Excel ${ex.category} ${ex.amount})`);
        continue;
      }
      if (ex.category === 'roll_penalty') {
        if (dbP.category !== 'roll_penalty') {
          paymentMismatches.push(`${db.loanNumber} งวด${inst}: Excel=ท+ป DB=amount ${dbP.amount}`);
        }
      } else if (Math.abs(Number(dbP.amount) - ex.amount) > 0.01) {
        paymentMismatches.push(
          `${db.loanNumber} งวด${inst}: DB=${dbP.amount} Excel=${ex.amount}`,
        );
      }
      if (toIsoDate(dbP.paymentDate) !== ex.date) {
        paymentMismatches.push(
          `${db.loanNumber} งวด${inst} date: DB=${toIsoDate(dbP.paymentDate)} Excel=${ex.date}`,
        );
      }
    }
    for (const dbP of dbPayList) {
      const inst = Number(dbP.installmentNumber);
      if (!excelPay.byInst.has(inst)) {
        paymentMismatches.push(`${db.loanNumber} งวด${inst}: extra in DB amount=${dbP.amount} cat=${dbP.category}`);
      }
    }

    // Status vs money
    const inst = Number(db.installmentAmount);
    const paidTotal = calcLoanPaidTotal(
      dbPayList.map((p) => ({ amount: p.amount, category: p.category })),
      inst,
      tpConfig,
    );
    const totalOwed = calcLoanTotalOwed(Number(db.totalPayable), dbTp.length, inst, tpConfig);
    const shouldComplete = paidTotal >= totalOwed - 0.01;
    if (shouldComplete && db.status !== 'completed') {
      fieldMismatches.push(
        `${db.loanNumber} status: DB=${db.status} but paid ${paidTotal}/${totalOwed} (should completed)`,
      );
    }
    if (!shouldComplete && db.status === 'completed') {
      fieldMismatches.push(
        `${db.loanNumber} status: DB=completed but paid ${paidTotal}/${totalOwed}`,
      );
    }
  }

  // Excel not in DB
  let unmatchedExcel = 0;
  for (const [key, list] of excelByKey) {
    for (const loan of list) {
      unmatchedExcel++;
      if (unmatchedExcel <= 30) {
        issues.push(
          `Excel ไม่มีใน DB: ${loan.customerName} ${loan.sourceSheet} key=${key} inst=${loan.installmentsCount}`,
        );
      }
    }
  }

  // Sheet breakdown
  const excelBySheet: Record<string, number> = {};
  for (const l of excelLoans) excelBySheet[l.sourceSheet] = (excelBySheet[l.sourceSheet] || 0) + 1;

  console.log('--- Summary ---');
  console.log('Matched pairs:', matched);
  console.log('DB loans not in Excel:', unmatchedDb);
  console.log('Excel loans not in DB:', unmatchedExcel);
  console.log('Field mismatches:', fieldMismatches.length);
  console.log('Payment mismatches:', paymentMismatches.length);
  console.log('Excel by sheet:', excelBySheet);
  console.log('Skipped parse rows:', skipped.length);

  console.log('\n--- Field mismatches (first 40) ---');
  fieldMismatches.slice(0, 40).forEach((l) => console.log(' ', l));
  if (fieldMismatches.length > 40) console.log(`  ... +${fieldMismatches.length - 40} more`);

  console.log('\n--- Payment mismatches (first 50) ---');
  paymentMismatches.slice(0, 50).forEach((l) => console.log(' ', l));
  if (paymentMismatches.length > 50) console.log(`  ... +${paymentMismatches.length - 50} more`);

  console.log('\n--- Other issues (first 20) ---');
  issues.slice(0, 20).forEach((l) => console.log(' ', l));

  // Write full report
  const reportPath = path.join(__dirname, '..', 'audit_excel_vs_db_report.txt');
  const lines = [
    `Audit ${new Date().toISOString()}`,
    `Matched: ${matched}, DB only: ${unmatchedDb}, Excel only: ${unmatchedExcel}`,
    '',
    '=== FIELD MISMATCHES ===',
    ...fieldMismatches,
    '',
    '=== PAYMENT MISMATCHES ===',
    ...paymentMismatches,
    '',
    '=== UNMATCHED ===',
    ...issues,
  ];
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`\nFull report: ${reportPath}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
