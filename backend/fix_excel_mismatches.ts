/**
 * แก้ความคลาดเคลื่อน Excel vs DB: งวดสลับ, ท+ปผิดสัญญา, วันเริ่มพอร์ตโฟลิโย
 * Usage: npx ts-node fix_excel_mismatches.ts [--year=69] [--commit]
 */
import crypto from 'crypto';
import sql from './src/db';
import { parseWorkbook } from './src/import/excelParsers';
import type { ParsedLoan, ParsedPayment } from './src/import/types';
import { tpConfigFromSettings } from './src/utils/tpPayment';

const TENANT_ID = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || 'bkj';
const commit = process.argv.includes('--commit');
const filePath = process.argv.find((a) => a.endsWith('.xlsx')) || '../บัญชืเงินกู้.xlsx';
const beYear = parseInt(process.argv.find((a) => a.startsWith('--year='))?.split('=')[1] || '69', 10);

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function fullKey(startDate: string, principal: number, installment: number, customerName: string): string {
  return `${startDate}|${principal}|${installment}|${normName(customerName)}`;
}

function looseKey(principal: number, installment: number, customerName: string): string {
  return `${principal}|${installment}|${normName(customerName)}`;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

type DbLoan = {
  id: string;
  loanNumber: string;
  principal: unknown;
  installmentAmount: unknown;
  startDate: unknown;
  installmentsCount: number;
  totalPayable: unknown;
  interestRate: unknown;
  interestAmount: unknown;
  dueDate: unknown;
  status: string;
  notes: string | null;
  customerName: string;
  isIndefinite: boolean;
  isPawn: boolean;
};

const GRID_SHEETS = new Set(['รายวัน12-24วัน', 'รายวัน14วัน', 'รายวัน 3-5-7 วัน']);
const PROTECTED_STATUS = new Set(['forfeited', 'cancelled', 'refinanced']);

function pickLooseMatch(db: DbLoan, candidates: ParsedLoan[]): ParsedLoan | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const dbStart = toIsoDate(db.startDate);
  const today = todayIso();
  const portfolio = candidates.filter((c) => c.startDate === today);
  if (portfolio.length === 1) return portfolio[0];

  const nearDb = candidates.filter((c) => daysBetween(c.startDate, dbStart) <= 14);
  if (nearDb.length === 1) return nearDb[0];

  return [...candidates].sort(
    (a, b) => daysBetween(a.startDate, dbStart) - daysBetween(b.startDate, dbStart),
  )[0];
}

