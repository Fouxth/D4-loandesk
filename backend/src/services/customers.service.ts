import sql from '../db';
import { ApiError } from '../utils/apiError';

const CUSTOMER_ALLOWED = new Set([
  'fullName', 'phone', 'idCard', 'address', 'notes', 'riskLevel', 'category',
]);

function pickFields(data: any, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data) result[key] = data[key];
  }
  return result;
}

export async function dbGetCustomers(tenantId: string) {
  return await sql`SELECT * FROM customers WHERE tenant_id = ${tenantId} ORDER BY full_name ASC`;
}

export async function dbGetCustomerById(id: string, tenantId: string) {
  const [customer] = await sql`SELECT * FROM customers WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return customer;
}

export async function dbCreateCustomer(data: any, userId: string, tenantId: string) {
  const safeData = pickFields(data, CUSTOMER_ALLOWED);
  return await sql`
    INSERT INTO customers ${sql({ ...safeData, createdBy: userId, tenantId })}
    RETURNING *
  `;
}

export async function dbUpdateCustomer(id: string, updates: any, tenantId: string) {
  const safeData = pickFields(updates, CUSTOMER_ALLOWED);
  if (Object.keys(safeData).length === 0) throw new ApiError(400, 'ไม่มีข้อมูลที่อัปเดต');

  const [customer] = await sql`
    UPDATE customers SET ${sql(safeData)}
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  if (!customer) throw new ApiError(404, 'ไม่พบลูกค้า');
  return customer;
}

export async function dbDeleteCustomer(id: string, tenantId: string) {
  return await sql`DELETE FROM customers WHERE id = ${id} AND tenant_id = ${tenantId}`;
}

