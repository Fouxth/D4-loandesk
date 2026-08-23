import sql from '../db';
import { sendLineNotify } from './line.service';
import { ApiError } from '../utils/apiError';
import { dbLogActivity } from './activity.service';
import { getBangkokDateStr } from './lineConfig';

const LOAN_CREATE_ALLOWED = new Set([
  'customerId', 'principal', 'interestRate', 'interestAmount', 'totalPayable',
  'installmentsCount', 'installmentAmount', 'paymentType',
  'startDate', 'dueDate', 'promiseDate', 'status', 'notes',
  'isInterestOnly', 'isIndefinite', 'isPrincipalInterestAtEnd', 'isPawn', 'pawnItem', 'pawnStatus',
  'documentFee', 'advanceFee', 'parkingFee',
]);

const LOAN_UPDATE_ALLOWED = new Set([
  'principal', 'interestRate', 'interestAmount', 'totalPayable',
  'installmentsCount', 'installmentAmount', 'paymentType',
  'startDate', 'dueDate', 'promiseDate', 'status', 'notes',
  'isInterestOnly', 'isIndefinite', 'isPrincipalInterestAtEnd', 'isPawn', 'pawnItem', 'pawnStatus',
  'documentFee', 'advanceFee', 'parkingFee',
]);

function toDateStr(d: any): string {
  if (!d) return '';
  if (typeof d === 'string') return d.substring(0, 10);
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(d).substring(0, 10);
}

function pickFields(data: any, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data) result[key] = data[key];
  }
  return result;
}

export async function getAllLoans(tenantId: string) {
  return await sql`
    SELECT l.*, COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name,
           (SELECT COUNT(*)::int FROM payments p WHERE p.loan_id = l.id AND p.tenant_id = l.tenant_id) as paid_installments_count
    FROM loans l
    LEFT JOIN customers c ON l.customer_id = c.id
    WHERE l.tenant_id = ${tenantId}
    ORDER BY l.created_at DESC
  `;
}

export async function getLoanById(id: string, tenantId: string) {
  const [loan] = await sql`
    SELECT l.*, COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name, c.phone as customer_phone,
           (SELECT COUNT(*)::int FROM payments p WHERE p.loan_id = l.id AND p.tenant_id = l.tenant_id) as paid_installments_count
    FROM loans l
    LEFT JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id} AND l.tenant_id = ${tenantId}
  `;
  return loan;
}

