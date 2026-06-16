import sql from '../db';
import { sendLineNotify } from './line.service';

const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  principal: 'ชำระปกติ',
  interest: 'ดอกเบี้ย',
  roll_penalty: 'ท+ป (ทวนดอก+ปรับ)',
};

function paymentCategoryLabel(category?: string | null) {
  if (!category) return 'ชำระปกติ';
  return PAYMENT_CATEGORY_LABELS[category] ?? category;
}

export async function dbGetPayments(tenantId: string) {
  return await sql`
    SELECT p.*, l.loan_number, c.full_name as customer_name
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
    JOIN customers c ON l.customer_id = c.id
    WHERE p.tenant_id = ${tenantId}
    ORDER BY p.payment_date DESC
  `;
}

export async function dbGetPaymentsByLoan(loanId: string, tenantId: string) {
  return await sql`
    SELECT * FROM payments 
    WHERE loan_id = ${loanId} AND tenant_id = ${tenantId}
    ORDER BY payment_date DESC
  `;
}

export async function dbCreatePayment(data: any, userId: string, tenantId: string) {
  const result = await sql`
    INSERT INTO payments ${sql({ ...data, createdBy: userId, tenantId })}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const payment = result[0];
    const loans = await sql`
      SELECT l.*, c.full_name as customer_name
      FROM loans l
      JOIN customers c ON l.customer_id = c.id
      WHERE l.id = ${payment.loanId} AND l.tenant_id = ${tenantId}
    `;
    
    if (loans.length > 0) {
      const loan = loans[0];

      const allPayments = await sql`SELECT amount FROM payments WHERE loan_id = ${payment.loanId} AND tenant_id = ${tenantId}`;
      const totalPaid = allPayments.reduce((acc, p) => acc + Number(p.amount), 0);
      const remaining = Math.max(Number(loan.isInterestOnly ? loan.principal : loan.totalPayable) - totalPaid, 0);

      const [recorder] = await sql`
        SELECT full_name FROM profiles WHERE id = ${userId}
      `;
      const recorderName = recorder?.fullName || '—';
      const categoryText = paymentCategoryLabel(payment.category);
      const methodText = payment.method ? String(payment.method) : '—';

      const formattedAmount = Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
      const formattedRemaining = remaining.toLocaleString('en-US', { minimumFractionDigits: 2 });

      const message = `🔔 แจ้งเตือนรับชำระเงิน\n👤 ลูกค้า: ${loan.customerName}\n💰 ยอดชำระ: ${formattedAmount} บาท\n📉 คงเหลือ: ${formattedRemaining} บาท\n📂 ประเภท: ${categoryText}`;

      sendLineNotify(message, 'payment', {
        title: '🔔 รับชำระเงินเรียบร้อย',
        accentColor: '#10b981',
        items: [
          { label: 'ลูกค้า', value: loan.customerName },
          { label: 'เลขที่สัญญา', value: loan.loanNumber },
          { label: 'ยอดเงินชำระ', value: `${formattedAmount} บาท`, color: '#10b981' },
          { label: 'ประเภท', value: categoryText },
          { label: 'ช่องทาง', value: methodText },
          { label: 'บันทึกโดย', value: recorderName },
          { label: 'ยอดคงเหลือรวม', value: `${formattedRemaining} บาท`, color: '#ef4444' },
        ],
        footer: 'ตรวจสอบยอดในแอปได้ทันที',
      }, tenantId);
    }
  }
  
  return result;
}

export async function dbDeletePayment(id: string, tenantId: string) {
  const payments = await sql`
    SELECT p.amount, l.loan_number, c.full_name as customer_name
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
    JOIN customers c ON l.customer_id = c.id
    WHERE p.id = ${id} AND p.tenant_id = ${tenantId}
  `;
  
  const result = await sql`DELETE FROM payments WHERE id = ${id} AND tenant_id = ${tenantId}`;
  
  if (payments.length > 0) {
    const p = payments[0];
    const formattedAmount = Number(p.amount).toLocaleString('en-US', {minimumFractionDigits: 2});
    const message = `🚨 แจ้งเตือนความผิดปกติ (ลบข้อมูล)\n👤 ลูกค้า: ${p.customerName}\n📝 สัญญา: ${p.loanNumber}\n❌ ยอดที่ลบ: ${formattedAmount} บาท`;
    sendLineNotify(message, 'fraud', {
      title: '🚨 ยกเลิกรายการชำระ',
      accentColor: '#f59e0b',
      items: [
        { label: 'ลูกค้า', value: p.customerName },
        { label: 'เลขที่สัญญา', value: p.loanNumber },
        { label: 'ยอดที่ถูกลบ', value: `${formattedAmount} บาท` }
      ],
      footer: 'โปรดตรวจสอบความถูกต้องทันที'
    }, tenantId);
  }
  
  return result;
}

export async function dbGetExpenses(tenantId: string) {
  return await sql`SELECT * FROM expenses WHERE tenant_id = ${tenantId} ORDER BY expense_date DESC`;
}

export async function dbCreateExpense(data: any, userId: string, tenantId: string) {
  const result = await sql`
    INSERT INTO expenses ${sql({ ...data, createdBy: userId, tenantId })}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const expense = result[0];
    const categoryMap: any = { fuel: 'ค่าน้ำมัน', staff: 'เงินเดือนพนักงาน', calls: 'ค่าโทรศัพท์', documents: 'ค่าเอกสาร', other: 'อื่นๆ' };
    const catText = categoryMap[expense.category] || expense.category;
    const formattedAmount = Number(expense.amount).toLocaleString('en-US', {minimumFractionDigits: 2});
    const message = `💸 แจ้งเตือนบันทึกรายจ่าย\n📂 หมวดหมู่: ${catText}\n💰 จำนวนเงิน: ${formattedAmount} บาท`;
    sendLineNotify(message, 'expense', {
      title: '💸 บันทึกรายจ่ายใหม่',
      accentColor: '#6366f1',
      items: [
        { label: 'หมวดหมู่', value: catText },
        { label: 'จำนวนเงิน', value: `${formattedAmount} บาท`, color: '#6366f1' },
        { label: 'รายละเอียด', value: expense.details || '-' }
      ],
      footer: 'บันทึกรายจ่ายเข้าระบบแล้ว'
    }, tenantId);
  }
  
  return result;
}

