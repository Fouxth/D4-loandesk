import crypto from 'crypto';
import sql from './src/db';
import { parseWorkbook } from './src/import/excelParsers';
import type { ParsedPayment } from './src/import/types';

const TENANT_ID = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || 'bkj';
const commit = process.argv.includes('--commit');
const filePath = process.argv.find((a) => a.endsWith('.xlsx')) || '../บัญชืเงินกู้.xlsx';
const beYear = parseInt(process.argv.find((a) => a.startsWith('--year='))?.split('=')[1] || '69', 10);

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function loanKey(
  startDate: string,
  principal: number,
  installmentAmount: number,
  customerName: string,
): string {
  return `${startDate}|${principal}|${installmentAmount}|${normName(customerName)}`;
}

async function getImportUserId(tenantId: string): Promise<string> {
  const [user] = await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`;
  if (!user) throw new Error(`No user found for tenant "${tenantId}"`);
  return user.id;
}

async function main() {
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY-RUN'} | tenant: ${TENANT_ID} | year: ${beYear}`);

  const { loans } = parseWorkbook(filePath, beYear);
  const gridSheets = new Set(['รายวัน12-24วัน', 'รายวัน14วัน']);
  const parsedLoans = loans.filter((l) => gridSheets.has(l.sourceSheet));

  const byKey = new Map<string, typeof parsedLoans>();
  for (const loan of parsedLoans) {
    const key = loanKey(loan.startDate, loan.principal, loan.installmentAmount, loan.customerName);
    const list = byKey.get(key) ?? [];
    list.push(loan);
    byKey.set(key, list);
  }

  const dbLoans = await sql`
    SELECT l.id, l.loan_number, l.principal, l.installment_amount, l.start_date, l.notes,
           c.full_name AS customer_name
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${TENANT_ID}
      AND (
        l.notes LIKE 'นำเข้าจาก รายวัน12-24วัน%'
        OR l.notes LIKE 'นำเข้าจาก รายวัน14วัน%'
      )
  `;

  const userId = commit ? await getImportUserId(TENANT_ID) : null;
  let loansUpdated = 0;
  let tpInserted = 0;
  let tpSkipped = 0;

  for (const db of dbLoans) {
    const key = loanKey(
      toIsoDate(db.startDate),
      Number(db.principal),
      Number(db.installmentAmount),
      db.customerName,
    );
    const candidates = byKey.get(key);
    if (!candidates?.length) continue;
    const parsed = candidates.shift()!;
    if (!candidates.length) byKey.delete(key);
    else byKey.set(key, candidates);

    const tpPayments = parsed.payments.filter((p) => p.category === 'roll_penalty');
    if (tpPayments.length === 0) continue;

    const existing = await sql`
      SELECT installment_number, notes
      FROM payments
      WHERE loan_id = ${db.id}
        AND tenant_id = ${TENANT_ID}
        AND category = 'roll_penalty'
    `;
    const existingNums = new Set(existing.map((r) => Number(r.installmentNumber)));

    const toInsert: ParsedPayment[] = [];
    for (const tp of tpPayments) {
      if (existingNums.has(tp.installmentNumber)) {
        tpSkipped++;
        continue;
      }
      toInsert.push(tp);
    }

    if (toInsert.length === 0) continue;
    loansUpdated++;

    if (commit && userId) {
      const rows = toInsert.map((tp) => ({
        id: crypto.randomUUID(),
        loanId: db.id,
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

      const noteBase = String(db.notes ?? '').split(';').map((s) => s.trim()).filter(Boolean);
      const withoutOldTp = noteBase.filter((n) => !n.startsWith('งวด') || !n.includes('ท+ป'));
      const rollCount = tpPayments.length;
      const summary = `ท+ป ${rollCount} ครั้ง`;
      if (!withoutOldTp.some((n) => n.startsWith('ท+ป'))) {
        withoutOldTp.splice(1, 0, summary);
      } else {
        for (let i = 0; i < withoutOldTp.length; i++) {
          if (withoutOldTp[i].startsWith('ท+ป')) withoutOldTp[i] = summary;
        }
      }
      await sql`UPDATE loans SET notes = ${withoutOldTp.join('; ')} WHERE id = ${db.id}`;
    }

    tpInserted += toInsert.length;
    console.log(`  ${db.loanNumber}: +${toInsert.length} ท+ป (${tpPayments.length} ใน Excel)`);
  }

  console.log(`\nสรุป: อัปเดต ${loansUpdated} สัญญา | เพิ่ม ท+ป ${tpInserted} รายการ | ข้าม (มีแล้ว) ${tpSkipped}`);
  if (!commit) console.log('\nDry-run — รันใหม่ด้วย --commit เพื่อบันทึก');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
