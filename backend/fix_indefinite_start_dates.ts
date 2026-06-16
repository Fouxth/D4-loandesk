/**
 * Reconcile วันเริ่มสัญญาแบบไม่มีกำหนด (ดอกลอย/รายเดือน/รับจำนำ) ที่ import มาก่อนหน้า
 * ให้ตรงกับ parser ใหม่ที่เป็น deterministic (เลิกอิงวันที่ปัจจุบัน)
 *
 *   ดอกลอย (payment_type=daily, indefinite)   -> 2025-01-01
 *   รายเดือน/รับจำนำ (payment_type=monthly)     -> 2025-01-<วันครบกำหนดเดิม>
 *
 * แตะเฉพาะคอลัมน์ start_date ของสัญญาที่ import มา (loan_number LIKE 'IMP%') เท่านั้น
 * ไม่ยุ่งกับ payments หรือข้อมูลที่กรอกด้วยมือ
 *
 * Usage:
 *   npx ts-node fix_indefinite_start_dates.ts            # dry-run
 *   npx ts-node fix_indefinite_start_dates.ts --commit   # เขียนจริง
 *   npx ts-node fix_indefinite_start_dates.ts --tenant=bkj --commit
 */
import sql from './src/db';

const ANCHOR_YM = '2025-01';

function parseArgs(argv: string[]) {
  const commit = argv.includes('--commit');
  return {
    commit,
    tenantId: argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || 'bkj',
  };
}

function targetStartDate(paymentType: string, currentStart: string): string {
  if (paymentType === 'monthly') {
    const day = currentStart.slice(8, 10) || '01';
    return `${ANCHOR_YM}-${day}`;
  }
  return `${ANCHOR_YM}-01`;
}

async function main() {
  const { commit, tenantId } = parseArgs(process.argv.slice(2));
  console.log(`🏢 Tenant: ${tenantId}`);
  console.log(`⚙️  Mode: ${commit ? 'COMMIT' : 'DRY-RUN'}\n`);

  const loans = await sql<
    { id: string; loanNumber: string; paymentType: string; startDate: string }[]
  >`
    SELECT id, loan_number, payment_type, to_char(start_date, 'YYYY-MM-DD') AS start_date
    FROM loans
    WHERE tenant_id = ${tenantId}
      AND is_indefinite = true
      AND loan_number LIKE 'IMP%'
    ORDER BY loan_number
  `;

  console.log(`พบสัญญา indefinite ที่ import มา: ${loans.length}`);

  let toUpdate = 0;
  const updates: { id: string; from: string; to: string }[] = [];
  for (const loan of loans) {
    const target = targetStartDate(loan.paymentType, loan.startDate);
    if (loan.startDate !== target) {
      toUpdate++;
      updates.push({ id: loan.id, from: loan.startDate, to: target });
      if (updates.length <= 15) {
        console.log(`  ${loan.loanNumber}: ${loan.startDate} -> ${target}`);
      }
    }
  }
  if (updates.length > 15) console.log(`  ... และอีก ${updates.length - 15} สัญญา`);
  console.log(`\nต้องอัปเดต: ${toUpdate} สัญญา`);

  if (!commit) {
    console.log('\n✅ Dry-run complete (ไม่มีการเขียน DB)');
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const u of updates) {
      await tx`UPDATE loans SET start_date = ${u.to} WHERE id = ${u.id} AND tenant_id = ${tenantId}`;
    }
  });

  console.log(`\n🎉 อัปเดตเรียบร้อย: ${toUpdate} สัญญา`);
  await sql.end();
}

main().catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
