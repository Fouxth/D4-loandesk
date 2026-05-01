import sql from '../db';
import { sendLineNotify } from './line.service';

export async function getAllLoans() {
  return await sql`
    SELECT l.*, c.full_name as customer_name 
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    ORDER BY l.created_at DESC
  `;
}

export async function getLoanById(id: string) {
  const [loan] = await sql`
    SELECT l.*, c.full_name as customer_name, c.phone as customer_phone
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.id = ${id}
  `;
  return loan;
}

export async function dbCreateLoan(data: any, loanNumber: string, userId: string) {
  const result = await sql`
    INSERT INTO loans ${sql({ ...data, loanNumber, createdBy: userId })}
    RETURNING *
  `;
  
  if (result.length > 0) {
    const loan = result[0];
    const customers = await sql`SELECT full_name FROM customers WHERE id = ${loan.customer_id}`;
    if (customers.length > 0) {
      const customer = customers[0];
      const formattedPrincipal = Number(loan.principal).toLocaleString('en-US', {minimumFractionDigits: 2});
      const message = `📝 แจ้งเตือนเปิดสัญญาใหม่\n━━━━━━━━━━━━━━━━\n👤 ลูกค้า: ${customer.full_name}\n🏷 สัญญา: ${loan.loan_number}\n💸 ยอดจัด: ${formattedPrincipal} บาท\n━━━━━━━━━━━━━━━━\n✅ อนุมัติและบันทึกเข้าระบบแล้ว`;
      sendLineNotify(message, 'loan');
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

export async function getOverdueNotifications() {
  const today = getLogicalDateStr(new Date());
  return await sql`
    SELECT l.id, l.loan_number, l.due_date, l.total_payable, l.status, c.full_name as customer_name
    FROM loans l
    JOIN customers c ON l.customer_id = c.id
    WHERE l.status IN ('active', 'overdue') AND l.due_date <= ${today}
    ORDER BY l.due_date ASC
    LIMIT 15
  `;
}

export async function getLoansByCustomerId(customerId: string) {
  return await sql`
    SELECT * FROM loans 
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC
  `;
}

export async function dbRefinanceLoan(oldLoanId: string, newData: any, newLoanNumber: string, userId: string) {
  return await sql.begin(async sql => {
    const [oldLoan] = await sql`SELECT * FROM loans WHERE id = ${oldLoanId}`;
    if (!oldLoan) throw new Error("Loan not found");

    await sql`UPDATE loans SET status = 'refinanced' WHERE id = ${oldLoanId}`;

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
        createdBy: userId
      })}
      RETURNING *
    `;

    return newLoan;
  });
}
