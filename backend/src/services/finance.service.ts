import sql from '../db';
import { sendLineNotify } from './line.service';
import { dbLogActivity } from './activity.service';

const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  principal: 'ชำระปกติ',
  interest: 'ดอกเบี้ย',
  roll_penalty: 'ท+ป (ทวนดอก+ปรับ)',
};

function paymentCategoryLabel(category?: string | null) {
  if (!category) return 'ชำระปกติ';
  return PAYMENT_CATEGORY_LABELS[category] ?? category;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'เงินสด',
  bank_transfer: 'โอนผ่านธนาคาร',
  other: 'อื่นๆ',
};

function paymentMethodLabel(method?: string | null) {
  if (!method) return 'เงินสด';
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export async function dbGetPayments(tenantId: string) {
  return await sql`
    SELECT p.*, l.loan_number, COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
    LEFT JOIN customers c ON l.customer_id = c.id
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

export async function dbCreatePayment(data: any, userId: string, tenantId: string, client: any = sql) {
  // Verify that the target loan belongs to the caller tenant before inserting payment
  const targetLoans = await client`
    SELECT id FROM loans WHERE id = ${data.loanId} AND tenant_id = ${tenantId}
  `;
  if (targetLoans.length === 0) {
    throw new Error('ไม่พบข้อมูลสัญญา หรือคุณไม่มีสิทธิ์เข้าถึงสัญญานี้');
  }

  const result = await client`
    INSERT INTO payments ${client({ ...data, createdBy: userId, tenantId })}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const payment = result[0];
    const loans = await client`
      SELECT l.*, COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name
      FROM loans l
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE l.id = ${payment.loanId} AND l.tenant_id = ${tenantId}
    `;
    
    if (loans.length > 0) {
      const loan = loans[0];
      const allPayments = await client`SELECT amount, category FROM payments WHERE loan_id = ${payment.loanId} AND tenant_id = ${tenantId}`;

      let remaining = 0;
      let isClosedNow = false;
      const isInterestOnlyLoan = Boolean(loan.is_interest_only || loan.is_pawn || loan.isInterestOnly || loan.isPawn);

      if (isInterestOnlyLoan) {
        const principalPaid = allPayments
          .filter((p: any) => p.category === 'principal')
          .reduce((acc: number, p: any) => acc + Number(p.amount), 0);

        remaining = Math.max(Number(loan.principal) - principalPaid, 0);

        // If principal is fully paid (principalPaid >= principal), close contract!
        if (remaining === 0 && loan.status !== 'completed') {
          await client`UPDATE loans SET status = 'completed' WHERE id = ${loan.id} AND tenant_id = ${tenantId}`;
          isClosedNow = true;
        }

        if (payment.category === 'interest') {
          const currentDueDateStr = loan.due_date ? String(loan.due_date).split('T')[0] : String(loan.start_date || loan.startDate).split('T')[0];
          const parts = currentDueDateStr.split('-').map(Number);
          if (parts.length === 3) {
            const [y, m, d] = parts;
            const nextDate = new Date(y, m, d);
            const nextDueDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            await client`UPDATE loans SET due_date = ${nextDueDateStr} WHERE id = ${loan.id} AND tenant_id = ${tenantId}`;
          }
        }
      } else {
        const totalPaid = allPayments.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
        remaining = Math.max(Number(loan.total_payable || loan.totalPayable) - totalPaid, 0);

        if (remaining <= 0 && (loan.status || '').toLowerCase() !== 'completed') {
          await client`UPDATE loans SET status = 'completed' WHERE id = ${loan.id} AND tenant_id = ${tenantId}`;
          isClosedNow = true;
        }
      }

      if (isClosedNow) {
        const formattedPrincipal = Number(loan.principal).toLocaleString('en-US', { minimumFractionDigits: 2 });
        const completedMsg = `🎉 แจ้งเตือนปิดยอดสัญญา\n👤 ลูกค้า: ${loan.customerName}\n📝 สัญญา: ${loan.loanNumber}\n💸 ยอดเงินต้น: ${formattedPrincipal} บาท`;
        try {
          await sendLineNotify(completedMsg, 'completed', {
            title: '🎉 ปิดยอดสัญญาสำเร็จ',
            accentColor: '#10b981',
            items: [
              { label: 'ลูกค้า', value: loan.customerName },
              { label: 'เลขที่สัญญา', value: loan.loanNumber },
              { label: 'ประเภทสัญญา', value: (loan.is_pawn || loan.isPawn) ? 'จำนำทรัพย์สิน' : 'เงินกู้ทั่วไป' },
              { label: 'ยอดเงินต้น', value: `${formattedPrincipal} บาท` },
              { label: 'สถานะ', value: 'ชำระครบถ้วน ปิดยอดแล้ว ✅' },
            ],
            footer: 'สัญญานี้ได้รับการปิดยอดเสร็จสิ้นแล้ว',
          }, tenantId);
        } catch (lineErr) {
          console.error('[LINE Notify] Failed to send completed notification:', lineErr);
        }
      }

      const [recorder] = await client`
        SELECT full_name FROM profiles WHERE id = ${userId}
      `;
      const recorderName = recorder?.fullName || '—';
      const categoryText = paymentCategoryLabel(payment.category);
      const methodText = paymentMethodLabel(payment.method);

      const formattedAmount = Number(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
      const formattedRemaining = remaining.toLocaleString('en-US', { minimumFractionDigits: 2 });

      const message = `🔔 แจ้งเตือนรับชำระเงิน\n👤 ลูกค้า: ${loan.customerName}\n💰 ยอดชำระ: ${formattedAmount} บาท\n📉 คงเหลือเงินต้น: ${formattedRemaining} บาท\n📂 ประเภท: ${categoryText}\n💳 ช่องทาง: ${methodText}`;

      try {
        await sendLineNotify(message, 'payment', {
          title: '🔔 รับชำระเงินเรียบร้อย',
          accentColor: '#10b981',
          items: [
            { label: 'ลูกค้า', value: loan.customerName },
            { label: 'เลขที่สัญญา', value: loan.loanNumber },
            { label: 'ยอดเงินชำระ', value: `${formattedAmount} บาท`, color: '#10b981' },
            { label: 'ประเภท', value: categoryText },
            { label: 'ช่องทาง', value: methodText },
            { label: 'บันทึกโดย', value: recorderName },
            { label: 'ยอดเงินต้นคงเหลือ', value: `${formattedRemaining} บาท`, color: '#ef4444' },
          ],
          footer: 'ตรวจสอบยอดในแอปได้ทันที',
        }, tenantId);
      } catch (lineErr) {
        console.error('[LINE Notify] Failed to send payment notification:', lineErr);
      }
    }
  }

  if (result.length > 0) {
    await dbLogActivity(tenantId, userId, 'record_payment', 'payment', result[0].id, {
      amount: data.amount,
      category: data.category,
    });
  }
  
  return result;
}

export async function dbDeletePayment(id: string, tenantId: string) {
  const payments = await sql`
    SELECT p.amount, p.loan_id, l.loan_number, l.status as loan_status, l.total_payable, l.principal, l.is_interest_only,
           COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
    LEFT JOIN customers c ON l.customer_id = c.id
    WHERE p.id = ${id} AND p.tenant_id = ${tenantId}
  `;
  
  const result = await sql`DELETE FROM payments WHERE id = ${id} AND tenant_id = ${tenantId}`;
  
  if (payments.length > 0) {
    const p = payments[0];
    const loanId = p.loanId || p.loan_id;
    
    // If the loan was previously marked as completed, check if deleting this payment reopens debt
    if (loanId && p.loanStatus === 'completed') {
      const isInterestOnlyLoan = Boolean(p.isInterestOnly || p.is_interest_only);
      const [remainingRes] = isInterestOnlyLoan
        ? await sql`
            SELECT COALESCE(SUM(amount::numeric), 0) as total_paid
            FROM payments
            WHERE loan_id = ${loanId} AND tenant_id = ${tenantId} AND category = 'principal'
          `
        : await sql`
            SELECT COALESCE(SUM(amount::numeric), 0) as total_paid
            FROM payments
            WHERE loan_id = ${loanId} AND tenant_id = ${tenantId}
          `;
      const totalPaid = Number(remainingRes?.totalPaid ?? remainingRes?.total_paid ?? 0);
      const totalTarget = Number(isInterestOnlyLoan ? p.principal : p.totalPayable);
      if (totalPaid < totalTarget) {
        await sql`
          UPDATE loans
          SET status = 'active'
          WHERE id = ${loanId} AND tenant_id = ${tenantId}
        `;
      }
    }

    const formattedAmount = Number(p.amount).toLocaleString('en-US', {minimumFractionDigits: 2});
    const message = `🚨 แจ้งเตือนความผิดปกติ (ลบข้อมูล)\n👤 ลูกค้า: ${p.customerName}\n📝 สัญญา: ${p.loanNumber}\n❌ ยอดที่ลบ: ${formattedAmount} บาท`;
    try {
      await sendLineNotify(message, 'fraud', {
        title: '🚨 ยกเลิกรายการชำระ',
        accentColor: '#f59e0b',
        items: [
          { label: 'ลูกค้า', value: p.customerName },
          { label: 'เลขที่สัญญา', value: p.loanNumber },
          { label: 'ยอดที่ถูกลบ', value: `${formattedAmount} บาท` }
        ],
        footer: 'มีการลบประวัติการชำระเงินนี้ออกจากระบบ'
      }, tenantId);
    } catch (lineErr) {
      console.error('[LINE Notify] Failed to send fraud notification:', lineErr);
    }
  
    await dbLogActivity(tenantId, null, 'delete_payment', 'payment', id, {
      loanNumber: p.customerName ? `${p.customerName} (${p.loanNumber})` : p.loanNumber,
      amount: p.amount,
    });
  }
  
  return result;
}

export async function dbCreateBulkPayments(
  paymentsList: Array<any>,
  userId: string,
  tenantId: string
) {
  if (!Array.isArray(paymentsList) || paymentsList.length === 0) {
    throw new Error('กรุณาระบุรายการชำระเงิน');
  }

  // Execute all payments in an atomic transaction through dbCreatePayment
  const results = await sql.begin(async (tx) => {
    const resList: any[] = [];
    for (const item of paymentsList) {
      const res = await dbCreatePayment(item, userId, tenantId, tx);
      resList.push(res);
    }
    return resList;
  });

  return {
    success: true,
    total: paymentsList.length,
    successCount: results.length,
    results,
  };
}

export async function dbGetExpenses(tenantId: string) {
  return await sql`SELECT * FROM expenses WHERE tenant_id = ${tenantId} ORDER BY expense_date DESC`;
}

export async function dbCreateExpense(data: any, userId: string, tenantId: string) {
  const note = data.details || data.description || '';
  const expenseData = {
    category: data.category || 'other',
    amount: String(data.amount || 0),
    expense_date: data.expenseDate || data.expense_date || new Date(),
    details: note,
    description: note,
    created_by: userId,
    tenant_id: tenantId,
  };

  const result = await sql`
    INSERT INTO expenses ${sql(expenseData)}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const expense = result[0];
    const categoryMap: any = { fuel: 'ค่าน้ำมัน', staff: 'เงินเดือนพนักงาน', calls: 'ค่าโทรศัพท์', documents: 'ค่าเอกสาร', other: 'อื่นๆ' };
    const catText = categoryMap[expense.category] || expense.category;
    const formattedAmount = Number(expense.amount).toLocaleString('en-US', {minimumFractionDigits: 2});
    const message = `💸 แจ้งเตือนบันทึกรายจ่าย\n📂 หมวดหมู่: ${catText}\n💰 จำนวนเงิน: ${formattedAmount} บาท`;
    try {
      await sendLineNotify(message, 'expense', {
        title: '💸 บันทึกรายจ่ายใหม่',
        accentColor: '#6366f1',
        items: [
          { label: 'หมวดหมู่', value: catText },
          { label: 'จำนวนเงิน', value: `${formattedAmount} บาท`, color: '#6366f1' },
          { label: 'รายละเอียด', value: expense.details || '-' }
        ],
        footer: 'บันทึกรายจ่ายเข้าระบบแล้ว'
      }, tenantId);
    } catch (lineErr) {
      console.error('[LINE Notify] Failed to send expense notification:', lineErr);
    }
  }
  
  return result;
}

export async function dbDeleteExpense(id: string, tenantId: string) {
  const expenses = await sql`
    SELECT category, amount, COALESCE(details, '') as details FROM expenses
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

    try {
      await sendLineNotify(message, 'fraud', {
        title: '🚨 ยกเลิกรายการรายจ่าย',
        accentColor: '#f59e0b',
        items: [
          { label: 'หมวดหมู่', value: catText },
          { label: 'ยอดที่ถูกลบ', value: `${formattedAmount} บาท` },
          { label: 'รายละเอียด', value: expense.details || '—' },
        ],
        footer: 'โปรดตรวจสอบความถูกต้องทันที',
      }, tenantId);
    } catch (lineErr) {
      console.error('[LINE Notify] Failed to send fraud expense notification:', lineErr);
    }
  }

  return result;
}

