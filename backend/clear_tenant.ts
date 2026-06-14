import sql from './src/db';

const TENANT_ID = process.argv[2] || 'bkj';

async function clearTenantData(tenantId: string) {
  console.log(`🧹 Clearing business data for tenant: ${tenantId}`);

  const [tenant] = await sql`SELECT id, name FROM tenants WHERE id = ${tenantId}`;
  if (!tenant) {
    throw new Error(`Tenant "${tenantId}" not found`);
  }

  const countsBefore = {
    customers: Number((await sql`SELECT count(*) as count FROM customers WHERE tenant_id = ${tenantId}`)[0].count),
    loans: Number((await sql`SELECT count(*) as count FROM loans WHERE tenant_id = ${tenantId}`)[0].count),
    payments: Number((await sql`SELECT count(*) as count FROM payments WHERE tenant_id = ${tenantId}`)[0].count),
    expenses: Number((await sql`SELECT count(*) as count FROM expenses WHERE tenant_id = ${tenantId}`)[0].count),
    activityLogs: Number((await sql`SELECT count(*) as count FROM activity_logs WHERE tenant_id = ${tenantId}`)[0].count),
    attachments: Number((await sql`
      SELECT count(*) as count
      FROM loan_attachments la
      JOIN loans l ON l.id = la.loan_id
      WHERE l.tenant_id = ${tenantId}
    `)[0].count),
  };

  console.log('📊 Before:', countsBefore);

  await sql.begin(async (tx) => {
    await tx`UPDATE loans SET refinanced_from = NULL WHERE tenant_id = ${tenantId}`;

    await tx`
      DELETE FROM loan_attachments
      WHERE loan_id IN (SELECT id FROM loans WHERE tenant_id = ${tenantId})
    `;
    await tx`DELETE FROM payments WHERE tenant_id = ${tenantId}`;
    await tx`DELETE FROM loans WHERE tenant_id = ${tenantId}`;
    await tx`DELETE FROM customers WHERE tenant_id = ${tenantId}`;
    await tx`DELETE FROM expenses WHERE tenant_id = ${tenantId}`;
    await tx`DELETE FROM activity_logs WHERE tenant_id = ${tenantId}`;
  });

  const countsAfter = {
    customers: Number((await sql`SELECT count(*) as count FROM customers WHERE tenant_id = ${tenantId}`)[0].count),
    loans: Number((await sql`SELECT count(*) as count FROM loans WHERE tenant_id = ${tenantId}`)[0].count),
    payments: Number((await sql`SELECT count(*) as count FROM payments WHERE tenant_id = ${tenantId}`)[0].count),
    expenses: Number((await sql`SELECT count(*) as count FROM expenses WHERE tenant_id = ${tenantId}`)[0].count),
    activityLogs: Number((await sql`SELECT count(*) as count FROM activity_logs WHERE tenant_id = ${tenantId}`)[0].count),
    attachments: Number((await sql`
      SELECT count(*) as count
      FROM loan_attachments la
      JOIN loans l ON l.id = la.loan_id
      WHERE l.tenant_id = ${tenantId}
    `)[0].count),
  };

  console.log('✅ After:', countsAfter);
  console.log(`\n🎉 Cleared tenant "${tenant.name}" (${tenantId}) — users and settings kept`);
}

clearTenantData(TENANT_ID)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Clear failed:', e.message);
    process.exit(1);
  });
