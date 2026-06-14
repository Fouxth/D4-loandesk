import sql from './src/db';
import { calcLoanTotalOwed, calcTpSettlementAmount, tpConfigFromSettings } from './src/utils/tpPayment';

const TENANT_ID = 'bkj';

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calcPaid(row: any, tpConfig: ReturnType<typeof tpConfigFromSettings>) {
  const tpCount = Number(row.tpCount) || 0;
  const inst = Number(row.installmentAmount) || 0;
  const regularPaid = Number(row.paidTotal) || 0;
  const totalPayable = Number(row.totalPayable) || 0;
  const installments = Number(row.installmentsCount) || 0;
  const payCount = Number(row.payCount) || 0;

  const hasTp = tpCount > 0 && inst > 0;
  const paidTotal = hasTp
    ? regularPaid + tpCount * calcTpSettlementAmount(inst, tpConfig)
    : regularPaid;
  const totalOwed = hasTp
    ? calcLoanTotalOwed(totalPayable, tpCount, inst, tpConfig)
    : totalPayable;
  const coveredSlots = payCount + tpCount;
  const isFullyPaid = paidTotal >= totalOwed - 0.01 && totalOwed > 0;

  return { paidTotal, totalOwed, coveredSlots, installments, isFullyPaid, remaining: Math.max(totalOwed - paidTotal, 0) };
}

async function main() {
  const today = todayIso();
  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
  `;
  const tpConfig = tpConfigFromSettings(settingsRow?.value as Record<string, unknown>);

  const rows = await sql`
    SELECT l.loan_number, l.status, l.total_payable, l.installment_amount, l.installments_count,
           l.due_date, l.notes, l.is_indefinite, l.payment_type,
           c.full_name AS customer_name,
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
  `;

  console.log('Total loans:', rows.length);
  console.log('Today:', today);

  const buckets = {
    completedOk: 0,
    overdueUnderpaid: 0,
    overdueFullyPaid: 0,
    activeUnderpaid: 0,
    activeFullyPaid: 0,
    indefinite: 0,
  };

  const fixToCompleted: string[] = [];
  const suspicious: string[] = [];
  let overdueRemZero = 0;
  const overdueRemZeroList: string[] = [];

  for (const row of rows) {
    if (row.isIndefinite) {
      buckets.indefinite++;
      continue;
    }

    const calc = calcPaid(row, tpConfig);
    const dueStr = toIsoDate(row.dueDate);
    const pastDue = dueStr && dueStr < today;

    if (row.status === 'completed') {
      buckets.completedOk++;
      continue;
    }

    if (calc.isFullyPaid) {
      if (row.status !== 'completed') fixToCompleted.push(row.loanNumber);
      if (pastDue || row.status === 'overdue') buckets.overdueFullyPaid++;
      else buckets.activeFullyPaid++;
    } else if (pastDue || row.status === 'overdue') {
      buckets.overdueUnderpaid++;
      if (calc.remaining <= 0.01) {
        overdueRemZero++;
        if (overdueRemZeroList.length < 20) overdueRemZeroList.push(row.loanNumber);
      }
      if (suspicious.length < 10 && calc.remaining > 0.01) {
        suspicious.push(
          `${row.loanNumber} ${row.customerName} paid=${calc.paidTotal}/${calc.totalOwed} rem=${calc.remaining} slots=${calc.coveredSlots}/${calc.installments}`,
        );
      }
    } else {
      buckets.activeUnderpaid++;
    }
  }

  console.log('\nBuckets:', buckets);
  console.log('Need status→completed:', fixToCompleted.length, fixToCompleted.slice(0, 5));
  console.log('\nOverdue but rem=0 (should complete):', overdueRemZero);
  console.log(overdueRemZeroList.join(', '));
  console.log('\nSample truly underpaid overdue:');
  suspicious.forEach((s) => console.log(' ', s));

  // UI effective overdue count simulation
  let uiOverdue = 0;
  for (const row of rows) {
    if (['completed', 'cancelled', 'forfeited', 'refinanced'].includes(row.status)) continue;
    const dueStr = toIsoDate(row.dueDate);
    if (dueStr && dueStr < today) uiOverdue++;
  }
  console.log('\nUI overdue count (due date passed, not terminal status):', uiOverdue);

  await sql.end();
}

main().catch(console.error);