export async function dbCreateLoan(data: any, loanNumber: string, userId: string, tenantId: string) {
  const safeData = pickFields(data, LOAN_CREATE_ALLOWED);

  if (!safeData.customerId && !safeData.isPawn) {
    throw new ApiError(400, 'กรุณาระบุลูกค้า');
  }

  let customerName = 'จำนำไม่ระบุชื่อ';
  if (safeData.customerId) {
    const [customer] = await sql`
      SELECT id, full_name FROM customers WHERE id = ${safeData.customerId as string} AND tenant_id = ${tenantId}
    `;
    if (!customer) throw new ApiError(400, 'ไม่พบลูกค้าในระบบ');
    customerName = customer.fullName || customer.full_name;
  } else {
    safeData.customerId = null;
    if (safeData.pawnItem) {
      customerName = `จำนำ: ${safeData.pawnItem}`;
    }
  }

  // Sanitize empty strings ("") or NaN into valid numeric/fallback values for PostgreSQL
  const toNum = (val: any, fallback = 0) => {
    if (val === null || val === undefined || val === '') return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  };

  safeData.principal = toNum(safeData.principal, 0);
  safeData.interestRate = toNum(safeData.interestRate, 0);
  safeData.interestAmount = toNum(safeData.interestAmount, 0);
  safeData.totalPayable = toNum(safeData.totalPayable, safeData.principal as number);
  safeData.installmentsCount = toNum(safeData.installmentsCount, 1);
  safeData.installmentAmount = toNum(safeData.installmentAmount, safeData.totalPayable as number);
  safeData.documentFee = toNum(safeData.documentFee, 0);
  safeData.advanceFee = toNum(safeData.advanceFee, 0);
  safeData.parkingFee = toNum(safeData.parkingFee, 0);
  safeData.status = (safeData.status as string) || 'active';

  const result = await sql`
    INSERT INTO loans ${sql({ ...safeData, loanNumber, createdBy: userId, tenantId })}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const loan = result[0];
    const formattedPrincipal = Number(loan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
    const formattedInstallment = Number(loan.installmentAmount).toLocaleString('en-US', {minimumFractionDigits: 2});
    const dueDate = loan.is_indefinite ? 'ไม่มีกำหนด' : new Date(loan.dueDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const message = `📝 แจ้งเตือนเปิดสัญญาใหม่\n👤 ลูกค้า: ${customerName}\n🏷 สัญญา: ${loan.loanNumber}\n💸 ยอดจัด: ${formattedPrincipal} บาท\n📅 ครบกำหนด: ${dueDate}`;
    
    try {
      await sendLineNotify(message, 'loan', {
        title: '📝 เปิดสัญญาใหม่',
        accentColor: '#0ea5e9',
        items: [
          { label: 'ลูกค้า', value: customerName },
          { label: 'เลขที่สัญญา', value: loan.loanNumber },
          { label: 'ยอดเงินต้น', value: `${formattedPrincipal} บาท`, color: '#0ea5e9' },
          { label: 'ยอดชำระ/งวด', value: `${formattedInstallment} บาท` },
          { label: 'วันที่ครบกำหนด', value: dueDate, color: '#f59e0b' }
        ],
        footer: 'อนุมัติและบันทึกเข้าระบบแล้ว'
      }, tenantId);
    } catch (lineErr) {
      console.error('[LINE Notify] Failed to send create loan notification:', lineErr);
    }

    await dbLogActivity(tenantId, userId, 'create_loan', 'loan', loan.id, {
      loanNumber: loan.loanNumber || loan.loan_number,
      customerName,
      principal: loan.principal,
    });
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
  const today = getBangkokDateStr();
  const [loans, payments] = await Promise.all([
    sql`
      SELECT l.*, c.full_name as customer_name
      FROM loans l
      JOIN customers c ON l.customer_id = c.id
      WHERE l.tenant_id = ${tenantId}
    `,
    sql`SELECT loan_id, amount, payment_date FROM payments WHERE tenant_id = ${tenantId}`
  ]);

  const list: any[] = [];
  for (const l of loans) {
    const rawStatus = (l.status || 'active').toLowerCase();
    if (['completed', 'closed', 'deleted', 'cancelled', 'refinanced', 'forfeited'].includes(rawStatus)) {
      continue;
    }

    const isIndefinite = l.isIndefinite ?? l.is_indefinite;
    const notes = l.notes ?? '';
    const interestRate = Number(l.interestRate ?? l.interest_rate ?? 0);
    const isZeroDebt = notes.includes('ยอดติด') || notes.includes('ยอดติดค้างชำระ') || (interestRate === 0 && (l.installmentsCount === 1 || !l.paymentType));

    if (isIndefinite || isZeroDebt) continue;

    const isPrincipalInterestAtEnd = l.isPrincipalInterestAtEnd ?? l.is_principal_interest_at_end;
    let nextDue: string | null = null;

    if (isPrincipalInterestAtEnd) {
      const promiseDateStr = toDateStr(l.promiseDate || l.promise_date);
      const dueDateStr = toDateStr(l.dueDate || l.due_date);
      nextDue = promiseDateStr || dueDateStr;
    } else {
      const paidCount = payments.filter((p: any) => (p.loanId || p.loan_id) === l.id).length;
      const startDateStr = toDateStr(l.startDate || l.start_date);
      if (startDateStr) {
        const startParts = startDateStr.split('-').map(Number);
        if (startParts.length === 3 && !startParts.some(isNaN)) {
          const [y, m, d] = startParts;
          const paymentType = l.paymentType || l.payment_type || 'daily';
          const nextDate = new Date(y, m - 1, d);
          if (paymentType === 'daily') nextDate.setDate(nextDate.getDate() + paidCount);
          else if (paymentType === 'weekly') nextDate.setDate(nextDate.getDate() + paidCount * 7);
          else if (paymentType === 'monthly') nextDate.setMonth(nextDate.getMonth() + paidCount);

          const nextDueDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
          const finalDueDateStr = toDateStr(l.dueDate || l.due_date);
          nextDue = (finalDueDateStr && nextDueDateStr > finalDueDateStr) ? finalDueDateStr : nextDueDateStr;
        }
      }
      if (!nextDue) {
        nextDue = toDateStr(l.dueDate || l.due_date) || null;
      }
    }

    if (!nextDue) continue;

    let status = 'active';
    if (nextDue < today) status = 'overdue';
    else if (nextDue === today) status = 'due_today';
    else continue;

    list.push({
      id: l.id,
      loanNumber: l.loanNumber || l.loan_number,
      customerName: l.customerName || l.customer_name,
      dueDate: nextDue,
      totalPayable: Number(l.installmentAmount || l.installment_amount || l.totalPayable || l.total_payable || 0),
      status
    });
  }

  // Sort overdue first, then due today
  list.sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (a.status !== 'overdue' && b.status === 'overdue') return 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return list;
}

export async function getLoansByCustomerId(customerId: string, tenantId: string) {
  return await sql`
    SELECT l.*,
           (SELECT COUNT(*)::int FROM payments p WHERE p.loan_id = l.id AND p.tenant_id = l.tenant_id) as paid_installments_count
    FROM loans l
    WHERE l.customer_id = ${customerId} AND l.tenant_id = ${tenantId}
    ORDER BY l.created_at DESC
  `;
}

export async function dbRefinanceLoan(oldLoanId: string, newData: any, newLoanNumber: string, userId: string, tenantId: string) {
  return await sql.begin(async sql => {
    const [oldLoan] = await sql`SELECT * FROM loans WHERE id = ${oldLoanId} AND tenant_id = ${tenantId}`;
    if (!oldLoan) throw new Error("Loan not found");

    await sql`UPDATE loans SET status = 'refinanced' WHERE id = ${oldLoanId} AND tenant_id = ${tenantId}`;

    const isInterestOnly = Boolean(newData.isInterestOnly ?? oldLoan.isInterestOnly);
    const isIndefinite = Boolean(newData.isIndefinite ?? oldLoan.isIndefinite);
    const isPrincipalInterestAtEnd = Boolean(newData.isPrincipalInterestAtEnd ?? oldLoan.isPrincipalInterestAtEnd);
    const isPawn = Boolean(newData.isPawn ?? oldLoan.isPawn);

    const [newLoan] = await sql`
      INSERT INTO loans ${sql({
        customerId: oldLoan.customerId,
        loanNumber: newLoanNumber,
        principal: Number(newData.principal || 0),
        interestRate: Number(newData.interestRate || 0),
        interestAmount: Number(newData.interestAmount || 0),
        totalPayable: Number(newData.totalPayable || 0),
        installmentsCount: Number(newData.installmentsCount || 1),
        installmentAmount: Number(newData.installmentAmount || 0),
        paymentType: newData.paymentType || 'daily',
        startDate: toDateStr(newData.startDate) || getBangkokDateStr(),
        dueDate: isIndefinite ? null : (toDateStr(newData.dueDate) || null),
        promiseDate: toDateStr(newData.promiseDate) || (isPrincipalInterestAtEnd ? (toDateStr(newData.dueDate) || null) : null),
        notes: newData.notes,
        refinancedFrom: oldLoanId,
        isInterestOnly,
        isIndefinite,
        isPrincipalInterestAtEnd,
        isPawn,
        pawnItem: isPawn ? (newData.pawnItem || oldLoan.pawnItem || null) : null,
        pawnStatus: isPawn ? (newData.pawnStatus || oldLoan.pawnStatus || 'active') : null,
        documentFee: Number(newData.documentFee || 0),
        advanceFee: Number(newData.advanceFee || 0),
        parkingFee: Number(newData.parkingFee || 0),
        status: 'active',
        createdBy: userId,
        tenantId
      })}
      RETURNING *
    `;

    const deductedOldRemaining = Number(newData.deductedOldRemaining || 0);
    const docFee = Number(newData.documentFee || 0);
    const advFee = Number(newData.advanceFee || 0);
    const parkFee = Number(newData.parkingFee || 0);
    const netDisbursement = Math.max(Number(newLoan.principal || 0) - deductedOldRemaining - docFee - advFee - parkFee, 0);

    // Activity Log
    try {
      await dbLogActivity(tenantId, userId, 'refinance_loan', 'loan', newLoan.id, {
        oldLoanId,
        oldLoanNumber: oldLoan.loanNumber,
        newLoanNumber: newLoan.loanNumber,
        oldPrincipal: oldLoan.principal,
        newPrincipal: newLoan.principal,
        deductedOldRemaining,
        netDisbursement,
      });
    } catch (logErr) {
      console.error('Failed to log refinance activity:', logErr);
    }

    // Notify LINE of Refinance
    try {
      let customerName = 'จำนำไม่ระบุชื่อ';
      if (oldLoan.customerId) {
        const customers = await sql`SELECT full_name FROM customers WHERE id = ${oldLoan.customerId} AND tenant_id = ${tenantId}`;
        customerName = customers[0]?.fullName || customers[0]?.full_name || '—';
      } else if (newLoan.pawnItem) {
        customerName = `จำนำ: ${newLoan.pawnItem}`;
      }

      const formattedOldPrincipal = Number(oldLoan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
      const formattedNewPrincipal = Number(newLoan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
      const formattedDeducted = deductedOldRemaining.toLocaleString('en-US', {minimumFractionDigits: 2});
      const formattedNet = netDisbursement.toLocaleString('en-US', {minimumFractionDigits: 2});
      
      const message = `🔄 แจ้งเตือนรียอดสัญญาใหม่ (Refinance)\n👤 ลูกค้า: ${customerName}\n📝 สัญญาเดิม: ${oldLoan.loanNumber} (ยอดเดิม: ${formattedOldPrincipal} ฿)\n🆕 สัญญาใหม่: ${newLoan.loanNumber} (ยอดจัดใหม่: ${formattedNewPrincipal} ฿)\n✂️ หักยอดค้างเดิม: ${formattedDeducted} ฿\n💵 จ่ายลูกค้าจริง: ${formattedNet} ฿`;
      
      await sendLineNotify(message, 'refinance', {
        title: '🔄 รียอดสัญญาใหม่ (Refinance)',
        accentColor: '#8b5cf6',
        items: [
          { label: 'ลูกค้า', value: customerName },
          { label: 'สัญญาเดิม', value: oldLoan.loanNumber },
          { label: 'สัญญาใหม่ (เริ่มส่งใหม่)', value: newLoan.loanNumber },
          { label: 'ยอดจัดสัญญาใหม่', value: `${formattedNewPrincipal} บาท`, color: '#8b5cf6' },
          { label: 'หักยอดค้างเดิม', value: `${formattedDeducted} บาท` },
          { label: 'ยอดเงินจ่ายลูกค้าจริง', value: `${formattedNet} บาท`, color: '#10b981' }
        ],
        footer: 'ทำรายการรียอดใหม่สำเร็จแล้ว (เริ่มส่งงวดที่ 1 ใหม่)'
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
          await sendLineNotify(message, 'completed', {
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
          await sendLineNotify(message, 'pawn_forfeited', {
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
          await sendLineNotify(
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

    await sendLineNotify(
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

export async function dbTopupLoanPrincipal(
  id: string,
  data: {
    addedPrincipal: number;
    newInstallmentAmount?: number;
    newInterestRate?: number;
    topupDate?: string;
    notes?: string;
  },
  userId: string,
  tenantId: string
) {
  const addedPrincipal = Number(data.addedPrincipal || 0);
  if (addedPrincipal <= 0) {
    throw new ApiError(400, 'กรุณาระบุยอดเงินต้นที่เบิกเพิ่มให้ถูกต้อง (มากกว่า 0)');
  }

  const [loan] = await sql`
    SELECT l.*, c.full_name as customer_name
    FROM loans l
    LEFT JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id} AND l.tenant_id = ${tenantId}
  `;
  if (!loan) throw new ApiError(404, 'ไม่พบสัญญา');

  const oldPrincipal = Number(loan.principal || 0);
  const newPrincipal = oldPrincipal + addedPrincipal;

  const oldInstallment = Number(loan.installmentAmount ?? loan.installment_amount ?? 0);
  const newInstallmentAmount = data.newInstallmentAmount != null && Number(data.newInstallmentAmount) > 0
    ? Number(data.newInstallmentAmount)
    : oldInstallment;

  const newInterestRate = data.newInterestRate != null && Number(data.newInterestRate) >= 0
    ? Number(data.newInterestRate)
    : Number(loan.interestRate ?? loan.interest_rate ?? 0);

  const topupDateStr = data.topupDate ? String(data.topupDate).substring(0, 10) : getBangkokDateStr();
  const topupNoteEntry = `[${topupDateStr}] เบิกเงินต้นเพิ่ม +฿${addedPrincipal.toLocaleString()} (ยอดเดิม ฿${oldPrincipal.toLocaleString()} → ยอดใหม่ ฿${newPrincipal.toLocaleString()}${data.notes ? ` : ${data.notes}` : ''})`;
  const existingNotes = loan.notes ? String(loan.notes).trim() : '';
  const updatedNotes = existingNotes ? `${existingNotes}\n${topupNoteEntry}` : topupNoteEntry;

  const isInterestOnly = Boolean(loan.isInterestOnly || loan.is_interest_only);
  const newTotalPayable = isInterestOnly ? newPrincipal : (Number(loan.totalPayable || loan.total_payable || 0) + addedPrincipal);

  const result = await sql`
    UPDATE loans SET
      principal = ${newPrincipal},
      installment_amount = ${newInstallmentAmount},
      interest_rate = ${newInterestRate},
      total_payable = ${newTotalPayable},
      notes = ${updatedNotes},
      updated_at = ${new Date()}
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;

  if (result.length > 0) {
    const customerName = loan.customerName || loan.customer_name || 'ลูกค้า';
    const formattedAdded = addedPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const formattedNewPrincipal = newPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const formattedNewInstallment = newInstallmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });

    try {
      await sendLineNotify(
        `➕ เบิกเงินต้นดอกลอยเพิ่ม\n👤 ${customerName}\n📝 ${loan.loanNumber}\n💰 เพิ่ม: ฿${formattedAdded}\n💸 เงินต้นรวมใหม่: ฿${formattedNewPrincipal}`,
        'loan',
        {
          title: '➕ เบิกเงินต้นเพิ่ม (ดอกลอย)',
          accentColor: '#0ea5e9',
          items: [
            { label: 'ลูกค้า', value: customerName },
            { label: 'เลขที่สัญญา', value: loan.loanNumber },
            { label: 'ยอดเบิกเพิ่ม', value: `+${formattedAdded} บาท`, color: '#10b981' },
            { label: 'เงินต้นรวมใหม่', value: `${formattedNewPrincipal} บาท`, color: '#0ea5e9' },
            { label: 'ดอกเบี้ย/งวดใหม่', value: `${formattedNewInstallment} บาท` },
            { label: 'หมายเหตุ', value: data.notes || '—' },
          ],
          footer: 'อัปเดตยอดเงินต้นในสัญญาเรียบร้อยแล้ว',
        },
        tenantId
      );
    } catch (lineErr) {
      console.error('[LINE Notify] Failed to send top-up notification:', lineErr);
    }

    try {
      await dbLogActivity(tenantId, userId, 'topup_loan', 'loan', id, {
        loanNumber: loan.loanNumber || loan.loan_number,
        customerName,
        addedPrincipal,
        oldPrincipal,
        newPrincipal,
        newInstallmentAmount,
        notes: data.notes,
      });
    } catch (logErr) {
      console.error('Failed to log top-up activity:', logErr);
    }
  }

  return result[0];
}

