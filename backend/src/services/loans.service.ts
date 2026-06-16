import sql from '../db';
import { sendLineNotify } from './line.service';
import { ApiError } from '../utils/apiError';

const LOAN_CREATE_ALLOWED = new Set([
  'customerId', 'principal', 'interestRate', 'interestAmount', 'totalPayable',
  'installmentsCount', 'installmentAmount', 'paymentType',
  'startDate', 'dueDate', 'status', 'notes',
  'isInterestOnly', 'isIndefinite', 'isPawn', 'pawnItem', 'pawnStatus',
]);

const LOAN_UPDATE_ALLOWED = new Set([
  'principal', 'interestRate', 'interestAmount', 'totalPayable',
  'installmentsCount', 'installmentAmount', 'paymentType',
  'startDate', 'dueDate', 'status', 'notes',
  'isInterestOnly', 'isIndefinite', 'isPawn', 'pawnItem', 'pawnStatus',
]);

function pickFields(data: any, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data) result[key] = data[key];
  }
  return result;
}

export async function getAllLoans(tenantId: string) {
  return await sql`
    SELECT l.*, c.full_name as customer_name 
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
    ORDER BY l.created_at DESC
  `;
}

export async function getLoanById(id: string, tenantId: string) {
  const [loan] = await sql`
    SELECT l.*, c.full_name as customer_name, c.phone as customer_phone
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id} AND l.tenant_id = ${tenantId}
  `;
  return loan;
}

