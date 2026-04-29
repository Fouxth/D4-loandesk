import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL;
const sql = postgres(url);

async function test() {
  try {
    console.log("Checking tables...");
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log("Tables:", tables.map(t => t.tableName));
    
    const users = await sql`SELECT count(*) FROM users`;
    console.log("Users count:", users[0].count);
    
    process.exit(0);
  } catch (e) {
    console.error("Check failed:", e);
    process.exit(1);
  }
}

test();
