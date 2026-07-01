import sql from '../db';
import { ApiError } from '../utils/apiError';

export async function getUserByUsername(username: string) {
  if (!username) return null;
  const [user] = await sql`
    SELECT id, username, password_hash, tenant_id 
    FROM users 
    WHERE LOWER(username) = LOWER(${username})
  `;
  return user;
}

export async function getUserById(id: string) {
  if (!id) return null;
  const [user] = await sql`
    SELECT u.id, u.username, u.password_hash, u.tenant_id, t.name as tenant_name, t.is_active as tenant_is_active, p.full_name, p.avatar_url
    FROM users u
    LEFT JOIN profiles p ON p.id = u.id
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ${id}
  `;
  return user;
}

export async function getUserRoles(userId: string) {
  const rolesData = await sql`
    SELECT role FROM user_roles WHERE user_id = ${userId}
  `;
  return rolesData.map((r: any) => r.role);
}

export async function createUser(username: string, passwordHash: string, fullName: string, tenantId: string = 'bkj', role?: string) {
  if (!username || !passwordHash || !fullName) {
    throw new Error('Missing required fields for user creation');
  }
  try {
    return await sql.begin(async (sql: any) => {
      const normalizedUsername = username.trim();
      const normalizedFullName = fullName.trim();
      if (!normalizedUsername || !normalizedFullName) {
        throw new ApiError(400, 'กรุณากรอกชื่อผู้ใช้และชื่อจริง');
      }

      const [existingUser] = await sql`
        SELECT id FROM users
        WHERE LOWER(username) = LOWER(${normalizedUsername})
        LIMIT 1
      `;
      if (existingUser) {
        throw new ApiError(409, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
      }

      const [u] = await sql`
        INSERT INTO users (username, password_hash, tenant_id)
        VALUES (${normalizedUsername}, ${passwordHash}, ${tenantId})
        RETURNING id, username, tenant_id
      `;

      await sql`
        INSERT INTO profiles (id, full_name)
        VALUES (${u.id}, ${normalizedFullName})
      `;

      // Count per-tenant to assign first user as admin, or use explicit role
      let assignedRole = role;
      if (!assignedRole) {
        const [cnt] = await sql`SELECT count(*) as count FROM users WHERE tenant_id = ${tenantId}`;
        assignedRole = parseInt(cnt.count) <= 1 ? 'admin' : 'staff';
      }

      await sql`
        INSERT INTO user_roles (user_id, role)
        VALUES (${u.id}, ${assignedRole})
      `;

      return u;
    });
  } catch (e: any) {
    // Postgres unique_violation (23505) — e.g. concurrent insert races past the SELECT check.
    // Translate to a clean 409 instead of a generic 500.
    if (e?.code === '23505') {
      throw new ApiError(409, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    }
    throw e;
  }
}

export async function updateUserPassword(id: string, passwordHash: string) {
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}
    WHERE id = ${id}
  `;
}

export async function getUsersByTenant(tenantId: string) {
  return await sql`
    SELECT u.id, u.username, p.full_name, ur.role, u.created_at
    FROM users u
    LEFT JOIN profiles p ON p.id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.tenant_id = ${tenantId}
    ORDER BY u.created_at ASC
  `;
}

export async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT role FROM user_roles WHERE user_id = ${userId}
  `;
  return row?.role ?? null;
}

export async function getAdminCountByTenant(tenantId: string): Promise<number> {
  const [row] = await sql`
    SELECT count(*) as count
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.role = 'admin' AND u.tenant_id = ${tenantId}
  `;
  return parseInt(row.count);
}

export async function deleteUserFromTenant(userId: string, tenantId: string) {
  await sql.begin(async (sql: any) => {
    const [user] = await sql`
      SELECT id FROM users
      WHERE id = ${userId} AND tenant_id = ${tenantId}
    `;
    if (!user) {
      throw new ApiError(404, 'ไม่พบบัญชีผู้ใช้');
    }

    // Null out audit/owner references so we don't leave dangling foreign keys
    await sql`
      UPDATE loans
      SET late_fee_updated_by = NULL
      WHERE late_fee_updated_by = ${userId} AND tenant_id = ${tenantId}
    `;
    await sql`
      UPDATE payments
      SET created_by = NULL
      WHERE created_by = ${userId} AND tenant_id = ${tenantId}
    `;
    await sql`
      UPDATE expenses
      SET created_by = NULL
      WHERE created_by = ${userId} AND tenant_id = ${tenantId}
    `;
    await sql`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await sql`DELETE FROM profiles WHERE id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId} AND tenant_id = ${tenantId}`;
  });
}

export async function adminResetPassword(userId: string, tenantId: string, newPasswordHash: string) {
  const result = await sql`
    UPDATE users SET password_hash = ${newPasswordHash}
    WHERE id = ${userId} AND tenant_id = ${tenantId}
    RETURNING id
  `;
  if (result.length === 0) {
    throw new ApiError(404, 'ไม่พบบัญชีผู้ใช้');
  }
}