async function getImportUserId(tenantId: string): Promise<string> {
  const [user] = await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`;
  if (!user) throw new Error(`No user found for tenant "${tenantId}"`);
  return user.id;
}

function updateTpNotes(existingNotes: string | null, tpCount: number): string {
  const parts = String(existingNotes ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const withoutTp = parts.filter((n) => !n.startsWith('ท+ป'));
  if (tpCount > 0) {
    withoutTp.splice(Math.min(1, withoutTp.length), 0, `ท+ป ${tpCount} ครั้ง`);
  }
  return withoutTp.join('; ');
}

async function main() {
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY-RUN'} | tenant: ${TENANT_ID} | year: ${beYear}`);

  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
  `;
  const tpConfig = tpConfigFromSettings(settingsRow?.value as Record<string, unknown>);
  const { loans: excelLoans } = parseWorkbook(filePath, beYear, { tpConfig });

  const excelByFull = new Map<string, ParsedLoan[]>();
  const excelByLoose = new Map<string, ParsedLoan[]>();
  for (const loan of excelLoans) {
    const fk = fullKey(loan.startDate, loan.principal, loan.installmentAmount, loan.customerName);
    const fl = excelByFull.get(fk) ?? [];
    fl.push(loan);
    excelByFull.set(fk, fl);

    const lk = looseKey(loan.principal, loan.installmentAmount, loan.customerName);
    const ll = excelByLoose.get(lk) ?? [];
    ll.push(loan);
    excelByLoose.set(lk, ll);
  }

  const dbLoans = await sql`
    SELECT l.id, l.loan_number, l.principal, l.installment_amount, l.start_date,
           l.installments_count, l.total_payable, l.interest_rate, l.interest_amount,
           l.due_date, l.status, l.notes, l.is_indefinite, l.is_pawn,
           c.full_name AS customer_name
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${TENANT_ID}
    ORDER BY l.loan_number
  `;

  const userId = commit ? await getImportUserId(TENANT_ID) : null;
  let loanUpdates = 0;
  let tpDeleted = 0;
  let tpInserted = 0;
  let dateUpdates = 0;
  let unmatched = 0;

  for (const db of dbLoans) {
    const row = db as DbLoan;
    const dbStart = toIsoDate(row.startDate);
    const principal = Number(row.principal);
    const installment = Number(row.installmentAmount);
    const fk = fullKey(dbStart, principal, installment, row.customerName);

    let parsed: ParsedLoan | undefined;
    let usedLoose = false;

    const fullCandidates = excelByFull.get(fk);
    if (fullCandidates?.length) {
      parsed = fullCandidates.shift()!;
      if (!fullCandidates.length) excelByFull.delete(fk);
      else excelByFull.set(fk, fullCandidates);
    } else {
      const looseCandidates = excelByLoose.get(looseKey(principal, installment, row.customerName)) ?? [];
      parsed = pickLooseMatch(row, looseCandidates) ?? undefined;
      usedLoose = !!parsed;
    }

    if (!parsed) {
      unmatched++;
      console.log(`  ⚠ ไม่พบใน Excel: ${row.loanNumber} ${row.customerName}`);
      continue;
    }

    const fieldChanges: string[] = [];
    const isGrid = GRID_SHEETS.has(parsed.sourceSheet);
    const protectStatus = row.isIndefinite || row.isPawn || PROTECTED_STATUS.has(row.status);

    if (isGrid && Number(row.installmentsCount) !== parsed.installmentsCount) {
      fieldChanges.push(`งวด ${row.installmentsCount}→${parsed.installmentsCount}`);
    }
    if (isGrid && Math.abs(Number(row.totalPayable) - parsed.totalPayable) > 0.01) {
      fieldChanges.push(`ยอด ${row.totalPayable}→${parsed.totalPayable}`);
    }
    if ((usedLoose || row.isIndefinite) && dbStart !== parsed.startDate) {
      fieldChanges.push(`เริ่ม ${dbStart}→${parsed.startDate}`);
    }
    if (isGrid && parsed.dueDate && toIsoDate(row.dueDate) !== parsed.dueDate) {
      fieldChanges.push(`ครบ ${toIsoDate(row.dueDate)}→${parsed.dueDate}`);
    }
    // สถานะคำนวณจากยอดชำระจริงใน sync_imported_loans — ไม่ copy จาก Excel โดยตรง

    const excelTp = isGrid ? parsed.payments.filter((p) => p.category === 'roll_penalty') : [];
    const dbAllPays = isGrid
      ? await sql`
          SELECT id, installment_number, payment_date, category
          FROM payments
          WHERE loan_id = ${row.id} AND tenant_id = ${TENANT_ID}
        `
      : [];
    const dbTpRows = dbAllPays.filter((p) => p.category === 'roll_penalty');
    const excelTpInst = new Set(excelTp.map((p) => p.installmentNumber));
    const dbTpInst = new Set(dbTpRows.map((r) => Number(r.installmentNumber)));

    const toDelete = dbTpRows.filter((r) => !excelTpInst.has(Number(r.installmentNumber)));
    const toInsert: ParsedPayment[] = excelTp.filter((p) => !dbTpInst.has(p.installmentNumber));

    const dateFixes: { id: string; inst: number; from: string; to: string }[] = [];
    if (isGrid) {
      for (const exPay of parsed.payments) {
        const dbP = dbAllPays.find(
          (p) =>
            Number(p.installmentNumber) === exPay.installmentNumber &&
            (p.category ?? 'principal') === (exPay.category ?? 'principal'),
        );
        if (dbP && toIsoDate(dbP.paymentDate) !== exPay.paymentDate) {
          dateFixes.push({
            id: dbP.id,
            inst: exPay.installmentNumber,
            from: toIsoDate(dbP.paymentDate),
            to: exPay.paymentDate,
          });
        }
      }
    }

    if (fieldChanges.length > 0 || toDelete.length > 0 || toInsert.length > 0 || dateFixes.length > 0) {
      console.log(`  ${row.loanNumber} ${row.customerName}${usedLoose ? ' (loose)' : ''}:`);
      fieldChanges.forEach((c) => console.log(`    ${c}`));
      if (toDelete.length) console.log(`    ลบ ท+ป ${toDelete.length} รายการ`);
      if (toInsert.length) console.log(`    เพิ่ม ท+ป ${toInsert.length} รายการ`);
      if (dateFixes.length) console.log(`    แก้วันชำระ ${dateFixes.length} รายการ`);
    }

    if (!commit) {
      if (fieldChanges.length || toDelete.length || toInsert.length || dateFixes.length) loanUpdates++;
      tpDeleted += toDelete.length;
      tpInserted += toInsert.length;
      dateUpdates += dateFixes.length;
      continue;
    }

    if (commit && fieldChanges.length > 0) {
      const newStart = fieldChanges.some((c) => c.startsWith('เริ่ม')) ? parsed.startDate : toIsoDate(row.startDate);
      const existingDue = row.dueDate == null ? null : toIsoDate(row.dueDate);
      const newDue = fieldChanges.some((c) => c.startsWith('ครบ'))
        ? (parsed.dueDate ?? null)
        : existingDue;
      const newStatus = fieldChanges.some((c) => c.startsWith('สถานะ')) ? parsed.status : row.status;
      const newInst = fieldChanges.some((c) => c.startsWith('งวด'))
        ? parsed.installmentsCount
        : Number(row.installmentsCount);
      const newPayable = fieldChanges.some((c) => c.startsWith('ยอด'))
        ? parsed.totalPayable
        : Number(row.totalPayable);
      const newInterest = fieldChanges.some((c) => c.startsWith('ยอด') || c.startsWith('งวด'))
        ? parsed.interestAmount
        : Number(row.interestAmount);
      const newRate = fieldChanges.some((c) => c.startsWith('ยอด') || c.startsWith('งวด'))
        ? parsed.interestRate
        : Number(row.interestRate);

      await sql`
        UPDATE loans SET
          installments_count = ${newInst},
          total_payable = ${newPayable},
          interest_amount = ${newInterest},
          interest_rate = ${newRate},
          start_date = ${newStart},
          due_date = ${newDue},
          status = ${newStatus},
          notes = ${updateTpNotes(row.notes, excelTp.length)}
        WHERE id = ${row.id}
      `;
      loanUpdates++;
    } else if (commit && (toDelete.length || toInsert.length)) {
      await sql`
        UPDATE loans SET notes = ${updateTpNotes(row.notes, excelTp.length)} WHERE id = ${row.id}
      `;
    }

    for (const delRow of toDelete) {
      await sql`DELETE FROM payments WHERE id = ${delRow.id}`;
      tpDeleted++;
    }

    if (toInsert.length > 0 && userId) {
      const loanId = row.id;
      const rows = toInsert.map((tp) => ({
        id: crypto.randomUUID(),
        loanId,
        amount: tp.amount,
        paymentDate: tp.paymentDate,
        installmentNumber: tp.installmentNumber,
        method: 'cash',
        category: 'roll_penalty',
        notes: tp.notes ?? null,
        createdBy: userId,
        tenantId: TENANT_ID,
      }));
      await sql`INSERT INTO payments ${sql(rows)}`;
      tpInserted += toInsert.length;
    }

    for (const fix of dateFixes) {
      await sql`UPDATE payments SET payment_date = ${fix.to} WHERE id = ${fix.id}`;
      dateUpdates++;
    }
  }

  console.log(
    `\nสรุป: อัปเดต ${loanUpdates} สัญญา | ลบ ท+ป ${tpDeleted} | เพิ่ม ท+ป ${tpInserted} | แก้วันชำระ ${dateUpdates} | ไม่จับคู่ ${unmatched}`,
  );
  if (!commit) console.log('\nDry-run — รันใหม่ด้วย --commit เพื่อบันทึก');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
