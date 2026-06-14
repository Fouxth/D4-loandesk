import sql from './src/db';
import { parseWorkbook } from './src/import/excelParsers';

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

async function main() {
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY-RUN'}`);
  console.log(`Tenant: ${TENANT_ID}, year: ${beYear}`);

  const { loans } = parseWorkbook(filePath, beYear);
  const gridLoans = loans.filter((l) => l.sourceSheet === 'รายวัน12-24วัน');
  console.log(`Parsed ${gridLoans.length} loans from รายวัน12-24วัน`);

  const dbLoans = await sql`
    SELECT l.id, l.loan_number, l.principal, l.installment_amount, l.start_date, l.installments_count,
           l.total_payable, l.interest_rate, l.interest_amount, l.due_date, l.status, l.notes, c.full_name
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${TENANT_ID}
      AND l.notes LIKE 'นำเข้าจาก รายวัน12-24วัน%'
  `;

  const byKey = new Map<string, typeof gridLoans>();
  for (const loan of gridLoans) {
    const key = loanKey(loan.startDate, loan.principal, loan.installmentAmount, loan.customerName);
    const list = byKey.get(key) ?? [];
    list.push(loan);
    byKey.set(key, list);
  }

  let updated = 0;
  let unmatched = 0;

  for (const db of dbLoans) {
    const start = toIsoDate(db.startDate);
    const key = loanKey(start, Number(db.principal), Number(db.installmentAmount), db.fullName);
    const candidates = byKey.get(key);
    if (!candidates?.length) {
      unmatched++;
      continue;
    }
    const parsed = candidates.shift()!;
    if (candidates.length === 0) byKey.delete(key);
    else byKey.set(key, candidates);

    const changed =
      db.installmentsCount !== parsed.installmentsCount ||
      Number(db.totalPayable) !== parsed.totalPayable ||
      Number(db.interestRate) !== parsed.interestRate ||
      db.status !== parsed.status ||
      String(toIsoDate(db.dueDate)) !== parsed.dueDate;

    if (changed) {
      updated++;
      console.log(
        `${db.loanNumber} ${db.fullName}: งวด ${db.installmentsCount}→${parsed.installmentsCount}, ` +
          `ดอก ${db.interestRate}%→${parsed.interestRate}%, สถานะ ${db.status}→${parsed.status}`,
      );

      if (commit) {
        await sql`
          UPDATE loans SET
            installments_count = ${parsed.installmentsCount},
            total_payable = ${parsed.totalPayable},
            interest_amount = ${parsed.interestAmount},
            interest_rate = ${parsed.interestRate},
            due_date = ${parsed.dueDate},
            status = ${parsed.status}
          WHERE id = ${db.id}
        `;
      }
    }
  }

  console.log(`\nUpdated: ${updated}, unmatched: ${unmatched}, total checked: ${dbLoans.length}`);
  if (!commit) console.log('Dry-run only. Re-run with --commit to apply.');
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
