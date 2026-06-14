import sql from './src/db';
import { calcLoanTotalOwed, calcTpSettlementAmount, tpConfigFromSettings } from './src/utils/tpPayment';
import fs from 'fs';
import path from 'path';

const TENANT_ID = 'bkj';

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function main() {
  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
  `;
  const tpConfig = tpConfigFromSettings(settingsRow?.value as Record<string, unknown>);

  const rows = await sql`
    SELECT l.loan_number, l.status, l.total_payable, l.installment_amount, l.installments_count,
           l.due_date, l.notes, c.full_name AS customer_name,
           COALESCE(p.cnt, 0)::int AS pay_count,
           COALESCE(p.tp_cnt, 0)::int AS tp_count,
           COALESCE(p.paid, 0)::numeric AS paid_total
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    LEFT JOIN (
      SELECT loan_id,
             count(*) FILTER (WHERE coalesce(category, 'principal') <> 'roll_penalty') AS cnt,
             count(*) FILTER (WHERE category = 'roll_penalty') AS tp_cnt,
             sum(amount::numeric) FILTER (WHERE coalesce(category, 'principal') <> 'roll_penalty') AS paid
      FROM payments WHERE tenant_id = ${TENANT_ID}
      GROUP BY loan_id
    ) p ON p.loan_id = l.id
    WHERE l.tenant_id = ${TENANT_ID}
      AND l.is_indefinite = false
      AND l.status IN ('active', 'overdue')
  `;

  const lines = ['loan_number,customer,status,paid,owed,remaining,slots,notes_prefix'];
  let shouldComplete = 0;
  let trueOverdue = 0;

  for (const row of rows) {
    const tpCount = Number(row.tpCount) || 0;
    const inst = Number(row.installmentAmount) || 0;
    const regularPaid = Number(row.paidTotal) || 0;
    const installments = Number(row.installmentsCount) || 0;
    const payCount = Number(row.payCount) || 0;

    const hasTp = tpCount > 0 && inst > 0;
    const paidTotal = hasTp
      ? regularPaid + tpCount * calcTpSettlementAmount(inst, tpConfig)
      : regularPaid;
    const totalOwed = hasTp
      ? calcLoanTotalOwed(Number(row.totalPayable), tpCount, inst, tpConfig)
      : Number(row.totalPayable);
    const remaining = Math.max(totalOwed - paidTotal, 0);
    const coveredSlots = payCount + tpCount;

    const category = paidTotal >= totalOwed - 0.01 ? 'SHOULD_COMPLETE' : 'OVERDUE';
    if (category === 'SHOULD_COMPLETE') shouldComplete++;
    else trueOverdue++;

    lines.push(
      [
        row.loanNumber,
        `"${String(row.customerName).replace(/"/g, '""')}"`,
        row.status,
        paidTotal,
        totalOwed,
        remaining,
        `${coveredSlots}/${installments}`,
        `"${String(row.notes ?? '').slice(0, 40)}"`,
      ].join(',') + `,${category}`,
    );
  }

  const outPath = path.join(__dirname, '..', 'audit_overdue_report.csv');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Report: ${outPath}`);
  console.log(`Should complete: ${shouldComplete}`);
  console.log(`True overdue: ${trueOverdue}`);

  await sql.end();
}

main().catch(console.error);
