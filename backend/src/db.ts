import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/debt_tracker';

const sql = postgres(DATABASE_URL, {
  transform: postgres.camel,
  connect_timeout: 10,
  max: 10,
  idle_timeout: 20,
});

export default sql;

export async function testDbConnection(): Promise<void> {
  const res = await sql`SELECT count(*) FROM users`;
  console.log('✅ DB Connected. User count:', res[0].count);
}
