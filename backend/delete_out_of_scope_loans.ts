/**
 * ลบสัญญารายวันที่ "หลุด scope ปี 69" ออกจาก DB
 * 5 สัญญานี้เริ่มจริงปี 67-68 (ต้ม/อาร์ท/อาร์ม/หมู/ผึ้ง) แต่หลุดเข้ามาเพราะบั๊ก typo วันที่
 * ระบุด้วย loan_number ตรงตัว (ตาม audit "DB ไม่มีใน Excel") เพื่อไม่ให้ชนสัญญาชื่อซ้ำ
 *
 * Usage:
 *   npx ts-node delete_out_of_scope_loans.ts            # dry-run
 *   npx ts-node delete_out_of_scope_loans.ts --commit   # ลบจริง
 */
import sql from './src/db';

const TENANT_ID = 'bkj';
const TARGET_LOAN_NUMBERS = ['IMP00034', 'IMP00035', 'IMP00036', 'IMP00037', 'IMP00038'];

async function main() {
  const commit = process.argv.includes('--commit');
  console.log(`🏢 Tenant: ${TENANT_ID}`);
  console.log(`⚙️  Mode: ${commit ? 'COMMIT' : 'DRY-RUN'}\n`);

  const loans = await sql<
    { id: string; loanNumber: string; customerName: string; startDate: string; payCount: number }[]
  >`
    SELECT l.id, l.loan_number, c.full_name AS customer_name,
           to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
           (SELECT COUNT(*) FROM payments p WHERE p.loan_id = l.id) AS pay_count
    FROM loans l
    JOIN customers c ON c.id = l.customer_id
    WHERE l.tenant_id = ${TENANT_ID}
      AND l.loan_number = ANY(${TARGET_LOAN_NUMBERS})
    ORDER BY l.loan_number
  `;

  if (loans.length === 0) {
    console.log('ไม่พบสัญญาเป้าหมาย (อาจลบไปแล้ว)');
    await sql.end();
    return;
  }

  for (const l of loans) {
    console.log(`🗑️  ${l.loanNumber} | ${l.customerName} | start=${l.startDate} | payments=${l.payCount}`);
  }

  const found = new Set(loans.map((l) => l.loanNumber));
  const missing = TARGET_LOAN_NUMBERS.filter((n) => !found.has(n));
  if (missing.length) console.log(`\n⚠️  ไม่พบ: ${missing.join(', ')}`);

  if (!commit) {
    console.log(`\n✅ Dry-run complete — จะลบ ${loans.length} สัญญา (ไม่มีการเขียน DB)`);
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const l of loans) {
      await tx`UPDATE loans SET refinanced_from = NULL WHERE refinanced_from = ${l.id} AND tenant_id = ${TENANT_ID}`;
      await tx`DELETE FROM payments WHERE loan_id = ${l.id} AND tenant_id = ${TENANT_ID}`;
      await tx`DELETE FROM loans WHERE id = ${l.id} AND tenant_id = ${TENANT_ID}`;
    }
  });

  console.log(`\n🎉 ลบเรียบร้อย ${loans.length} สัญญา`);
  await sql.end();
}

main().catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
