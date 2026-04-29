import sql from '../db';

export async function dbGetPayments() {
  return await sql`
    SELECT p.*, l.loan_number, c.full_name as customer_name
    FROM payments p
    JOIN loans l ON p.loan_id = l.id
    JOIN customers c ON l.customer_id = c.id
    ORDER BY p.payment_date DESC
  `;
}
export async function dbGetPaymentsByLoan(loanId: string) {
  return await sql`
    SELECT * FROM payments 
    WHERE loan_id = ${loanId}
    ORDER BY payment_date DESC
  `;
}
export async function dbCreatePayment(data: any, userId: string) {
  return await sql`
    INSERT INTO payments ${sql({ ...data, createdBy: userId })}
    RETURNING *
  `;
}
export async function dbDeletePayment(id: string) {
  return await sql`DELETE FROM payments WHERE id = ${id}`;
}

export async function dbGetExpenses() {
  return await sql`SELECT * FROM expenses ORDER BY expense_date DESC`;
}
export async function dbCreateExpense(data: any, userId: string) {
  return await sql`
    INSERT INTO expenses ${sql({ ...data, createdBy: userId })}
    RETURNING *
  `;
}
export async function dbDeleteExpense(id: string) {
  return await sql`DELETE FROM expenses WHERE id = ${id}`;
}
