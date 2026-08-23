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
  const fullName = String(safeData.fullName ?? '').trim();
  if (!fullName) {
    throw new ApiError(400, 'กรุณาระบุชื่อ-นามสกุลลูกค้า');
  }

  // Check for duplicate customer name within the same tenant
  const [existing] = await sql`
    SELECT id, full_name FROM customers 
    WHERE tenant_id = ${tenantId} AND LOWER(TRIM(full_name)) = LOWER(${fullName})
    LIMIT 1
  `;
  if (existing) {
    throw new ApiError(409, `พบรายชื่อลูกค้า "${fullName}" มีอยู่ในระบบแล้ว`);
  }

  return await sql`
    INSERT INTO customers ${sql({ ...safeData, createdBy: userId, tenantId })}
    RETURNING *
  `;
}

export async function dbUpdateCustomer(id: string, updates: any, tenantId: string) {
  const safeData = pickFields(updates, CUSTOMER_ALLOWED);
  if (Object.keys(safeData).length === 0) throw new ApiError(400, 'ไม่มีข้อมูลที่อัปเดต');

  if (safeData.fullName) {
    const fullName = String(safeData.fullName).trim();
    const [existing] = await sql`
      SELECT id FROM customers 
      WHERE tenant_id = ${tenantId} 
        AND id != ${id} 
        AND LOWER(TRIM(full_name)) = LOWER(${fullName})
      LIMIT 1
    `;
    if (existing) {
      throw new ApiError(409, `พบรายชื่อลูกค้า "${fullName}" มีอยู่ในระบบแล้ว`);
    }
  }

  const [customer] = await sql`
    UPDATE customers SET ${sql(safeData)}
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  if (!customer) throw new ApiError(404, 'ไม่พบลูกค้า');
  return customer;
}

export async function dbDeleteCustomer(id: string, tenantId: string) {
  return await sql.begin(async (sql) => {
    // 1. Find all loans belonging to this customer
    const loans = await sql`
      SELECT id FROM loans WHERE customer_id = ${id} AND tenant_id = ${tenantId}
    `;
    const loanIds = loans.map((l: any) => l.id);

    if (loanIds.length > 0) {
      // Clear refinanced_from references
      await sql`
        UPDATE loans SET refinanced_from = NULL 
        WHERE refinanced_from IN ${sql(loanIds)} AND tenant_id = ${tenantId}
      `;

      // Delete loan attachments
      try {
        await sql`
          DELETE FROM loan_attachments WHERE loan_id IN ${sql(loanIds)}
        `;
      } catch (attErr) {
        console.warn('Could not delete loan attachments for customer:', attErr);
      }

      // Delete payments associated with these loans
      await sql`
        DELETE FROM payments WHERE loan_id IN ${sql(loanIds)} AND tenant_id = ${tenantId}
      `;

      // Delete loans
      await sql`
        DELETE FROM loans WHERE id IN ${sql(loanIds)} AND tenant_id = ${tenantId}
      `;
    }

    // 2. Delete customer attachments
    try {
      await sql`
        DELETE FROM customer_attachments WHERE customer_id = ${id}
      `;
    } catch (cAttErr) {
      console.warn('Could not delete customer attachments:', cAttErr);
    }

    // 3. Delete customer
    return await sql`DELETE FROM customers WHERE id = ${id} AND tenant_id = ${tenantId}`;
  });
}