export async function dbCreateLoan(data: any, loanNumber: string, userId: string, tenantId: string) {
  const safeData = pickFields(data, LOAN_CREATE_ALLOWED);

  if (!safeData.customerId) throw new ApiError(400, 'กรุณาระบุลูกค้า');
  const [customer] = await sql`
    SELECT id FROM customers WHERE id = ${safeData.customerId as string} AND tenant_id = ${tenantId}
  `;
  if (!customer) throw new ApiError(400, 'ไม่พบลูกค้าในระบบ');

  const result = await sql`
    INSERT INTO loans ${sql({ ...safeData, loanNumber, createdBy: userId, tenantId })}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const loan = result[0];
    const customers = await sql`SELECT full_name FROM customers WHERE id = ${loan.customerId} AND tenant_id = ${tenantId}`;
    if (customers.length > 0) {
      const customer = customers[0];
      const formattedPrincipal = Number(loan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
      const formattedInstallment = Number(loan.installmentAmount).toLocaleString('en-US', {minimumFractionDigits: 2});
      const dueDate = loan.is_indefinite ? 'ไม่มีกำหนด' : new Date(loan.dueDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      
      const message = `📝 แจ้งเตือนเปิดสัญญาใหม่\n👤 ลูกค้า: ${customer.fullName}\n🏷 สัญญา: ${loan.loanNumber}\n💸 ยอดจัด: ${formattedPrincipal} บาท\n📅 ครบกำหนด: ${dueDate}`;
      
      sendLineNotify(message, 'loan', {
        title: '📝 เปิดสัญญาใหม่',
        accentColor: '#0ea5e9',
        items: [
          { label: 'ลูกค้า', value: customer.fullName },
          { label: 'เลขที่สัญญา', value: loan.loanNumber },
          { label: 'ยอดเงินต้น', value: `${formattedPrincipal} บาท`, color: '#0ea5e9' },
          { label: 'ยอดชำระ/งวด', value: `${formattedInstallment} บาท` },
          { label: 'วันที่ครบกำหนด', value: dueDate, color: '#f59e0b' }
        ],
        footer: 'อนุมัติและบันทึกเข้าระบบแล้ว'
      }, tenantId);
    }
  }
  
  return result;
}

function getLogicalDateStr(d: Date): string {
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const thaiTime = new Date(utc + (3600000 * 7));
  thaiTime.setHours(thaiTime.getHours() - 5);
  return `${thaiTime.getFullYear()}-${String(thaiTime.getMonth() + 1).padStart(2, '0')}-${String(thaiTime.getDate()).padStart(2, '0')}`;
}

export async function getOverdueNotifications(tenantId: string) {
  const today = getLogicalDateStr(new Date());
  return await sql`
    SELECT l.id, l.loan_number, l.due_date, l.total_payable, l.status, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.status IN ('active', 'overdue') AND l.due_date <= ${today} AND l.tenant_id = ${tenantId}
    ORDER BY l.due_date ASC
    LIMIT 15
  `;
}

export async function getLoansByCustomerId(customerId: string, tenantId: string) {
  return await sql`
    SELECT * FROM loans 
    WHERE customer_id = ${customerId} AND tenant_id = ${tenantId}
    ORDER BY created_at DESC
  `;
}

export async function dbRefinanceLoan(oldLoanId: string, newData: any, newLoanNumber: string, userId: string, tenantId: string) {
  return await sql.begin(async sql => {
    const [oldLoan] = await sql`SELECT * FROM loans WHERE id = ${oldLoanId} AND tenant_id = ${tenantId}`;
    if (!oldLoan) throw new Error("Loan not found");

    await sql`UPDATE loans SET status = 'refinanced' WHERE id = ${oldLoanId} AND tenant_id = ${tenantId}`;

    const [newLoan] = await sql`
      INSERT INTO loans ${sql({
        customerId: oldLoan.customerId,
        loanNumber: newLoanNumber,
        principal: newData.principal,
        interestRate: newData.interestRate,
        interestAmount: newData.interestAmount,
        totalPayable: newData.totalPayable,
        installmentsCount: newData.installmentsCount,
        installmentAmount: newData.installmentAmount,
        paymentType: newData.paymentType,
        startDate: newData.startDate,
        dueDate: newData.dueDate,
        notes: newData.notes,
        refinancedFrom: oldLoanId,
        is_interest_only: newData.isInterestOnly ?? oldLoan.isInterestOnly,
        is_indefinite: newData.isIndefinite ?? oldLoan.isIndefinite,
        is_pawn: newData.isPawn ?? oldLoan.isPawn,
        pawn_item: newData.pawnItem ?? oldLoan.pawnItem,
        pawn_status: newData.pawnStatus ?? oldLoan.pawnStatus,
        createdBy: userId,
        tenantId
      })}
      RETURNING *
    `;

    // Notify LINE of Refinance
    try {
      const customers = await sql`SELECT full_name FROM customers WHERE id = ${oldLoan.customerId} AND tenant_id = ${tenantId}`;
      const customerName = customers[0]?.fullName || "—";
      const formattedOldPrincipal = Number(oldLoan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
      const formattedNewPrincipal = Number(newLoan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
      
      const message = `🔄 แจ้งเตือนรียอดสัญญาใหม่ (Refinance)\n👤 ลูกค้า: ${customerName}\n📝 สัญญาเดิม: ${oldLoan.loanNumber} (ยอดเดิม: ${formattedOldPrincipal} ฿)\n🆕 สัญญาใหม่: ${newLoan.loanNumber} (ยอดใหม่: ${formattedNewPrincipal} ฿)`;
      
      sendLineNotify(message, 'refinance', {
        title: '🔄 รียอดสัญญาใหม่ (Refinance)',
        accentColor: '#8b5cf6',
        items: [
          { label: 'ลูกค้า', value: customerName },
          { label: 'สัญญาเดิม', value: oldLoan.loanNumber },
          { label: 'สัญญาใหม่', value: newLoan.loanNumber },
          { label: 'ยอดใหม่รวม', value: `${formattedNewPrincipal} บาท`, color: '#8b5cf6' }
        ],
        footer: 'ทำรายการรียอดใหม่สำเร็จแล้ว'
      }, tenantId);
    } catch (err) {
      console.error('Failed to send refinance notification:', err);
    }

    return newLoan;
  });
}

export async function dbUpdateLoan(id: string, data: any, tenantId: string) {
  const [oldLoan] = await sql`SELECT * FROM loans WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (!oldLoan) throw new ApiError(404, 'ไม่พบสัญญา');

  const safeData = pickFields(data, LOAN_UPDATE_ALLOWED);
  if (Object.keys(safeData).length === 0) throw new ApiError(400, 'ไม่มีข้อมูลที่อัปเดต');

  const result = await sql`
    UPDATE loans SET ${sql(safeData)} WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;

  if (result.length > 0 && oldLoan) {
    const newLoan = result[0];
    
    // Check if status changed
    if (oldLoan.status !== newLoan.status) {
      try {
        const customers = await sql`SELECT full_name FROM customers WHERE id = ${newLoan.customerId} AND tenant_id = ${tenantId}`;
        const customerName = customers[0]?.fullName || "—";
        
        if (newLoan.status === 'completed') {
          const formattedPrincipal = Number(newLoan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
          const message = `🎉 แจ้งเตือนปิดยอดสัญญา\n👤 ลูกค้า: ${customerName}\n📝 สัญญา: ${newLoan.loanNumber}\n💸 ยอดเงินต้น: ${formattedPrincipal} บาท`;
          sendLineNotify(message, 'completed', {
            title: '🎉 ปิดยอดสัญญาสำเร็จ',
            accentColor: '#10b981',
            items: [
              { label: 'ลูกค้า', value: customerName },
              { label: 'เลขที่สัญญา', value: newLoan.loanNumber },
              { label: 'ประเภทสัญญา', value: newLoan.isPawn ? 'จำนำทรัพย์สิน' : 'เงินกู้ทั่วไป' },
              { label: 'เงินต้น', value: `${formattedPrincipal} บาท` }
            ],
            footer: 'สัญญานี้ได้รับการปิดยอดเสร็จสิ้นแล้ว'
          }, tenantId);
        } else if (newLoan.status === 'forfeited') {
          const message = `⚠️ แจ้งเตือนทรัพย์สินหลุดจำนำ\n👤 ลูกค้า: ${customerName}\n📝 สัญญา: ${newLoan.loanNumber}\n📦 ทรัพย์สิน: ${newLoan.pawnItem || '—'}`;
          sendLineNotify(message, 'pawn_forfeited', {
            title: '⚠️ ทรัพย์สินหลุดจำนำ',
            accentColor: '#ef4444',
            items: [
              { label: 'ลูกค้า', value: customerName },
              { label: 'เลขที่สัญญา', value: newLoan.loanNumber },
              { label: 'ทรัพย์สินจำนำ', value: newLoan.pawnItem || '—' },
              { label: 'สถานะ', value: 'หลุดจำนำ (ตัดสิทธิ์)' }
            ],
            footer: 'ทรัพย์สินหลุดเข้าคลังร้านโดยสมบูรณ์'
          }, tenantId);
        } else if (newLoan.status === 'overdue' && oldLoan.status !== 'overdue') {
          const formattedInstallment = Number(newLoan.installmentAmount).toLocaleString('en-US', { minimumFractionDigits: 2 });
          sendLineNotify(
            `🚨 สัญญาเปลี่ยนสถานะเป็นค้างชำระ\n👤 ${customerName}\n📝 ${newLoan.loanNumber}`,
            'overdue_alert',
            {
              title: '🚨 สัญญาค้างชำระ',
              accentColor: '#ef4444',
              items: [
                { label: 'ลูกค้า', value: customerName },
                { label: 'เลขที่สัญญา', value: newLoan.loanNumber },
                { label: 'ยอด/งวด', value: `${formattedInstallment} บาท` },
                { label: 'ครบกำหนด', value: String(newLoan.dueDate ?? '—'), color: '#ef4444' },
              ],
              footer: 'ตรวจสอบและติดตามลูกค้าได้ทันที',
            },
            tenantId,
          );
        }
      } catch (err) {
        console.error('Failed to send status transition notification:', err);
      }
    }
  }

  return result;
}

export type LateFeeMode = 'auto' | 'waive' | 'custom';

export async function dbUpdateLoanLateFee(
  id: string,
  data: { mode: LateFeeMode; amount?: number; note?: string | null },
  userId: string,
  tenantId: string,
) {
  const mode = data.mode;
  if (!['auto', 'waive', 'custom'].includes(mode)) {
    throw new Error('รูปแบบการตั้งค่าค่าปรับไม่ถูกต้อง');
  }
  if (mode === 'custom' && (data.amount == null || Number(data.amount) < 0)) {
    throw new Error('กรุณาระบุจำนวนค่าปรับ');
  }

  const [loan] = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id} AND l.tenant_id = ${tenantId}
  `;
  if (!loan) throw new Error('ไม่พบสัญญา');

  const result = await sql`
    UPDATE loans SET
      late_fee_mode = ${mode},
      late_fee_amount = ${mode === 'custom' ? Number(data.amount) : null},
      late_fee_note = ${data.note?.trim() || null},
      late_fee_updated_at = ${new Date()},
      late_fee_updated_by = ${userId}
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;

  if (result.length > 0) {
    const modeLabels: Record<LateFeeMode, string> = {
      auto: 'คำนวณอัตโนมัติ',
      waive: 'ยกเว้นค่าปรับ',
      custom: 'กำหนดเอง',
    };
    const amountText =
      mode === 'custom' && data.amount != null
        ? `${Number(data.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท`
        : mode === 'waive'
          ? '0 บาท'
          : 'ตามระบบ';

    sendLineNotify(
      `⚖️ ปรับค่าปรับสัญญา ${loan.loanNumber}`,
      'late_fee',
      {
        title: '⚖️ ปรับค่าปรับล่าช้า',
        accentColor: '#f59e0b',
        items: [
          { label: 'ลูกค้า', value: loan.customerName },
          { label: 'เลขที่สัญญา', value: loan.loanNumber },
          { label: 'โหมด', value: modeLabels[mode] },
          { label: 'จำนวน', value: amountText, color: '#f59e0b' },
          { label: 'หมายเหตุ', value: data.note?.trim() || '—' },
        ],
        footer: 'มีการปรับค่าปรับในระบบแล้ว',
      },
      tenantId,
    );
  }

  return result;
}

export async function dbDeleteLoan(id: string, tenantId: string) {
  const loans = await sql`
    SELECT l.loan_number, c.full_name as customer_name, l.principal
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id} AND l.tenant_id = ${tenantId}
  `;

  if (loans.length === 0) throw new Error("Loan not found");
  const loan = loans[0];

  return await sql.begin(async sql => {
    // Clear references from other loans (refinanced chains)
    await sql`UPDATE loans SET refinanced_from = NULL WHERE refinanced_from = ${id} AND tenant_id = ${tenantId}`;
    
    await sql`DELETE FROM payments WHERE loan_id = ${id} AND tenant_id = ${tenantId}`;
    const result = await sql`DELETE FROM loans WHERE id = ${id} AND tenant_id = ${tenantId}`;

    const formattedPrincipal = Number(loan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
    const message = `🚨 แจ้งเตือนการลบสัญญา\n👤 ลูกค้า: ${loan.customerName}\n📝 สัญญา: ${loan.loanNumber}\n💸 ยอดเงินต้น: ${formattedPrincipal} บาท`;
    sendLineNotify(message, 'fraud', {
      title: '🚨 ระงับ/ลบสัญญา',
      accentColor: '#ef4444',
      items: [
        { label: 'ลูกค้า', value: loan.customerName },
        { label: 'เลขที่สัญญา', value: loan.loanNumber },
        { label: 'ยอดเงินต้น', value: `${formattedPrincipal} บาท` }
      ],
      footer: 'มีการลบข้อมูลนี้ออกจากระบบ'
    }, tenantId);

    return result;
  });
}

