import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is missing");
  process.exit(1);
}

const sql = postgres(url);

async function test() {
  try {
    console.log("Testing connection to:", url.split('@')[1]); // Show only host
    const res = await sql`SELECT 1 as connected`;
    console.log("Connected successfully:", res);
    process.exit(0);
  } catch (e) {
    console.error("Connection failed:", e);
    process.exit(1);
  }
}

test();
