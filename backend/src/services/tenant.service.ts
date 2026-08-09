import sql from '../db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { transliterateThai } from '../utils/transliterate';
import * as authService from './auth.service';

export interface GeneratedTenantResult {
  tenantId: string;
  tenantName: string;
  username: string;
  defaultPassword: string;
  ownerUserId: string;
}

/**
 * Automatically creates a new Tenant and its default Owner admin user
 * based on just the creditor's/store's name.
 */
export async function createTenantAutomatically(creditorName: string): Promise<GeneratedTenantResult> {
  if (!creditorName || creditorName.trim() === '') {
    throw new Error('กรุณาระบุชื่อเจ้าหนี้หรือชื่อร้านค้า');
  }

  const baseSlug = transliterateThai(creditorName);
  if (!baseSlug) {
    throw new Error('ชื่อเจ้าหนี้ต้องมีตัวอักษรภาษาไทยหรือภาษาอังกฤษ');
  }

  return await sql.begin(async (sql: any) => {
    // 1. Ensure unique tenant_id slug
    let tenantId = baseSlug;
    let tenantCounter = 1;
    while (true) {
      const [existing] = await sql`SELECT id FROM tenants WHERE id = ${tenantId}`;
      if (!existing) break;
      tenantId = `${baseSlug}-${tenantCounter++}`;
    }

    // 2. Insert tenant
    const [tenant] = await sql`
      INSERT INTO tenants (id, name, created_at, updated_at)
      VALUES (${tenantId}, ${creditorName.trim()}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name
    `;

    // 3. Ensure unique owner username
    let username = tenantId;
    let userCounter = 1;
    while (true) {
      const [existingUser] = await sql`SELECT id FROM users WHERE username = ${username}`;
      if (!existingUser) break;
      username = `${tenantId}-${userCounter++}`;
    }

    // Finding 8: Generate cryptographically random default password for initial tenant owner
    const defaultPassword = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const fullName = `ผู้จัดการ (${creditorName.trim()})`;

    // Re-use authService with the transactional 'sql' client
    const [user] = await sql`
      INSERT INTO users (username, password_hash, tenant_id, must_change_password)
      VALUES (${username}, ${passwordHash}, ${tenantId}, true)
      RETURNING id, username
    `;

    await sql`
      INSERT INTO profiles (id, full_name)
      VALUES (${user.id}, ${fullName})
    `;

    // Assign 'admin' role to the owner
    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${user.id}, 'admin')
    `;

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      username: user.username,
      defaultPassword,
      ownerUserId: user.id,
    };
  });
}

export async function getAllTenants() {
  const tenants = await sql`
    SELECT 
      t.id, 
      t.name, 
      COALESCE(t.is_active, true) as "isActive",
      COALESCE(t.created_at, CURRENT_TIMESTAMP) as "createdAt",
      (SELECT username FROM users WHERE tenant_id = t.id LIMIT 1) as "ownerUsername",
      (SELECT count(*) FROM customers WHERE tenant_id = t.id)::int as "customerCount",
      (SELECT count(*) FROM loans WHERE tenant_id = t.id)::int as "loanCount"
    FROM tenants t
    ORDER BY t.created_at DESC
  `;
  return tenants;
}

export async function updateTenantStatus(id: string, isActive: boolean) {
  return await sql`
    UPDATE tenants 
    SET is_active = ${isActive}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `;
}

