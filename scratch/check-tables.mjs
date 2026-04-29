import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL;
const sql = postgres(url);

async function test() {
  try {
    console.log("Checking tables existence...");
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    const names = tables.map(t => t.table_name);
    console.log("Found tables:", names);
    
    const required = ['users', 'profiles', 'user_roles', 'customers', 'loans', 'payments', 'expenses', 'activity_logs'];
    const missing = required.filter(r => !names.includes(r));
    
    if (missing.length > 0) {
      console.error("Missing tables:", missing);
    } else {
      console.log("All required tables exist.");
    }
    
    process.exit(0);
  } catch (e) {
    console.error("Check failed:", e);
    process.exit(1);
  }
}

test();
