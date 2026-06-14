import sql from './src/db';

const TENANT_ID = 'bkj';

async function main() {
  const [counts] = await sql`
    SELECT
      (SELECT count(*) FROM customers WHERE tenant_id = ${TENANT_ID}) as customers,
      (SELECT count(*) FROM loans WHERE tenant_id = ${TENANT_ID}) as loans,
      (SELECT count(*) FROM payments WHERE tenant_id = ${TENANT_ID}) as payments
  `;

  const byStatus = await sql`
    SELECT status, count(*)::int as count
    FROM loans WHERE tenant_id = ${TENANT_ID}
    GROUP BY status ORDER BY count DESC
  `;

  const samples = await sql`
    SELECT l.loan_number, c.full_name, l.principal, l.installment_amount, l.status, l.notes
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${TENANT_ID}
    ORDER BY l.created_at DESC
    LIMIT 5
  `;

  const pawnCount = await sql`
    SELECT count(*)::int as count FROM loans WHERE tenant_id = ${TENANT_ID} AND is_pawn = true
  `;

  const interestOnlyCount = await sql`
    SELECT count(*)::int as count FROM loans WHERE tenant_id = ${TENANT_ID} AND is_interest_only = true
  `;

  console.log('Counts:', counts);
  console.log('\nLoans by status:', byStatus);
  console.log('Pawn loans:', pawnCount[0].count);
  console.log('Interest-only loans:', interestOnlyCount[0].count);
  console.log('\nSample loans:');
  samples.forEach((s) => console.log(`  ${s.loanNumber} | ${s.fullName} | ${s.principal} | ${s.status}`));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
