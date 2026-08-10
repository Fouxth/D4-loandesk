import sql from '../db';
import { uploadFileToDiscord } from './discord.service';
import { getAllTenants } from './tenant.service';

export interface BackupResult {
  tenantId: string;
  fileName: string;
  discordUrl?: string;
  stats: {
    customersCount: number;
    loansCount: number;
    paymentsCount: number;
    expensesCount: number;
    totalPrincipal: number;
    totalPaidAmount: number;
  };
  timestamp: string;
}

/**
 * Perform database backup for a specific tenant
 * and upload the resulting JSON file directly to Discord.
 */
export async function runTenantBackup(targetTenantId: string): Promise<BackupResult> {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split('T')[0];
  const timeStr = timestamp.substring(11, 19).replace(/:/g, '');

  // 1. Query all tables for this tenant
  const [customers, loans, payments, expenses, settings, users] = await Promise.all([
    sql`SELECT * FROM customers WHERE tenant_id = ${targetTenantId}`,
    sql`SELECT * FROM loans WHERE tenant_id = ${targetTenantId}`,
    sql`SELECT * FROM payments WHERE tenant_id = ${targetTenantId}`,
    sql`SELECT * FROM expenses WHERE tenant_id = ${targetTenantId}`,
    sql`SELECT * FROM settings WHERE tenant_id = ${targetTenantId}`,
    sql`SELECT id, username, tenant_id, created_at FROM users WHERE tenant_id = ${targetTenantId}`,
  ]);

  // Calculate statistics
  const totalPrincipal = loans.reduce((acc, l) => acc + (Number(l.principal) || 0), 0);
  const totalPaidAmount = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const stats = {
    customersCount: customers.length,
    loansCount: loans.length,
    paymentsCount: payments.length,
    expensesCount: expenses.length,
    totalPrincipal,
    totalPaidAmount,
  };

  const backupPayload = {
    app: 'D4-LoanDesk',
    version: '1.0.0',
    tenantId: targetTenantId,
    timestamp,
    stats,
    data: {
      customers,
      loans,
      payments,
      expenses,
      settings,
      users,
    },
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);
  const buffer = Buffer.from(jsonStr, 'utf-8');
  const fileName = `backup_${targetTenantId}_${dateStr}_${timeStr}.json`;

  const formattedDate = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const messageText = [
    `📦 **[Auto-Backup / สำรองข้อมูลระบบ]**`,
    `🗓️ วันที่: ${formattedDate}`,
    `🏢 ร้านค้า/Tenant: \`${targetTenantId}\``,
    `📊 **สรุปข้อมูลในระบบ:**`,
    `• ลูกค้า: **${stats.customersCount}** ราย`,
    `• สัญญาเงินกู้: **${stats.loansCount}** รายการ (รวมเงินต้น ฿${totalPrincipal.toLocaleString('th-TH')})`,
    `• รายการชำระเงิน: **${stats.paymentsCount}** รายการ (รวมรับชำระ ฿${totalPaidAmount.toLocaleString('th-TH')})`,
    `• ค่าใช้จ่าย: **${stats.expensesCount}** รายการ`,
    `📁 *ไฟล์ JSON ด้านล่างเป็นไฟล์สำรองข้อมูลฉบับเต็ม สามารถดาวน์โหลดเก็บไว้ได้*`,
  ].join('\n');

  let discordUrl = '';
  try {
    discordUrl = await uploadFileToDiscord(
      targetTenantId,
      buffer,
      fileName,
      'application/json',
      messageText,
      'auto-backup'
    );
  } catch (err: any) {
    console.error(`[Backup] Failed to upload backup for ${targetTenantId} to Discord:`, err.message);
  }

  return {
    tenantId: targetTenantId,
    fileName,
    discordUrl,
    stats,
    timestamp,
  };
}

/**
 * Runs backup for all active tenants in the database that have auto-backup enabled
 */
export async function runAllTenantsBackup(): Promise<BackupResult[]> {
  const tenants = await getAllTenants();
  const activeTenants = tenants.filter((t: any) => t.is_active && t.id !== 'system');

  const results: BackupResult[] = [];
  for (const tenant of activeTenants) {
    try {
      // Check if this tenant has enabled auto-backup in settings
      const [config] = await sql`
        SELECT value FROM settings WHERE tenant_id = ${tenant.id} AND key = 'backup_config'
      `;
      if (config && config.value && config.value.enabled === false) {
        console.log(`[Backup] Tenant ${tenant.id} has disabled auto-backup — skipping.`);
        continue;
      }

      const res = await runTenantBackup(tenant.id);
      results.push(res);
    } catch (err: any) {
      console.error(`[Backup] Error backing up tenant ${tenant.id}:`, err.message);
    }
  }

  return results;
}

/**
 * Restores a tenant's database data from a JSON backup payload safely within a PostgreSQL transaction.
 */
