import crypto from 'crypto';
import sql from './src/db';
import { parseWorkbook } from './src/import/excelParsers';
import type { ImportSummary } from './src/import/types';
import path from 'path';

const DEFAULT_FILE = path.join(__dirname, '..', 'บัญชืเงินกู้.xlsx');
const TENANT_ID = 'bkj';

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseArgs(argv: string[]) {
  const commit = argv.includes('--commit');
  const dryRun = argv.includes('--dry-run') || !commit;
  const fileArg = argv.find((a) => !a.startsWith('--') && a.endsWith('.xlsx'));
  const yearArg = argv.find((a) => a.startsWith('--year='))?.split('=')[1];
  return {
    dryRun,
    commit,
    filePath: fileArg || DEFAULT_FILE,
    tenantId: argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || TENANT_ID,
    beYear: yearArg ? parseInt(yearArg, 10) : undefined,
  };
}

async function getImportUserId(tenantId: string): Promise<string> {
  const [user] = await sql`SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1`;
  if (!user) throw new Error(`No user found for tenant "${tenantId}"`);
  return user.id;
}

async function runImport(
  filePath: string,
  tenantId: string,
  commit: boolean,
  beYear?: number,
): Promise<ImportSummary> {
  console.log(`📂 Reading: ${filePath}`);
  console.log(`🏢 Tenant: ${tenantId}`);
  console.log(`⚙️  Mode: ${commit ? 'COMMIT' : 'DRY-RUN'}`);
  if (beYear != null) console.log(`📅 Filter: พ.ศ. ${2500 + beYear} (ปี ${beYear})`);

  const { loans, skipped } = parseWorkbook(filePath, beYear);
  const loansBySheet: Record<string, number> = {};
  for (const loan of loans) {
    loansBySheet[loan.sourceSheet] = (loansBySheet[loan.sourceSheet] || 0) + 1;
  }

  console.log('\n📊 Parsed loans by sheet:');
  for (const [sheet, count] of Object.entries(loansBySheet)) {
    console.log(`  ${sheet}: ${count}`);
  }
  console.log(`  รวม: ${loans.length} สัญญา`);
  if (skipped.length > 0) {
    console.log(`  ข้าม: ${skipped.length} แถว`);
    skipped.slice(0, 10).forEach((s) => console.log(`    - [${s.sheet} R${s.row}] ${s.reason}`));
    if (skipped.length > 10) console.log(`    ... และอีก ${skipped.length - 10} แถว`);
  }

  if (!commit) {
    console.log('\n✅ Dry-run complete (no database changes)');
    return {
      customersCreated: new Set(loans.map((l) => normalizeName(l.customerName))).size,
      loansCreated: loans.length,
      paymentsCreated: loans.reduce((sum, l) => sum + l.payments.length, 0),
      loansBySheet,
      skipped,
    };
  }

  const userId = await getImportUserId(tenantId);
  const customerMap = new Map<string, string>();
  let customersCreated = 0;
  let loansCreated = 0;
  let paymentsCreated = 0;

  // เริ่มเลขสัญญาต่อจากเลข IMP สูงสุดเดิม กัน loan_number ชนตอน import เพิ่มภายหลัง
  const [maxRow] = await sql<{ maxSeq: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(loan_number FROM 4) AS INTEGER)) AS max_seq
    FROM loans
    WHERE tenant_id = ${tenantId} AND loan_number ~ '^IMP[0-9]+$'
  `;
  let loanSeq = (maxRow?.maxSeq ?? 0) + 1;

  const uniqueNames = new Map<string, string>();
  for (const loan of loans) {
    const key = normalizeName(loan.customerName);
    if (!uniqueNames.has(key)) uniqueNames.set(key, loan.customerName);
  }

  console.log(`\n👤 Creating ${uniqueNames.size} customers...`);
  for (const [key, fullName] of uniqueNames) {
    const [existing] = await sql`
      SELECT id FROM customers
      WHERE tenant_id = ${tenantId} AND lower(trim(full_name)) = ${key}
      LIMIT 1
    `;
    if (existing) {
      customerMap.set(key, existing.id);
    } else {
      const [created] = await sql`
        INSERT INTO customers ${sql({
          id: crypto.randomUUID(),
          fullName,
          notes: 'นำเข้าจาก Excel',
          riskLevel: 'medium',
          category: 'new',
          createdBy: userId,
          tenantId,
        })}
        RETURNING id
      `;
      customerMap.set(key, created.id);
      customersCreated++;
    }
  }

  const BATCH_SIZE = 50;
  let duplicatesSkipped = 0;
  console.log(`\n📝 Importing ${loans.length} loans in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < loans.length; i += BATCH_SIZE) {
    const batch = loans.slice(i, i + BATCH_SIZE);

    await sql.begin(async (tx) => {
      const batchPaymentRows: Record<string, unknown>[] = [];

      for (const loan of batch) {
        const customerId = customerMap.get(normalizeName(loan.customerName))!;

        // Idempotency: ตรวจสัญญาซ้ำตาม natural key
        // สัญญาแบบไม่มีกำหนด (ดอกลอย/รายเดือน/รับจำนำ) startDate อิงวันที่ปัจจุบัน ไม่คงที่
        // จึงตรวจซ้ำด้วย (ลูกค้า+ยอดต้น+ยอดต่องวด+ประเภท) แทน ไม่ใช้ start_date
        const [existing] = loan.isIndefinite
          ? await tx`
              SELECT id FROM loans
              WHERE tenant_id = ${tenantId}
                AND customer_id = ${customerId}
                AND principal = ${loan.principal}
                AND installment_amount = ${loan.installmentAmount}
                AND payment_type = ${loan.paymentType}
                AND is_indefinite = true
              LIMIT 1
            `
          : await tx`
              SELECT id FROM loans
              WHERE tenant_id = ${tenantId}
                AND customer_id = ${customerId}
                AND start_date = ${loan.startDate}
                AND principal = ${loan.principal}
                AND installment_amount = ${loan.installmentAmount}
              LIMIT 1
            `;
        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        const loanId = crypto.randomUUID();
        const loanNumber = `IMP${String(loanSeq++).padStart(5, '0')}`;

        await tx`
          INSERT INTO loans ${sql({
            id: loanId,
            customerId,
            principal: loan.principal,
            interestRate: loan.interestRate,
            interestAmount: loan.interestAmount,
            totalPayable: loan.totalPayable,
            installmentsCount: loan.installmentsCount,
            installmentAmount: loan.installmentAmount,
            paymentType: loan.paymentType,
            startDate: loan.startDate,
            dueDate: loan.dueDate,
            status: loan.status,
            notes: loan.notes,
            isInterestOnly: loan.isInterestOnly,
            isIndefinite: loan.isIndefinite,
            isPawn: loan.isPawn,
            pawnItem: loan.pawnItem,
            pawnStatus: loan.isPawn ? 'in_storage' : null,
            loanNumber,
            createdBy: userId,
            tenantId,
          })}
        `;
        loansCreated++;

        for (const payment of loan.payments) {
          batchPaymentRows.push({
            id: crypto.randomUUID(),
            loanId,
            amount: payment.amount,
            paymentDate: payment.paymentDate,
            installmentNumber: payment.installmentNumber,
            method: 'cash',
            category: payment.category ?? 'principal',
            notes: payment.notes ?? null,
            createdBy: userId,
            tenantId,
          });
        }
      }

      if (batchPaymentRows.length > 0) {
        await tx`INSERT INTO payments ${sql(batchPaymentRows)}`;
        paymentsCreated += batchPaymentRows.length;
      }
    });

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= loans.length) {
      console.log(`  ... ${Math.min(i + BATCH_SIZE, loans.length)} / ${loans.length} loans`);
    }
  }

  if (duplicatesSkipped > 0) {
    console.log(`  ⚠️  ข้าม ${duplicatesSkipped} สัญญาซ้ำ (idempotent)`);
  }

  console.log('\n🎉 Import complete!');
  console.log(`  ลูกค้าใหม่: ${customersCreated}`);
  console.log(`  สัญญา: ${loansCreated}`);
  console.log(`  การชำระ: ${paymentsCreated}`);

  return {
    customersCreated,
    loansCreated,
    paymentsCreated,
    loansBySheet,
    skipped,
  };
}

const { dryRun, commit, filePath, tenantId, beYear } = parseArgs(process.argv.slice(2));

runImport(filePath, tenantId, commit, beYear)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Import failed:', e.message);
    process.exit(1);
  });
