import sql from '../db';

export async function getUserByEmail(email: string) {
  const [user] = await sql`
    SELECT id, email, password_hash FROM users WHERE email = ${email}
  `;
  return user;
}

export async function getUserById(id: string) {
  const [user] = await sql`
    SELECT u.id, u.email, p.full_name, p.avatar_url
    FROM users u
    LEFT JOIN profiles p ON p.id = u.id
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

export async function createUser(email: string, passwordHash: string, fullName: string) {
  return await sql.begin(async (sql: any) => {
    const [u] = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id
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