export async function dbDeleteExpense(id: string, tenantId: string) {
  const expenses = await sql`
    SELECT category, amount, details FROM expenses
    WHERE id = ${id} AND tenant_id = ${tenantId}
  `;

  const result = await sql`DELETE FROM expenses WHERE id = ${id} AND tenant_id = ${tenantId}`;

  if (expenses.length > 0) {
    const expense = expenses[0];
    const categoryMap: Record<string, string> = {
      fuel: 'ค่าน้ำมัน',
      staff: 'เงินเดือนพนักงาน',
      calls: 'ค่าโทรศัพท์',
      documents: 'ค่าเอกสาร',
      other: 'อื่นๆ',
    };
    const catText = categoryMap[expense.category] || expense.category;
    const formattedAmount = Number(expense.amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const message = `🚨 แจ้งเตือนลบรายจ่าย\n📂 หมวดหมู่: ${catText}\n❌ ยอดที่ลบ: ${formattedAmount} บาท`;

    sendLineNotify(message, 'fraud', {
      title: '🚨 ยกเลิกรายการรายจ่าย',
      accentColor: '#f59e0b',
      items: [
        { label: 'หมวดหมู่', value: catText },
        { label: 'ยอดที่ถูกลบ', value: `${formattedAmount} บาท` },
        { label: 'รายละเอียด', value: expense.details || '—' },
      ],
      footer: 'โปรดตรวจสอบความถูกต้องทันที',
    }, tenantId);
  }

  return result;
}

