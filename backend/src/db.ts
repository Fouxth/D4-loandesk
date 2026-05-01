import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(process.cwd(), '../.env') });
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/debt_tracker';

const sql = postgres(DATABASE_URL, {
  transform: postgres.camel,
  connect_timeout: 10,
  max: 10,
});

export default sql;