export async function dbDeleteLoan(id: string, tenantId: string) {
  const loans = await sql`
    SELECT l.loan_number, COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name, l.principal
    FROM loans l
    LEFT JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id} AND l.tenant_id = ${tenantId}
  `;

  if (loans.length === 0) throw new Error("Loan not found");
  const loan = loans[0];
  const customerName = loan.customerName || loan.customer_name || 'จำนำไม่ระบุชื่อ';
  const loanNumber = loan.loanNumber || loan.loan_number || id;

  return await sql.begin(async sql => {
    // Clear references from other loans (refinanced chains)
    await sql`UPDATE loans SET refinanced_from = NULL WHERE refinanced_from = ${id} AND tenant_id = ${tenantId}`;
    
    // Delete attachments
    try {
      await sql`DELETE FROM loan_attachments WHERE loan_id = ${id}`;
    } catch (attErr) {
      console.warn('Could not delete loan attachments:', attErr);
    }

    // Delete payments and the loan itself
    await sql`DELETE FROM payments WHERE loan_id = ${id} AND tenant_id = ${tenantId}`;
    const result = await sql`DELETE FROM loans WHERE id = ${id} AND tenant_id = ${tenantId}`;

    const formattedPrincipal = Number(loan.principal || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
    const message = `🚨 แจ้งเตือนการลบสัญญา\n👤 ลูกค้า: ${customerName}\n📝 สัญญา: ${loanNumber}\n💸 ยอดเงินต้น: ${formattedPrincipal} บาท`;
    
    try {
      await sendLineNotify(message, 'fraud', {
        title: '🚨 ระงับ/ลบสัญญา',
        accentColor: '#ef4444',
        items: [
          { label: 'ลูกค้า', value: customerName },
          { label: 'เลขที่สัญญา', value: loanNumber },
          { label: 'ยอดเงินต้น', value: `${formattedPrincipal} บาท` }
        ],
        footer: 'มีการลบข้อมูลนี้ออกจากระบบ'
      }, tenantId);
    } catch (lineErr) {
      console.error('Failed to send delete loan line notification:', lineErr);
    }

    return result;
  });
}

