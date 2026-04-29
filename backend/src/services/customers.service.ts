import sql from '../db';

export async function dbGetCustomers() {
  return await sql`SELECT * FROM customers ORDER BY full_name ASC`;
}
export async function dbGetCustomerById(id: string) {
  const [customer] = await sql`SELECT * FROM customers WHERE id = ${id}`;
  return customer;
}
export async function dbCreateCustomer(data: any, userId: string) {
  return await sql`
    INSERT INTO customers ${sql({ ...data, createdBy: userId })}
    RETURNING *
  `;
}
export async function dbUpdateCustomer(id: string, updates: any) {
  const [customer] = await sql`
    UPDATE customers SET ${sql(updates)}
    WHERE id = ${id}
    RETURNING *
  `;
  return customer;
}
export async function dbDeleteCustomer(id: string) {
  return await sql`DELETE FROM customers WHERE id = ${id}`;
}
