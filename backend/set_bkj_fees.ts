import sql from './src/db';

const TENANT_ID = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || 'bkj';
const commit = process.argv.includes('--commit');

async function main() {
  const [row] = await sql`
    SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
  `;

  const current = (row?.value ?? {}) as Record<string, unknown>;
  const next = {
    ...current,
    applyLateFee: true,
    tpRollAmount: 0,
    tpPayAmount: 0,
    tpPenaltyAmount: 100,
    lateFeePerHour: 20,
    lateFeeMaxHours: 0,
    lateFeePerDay: 0,
    lateFeeMaxDays: 0,
  };

  console.log('Tenant:', TENANT_ID);
  console.log('Mode:', commit ? 'COMMIT' : 'DRY-RUN');
  console.log('New lending_config:', {
    applyLateFee: next.applyLateFee,
    tpPenaltyAmount: next.tpPenaltyAmount,
    lateFeePerHour: next.lateFeePerHour,
  });

  if (commit) {
    if (row) {
      await sql`
        UPDATE settings SET value = ${next as any}
        WHERE key = 'lending_config' AND tenant_id = ${TENANT_ID}
      `;
    } else {
      await sql`
        INSERT INTO settings (key, value, tenant_id)
        VALUES ('lending_config', ${next as any}, ${TENANT_ID})
      `;
    }

    if (commit) {
      const updated = await sql`
        UPDATE payments
        SET notes = regexp_replace(
          notes,
          'ทบ ([0-9]+) \\+ ปรับ',
          'ทบ \\1 + จ่าย \\1 + ปรับ',
          'g'
        )
        WHERE tenant_id = ${TENANT_ID}
          AND category = 'roll_penalty'
          AND notes LIKE '%ทบ %'
          AND notes NOT LIKE '%จ่าย %'
      `;
      console.log(`อัปเดต notes ท+ป: ${updated.count} รายการ`);
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