export async function restoreTenantBackup(targetTenantId: string, backupPayload: any): Promise<{
  restoredStats: {
    customers: number;
    loans: number;
    payments: number;
    expenses: number;
    settings: number;
  };
}> {
  if (!backupPayload || typeof backupPayload !== 'object' || !backupPayload.data) {
    throw new Error('รูปแบบไฟล์ Backup ไม่ถูกต้อง (Missing data schema)');
  }

  const { customers = [], loans = [], payments = [], expenses = [], settings = [] } = backupPayload.data;

  await sql.begin(async (tx: any) => {
    // Delete existing records for targetTenantId in reverse dependency order
    await tx`DELETE FROM payments WHERE tenant_id = ${targetTenantId}`;
    await tx`DELETE FROM loans WHERE tenant_id = ${targetTenantId}`;
    await tx`DELETE FROM customers WHERE tenant_id = ${targetTenantId}`;
    await tx`DELETE FROM expenses WHERE tenant_id = ${targetTenantId}`;

    // 1. Re-insert Customers
    for (const c of customers) {
      await tx`
        INSERT INTO customers (
          id, tenant_id, full_name, phone, id_card, address, risk_level, notes, created_at, updated_at
        ) VALUES (
          ${c.id}, ${targetTenantId}, ${c.fullName ?? c.full_name}, ${c.phone || null}, ${(c.idCard ?? c.id_card) || null},
          ${c.address || null}, ${c.riskLevel ?? c.risk_level ?? 'medium'}, ${c.notes || null},
          ${c.createdAt ?? c.created_at ?? new Date()}, ${c.updatedAt ?? c.updated_at ?? new Date()}
        )
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, id_card = EXCLUDED.id_card,
          address = EXCLUDED.address, risk_level = EXCLUDED.risk_level, notes = EXCLUDED.notes;
      `;
    }

    // 2. Re-insert Loans
    for (const l of loans) {
      await tx`
        INSERT INTO loans (
          id, tenant_id, customer_id, loan_number, principal, interest_rate, interest_amount,
          total_payable, installments_count, installment_amount, payment_type, is_interest_only,
          is_principal_interest_at_end, is_pawn, pawn_item, pawn_status, is_indefinite,
          document_fee, advance_fee, late_fee_mode, late_fee_amount, late_fee_note, status,
          start_date, due_date, notes, created_at, updated_at
        ) VALUES (
          ${l.id}, ${targetTenantId}, ${l.customerId ?? l.customer_id}, ${l.loanNumber ?? l.loan_number},
          ${Number(l.principal)}, ${Number(l.interestRate ?? l.interest_rate)}, ${Number(l.interestAmount ?? l.interest_amount)},
          ${Number(l.totalPayable ?? l.total_payable)}, ${Number(l.installmentsCount ?? l.installments_count)},
          ${Number(l.installmentAmount ?? l.installment_amount)}, ${l.paymentType ?? l.payment_type},
          ${l.isInterestOnly ?? l.is_interest_only ?? false}, ${l.isPrincipalInterestAtEnd ?? l.is_principal_interest_at_end ?? false},
          ${l.isPawn ?? l.is_pawn ?? false}, ${(l.pawnItem ?? l.pawn_item) || null}, ${l.pawnStatus ?? l.pawn_status ?? 'in_storage'},
          ${l.isIndefinite ?? l.is_indefinite ?? false}, ${Number(l.documentFee ?? l.document_fee ?? 0)},
          ${Number(l.advanceFee ?? l.advance_fee ?? 0)}, ${l.lateFeeMode ?? l.late_fee_mode ?? 'auto'},
          ${Number(l.lateFeeAmount ?? l.late_fee_amount ?? 0)}, ${(l.lateFeeNote ?? l.late_fee_note) || null},
          ${l.status ?? 'active'}, ${l.startDate ?? l.start_date}, ${l.dueDate ?? l.due_date},
          ${l.notes || null}, ${l.createdAt ?? l.created_at ?? new Date()}, ${l.updatedAt ?? l.updated_at ?? new Date()}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status, updated_at = EXCLUDED.updated_at;
      `;
    }

    // 3. Re-insert Payments
    for (const p of payments) {
      await tx`
        INSERT INTO payments (
          id, tenant_id, loan_id, installment_number, amount, payment_date, method, category, notes, slip_url, slip_file_name, created_at
        ) VALUES (
          ${p.id}, ${targetTenantId}, ${p.loanId ?? p.loan_id}, ${(p.installmentNumber ?? p.installment_number) || null},
          ${Number(p.amount)}, ${p.paymentDate ?? p.payment_date}, ${p.method || 'cash'}, ${p.category || 'principal'},
          ${p.notes || null}, ${(p.slipUrl ?? p.slip_url) || null}, ${(p.slipFileName ?? p.slip_file_name) || null},
          ${p.createdAt ?? p.created_at ?? new Date()}
        )
        ON CONFLICT (id) DO NOTHING;
      `;
    }

    // 4. Re-insert Expenses
    for (const e of expenses) {
      await tx`
        INSERT INTO expenses (
          id, tenant_id, category, amount, expense_date, description, created_at
        ) VALUES (
          ${e.id}, ${targetTenantId}, ${e.category || 'other'}, ${Number(e.amount)}, ${e.expenseDate ?? e.expense_date},
          ${e.description || null}, ${e.createdAt ?? e.created_at ?? new Date()}
        )
        ON CONFLICT (id) DO NOTHING;
      `;
    }

    // 5. Re-insert Settings
    for (const s of settings) {
      if (s.key && s.value !== undefined) {
        await tx`
          INSERT INTO settings (tenant_id, key, value, updated_at)
          VALUES (${targetTenantId}, ${s.key}, ${typeof s.value === 'object' ? JSON.stringify(s.value) : s.value}, CURRENT_TIMESTAMP)
          ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
        `;
      }
    }
  });

  return {
    restoredStats: {
      customers: customers.length,
      loans: loans.length,
      payments: payments.length,
      expenses: expenses.length,
      settings: settings.length,
    },
  };
}
