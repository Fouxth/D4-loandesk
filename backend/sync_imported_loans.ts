import sql from './src/db';
import { parseWorkbook } from './src/import/excelParsers';
import {
  calcLoanTotalOwed,
  calcTpSettlementAmount,
  tpConfigFromSettings,
} from './src/utils/tpPayment';

const TENANT_ID = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || 'bkj';
const commit = process.argv.includes('--commit');
const filePath = process.argv.find((a) => a.endsWith('.xlsx')) || '../บัญชืเงินกู้.xlsx';
const beYear = parseInt(process.argv.find((a) => a.startsWith('--year='))?.split('=')[1] || '69', 10);

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

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function repair1224Loans(): Promise<number> {
  const { loans } = parseWorkbook(filePath, beYear);
  const gridLoans = loans.filter((l) => l.sourceSheet === 'รายวัน12-24วัน');

  const dbLoans = await sql`
    SELECT l.id, l.loan_number, l.principal, l.installment_amount, l.start_date, l.due_date,
           l.installments_count, l.total_payable, l.interest_rate, l.status,
           c.full_name AS customer_name
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

    const changed =
      db.installmentsCount !== parsed.installmentsCount ||
      Number(db.totalPayable) !== parsed.totalPayable ||
      Number(db.interestRate) !== parsed.interestRate ||
      String(db.dueDate ?? '').slice(0, 10) !== parsed.dueDate;

    if (!changed) continue;
    updated++;

    if (commit) {
      await sql`
        UPDATE loans SET
          installments_count = ${parsed.installmentsCount},
          total_payable = ${parsed.totalPayable},
          interest_amount = ${parsed.interestAmount},
          interest_rate = ${parsed.interestRate},
          due_date = ${parsed.dueDate}
        WHERE id = ${db.id}
      `;
    }
  }
  return updated;
}

async function syncStatusFromPayments(): Promise<number> {
  const today = todayIso();
  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
  `;
  const tpConfig = tpConfigFromSettings(settingsRow?.value as Record<string, unknown>);

  const rows = await sql`
    SELECT l.id, l.loan_number, l.installments_count, l.total_payable, l.installment_amount,
           l.due_date, l.status, l.is_indefinite,
           COALESCE(p.cnt, 0)::int AS pay_count,
           COALESCE(p.tp_cnt, 0)::int AS tp_count,
           COALESCE(p.paid, 0)::numeric AS paid_total
    FROM loans l
    LEFT JOIN (
      SELECT loan_id,
             count(*) FILTER (WHERE coalesce(category, 'principal') <> 'roll_penalty') AS cnt,
             count(*) FILTER (WHERE category = 'roll_penalty') AS tp_cnt,
             sum(amount::numeric) FILTER (WHERE coalesce(category, 'principal') <> 'roll_penalty') AS paid
      FROM payments WHERE tenant_id = ${TENANT_ID}
      GROUP BY loan_id
    ) p ON p.loan_id = l.id
    WHERE l.tenant_id = ${TENANT_ID}
      AND l.status NOT IN ('cancelled', 'refinanced', 'forfeited')
      AND l.is_indefinite = false
  `;

  let updated = 0;
  for (const row of rows) {
    const installments = Number(row.installmentsCount) || 0;
    const payCount = Number(row.payCount) || 0;
    const tpCount = Number(row.tpCount) || 0;
    const inst = Number(row.installmentAmount) || 0;
    const regularPaid = Number(row.paidTotal) || 0;
    const totalPayable = Number(row.totalPayable) || 0;
    const dueStr = toIsoDate(row.dueDate);

    const hasTp = tpCount > 0 && inst > 0;
    const paidTotal = hasTp
      ? regularPaid + tpCount * calcTpSettlementAmount(inst, tpConfig)
      : regularPaid;
    const totalOwed = hasTp
      ? calcLoanTotalOwed(totalPayable, tpCount, inst, tpConfig)
      : totalPayable;
    const coveredSlots = payCount + tpCount;

    let newStatus = row.status;
    if (installments > 0 && paidTotal >= totalOwed - 0.01) {
      newStatus = 'completed';
    } else if (dueStr && dueStr < today && newStatus !== 'completed') {
      newStatus = 'overdue';
    } else if (newStatus === 'overdue' && dueStr && dueStr >= today) {
      newStatus = 'active';
    } else if (newStatus === 'completed' && paidTotal < totalOwed - 0.01) {
      newStatus = dueStr && dueStr < today ? 'overdue' : 'active';
    }

    if (newStatus === row.status) continue;
    updated++;
    if (commit) {
      await sql`UPDATE loans SET status = ${newStatus} WHERE id = ${row.id}`;
    }
  }
  return updated;
}

async function main() {
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY-RUN'} | tenant: ${TENANT_ID} | year: ${beYear}`);

  const repaired = await repair1224Loans();
  console.log(`แก้จำนวนงวด/ยอด (12-24): ${repaired} สัญญา`);

  const synced = await syncStatusFromPayments();
  console.log(`ซิงค์สถานะจากการชำระ: ${synced} สัญญา`);

  if (!commit) {
    console.log('\nDry-run — รันใหม่ด้วย --commit เพื่อบันทึก');
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
