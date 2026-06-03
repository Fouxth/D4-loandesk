import sql from '../db';

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

export async function createUser(username: string, passwordHash: string, fullName: string, tenantId: string = 'bkj') {
  if (!username || !passwordHash || !fullName) {
    throw new Error('Missing required fields for user creation');
  }
  return await sql.begin(async (sql: any) => {
    const [u] = await sql`
      INSERT INTO users (username, password_hash, tenant_id)
      VALUES (${username}, ${passwordHash}, ${tenantId})
      RETURNING id, username, tenant_id
    `;
    
    await sql`
      INSERT INTO profiles (id, full_name)
      VALUES (${u.id}, ${fullName})
    `;

    const [roleCount] = await sql`SELECT count(*) as count FROM user_roles`;
    const role = parseInt(roleCount.count) === 0 ? 'admin' : 'staff';
    
    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${u.id}, ${role})
    `;
    
    return u;
  });
}

export async function updateUserPassword(id: string, passwordHash: string) {
  await sql`
    UPDATE users 
    SET password_hash = ${passwordHash}
    WHERE id = ${id}
  `;
}

