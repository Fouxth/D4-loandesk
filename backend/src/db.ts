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
  onnotice: () => {},
});

export default sql;

export async function testDbConnection(): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS document_fee NUMERIC NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS advance_fee NUMERIC NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS parking_fee NUMERIC NOT NULL DEFAULT 0`;
  await sql`SELECT count(*) FROM users`;
}
