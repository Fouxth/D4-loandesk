import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!);
async function test() {
  try {
    const res = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'profiles'
    `;
    console.log(res);
  } catch (e) {
    console.log('Error', e);
  }
  process.exit();
}
test();
