import sql from '../src/db';
async function test() {
  try {
    const res = await sql`
      SELECT typname, enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE typname IN ('payment_type', 'loan_status')
    `;
    console.log(res);
  } catch (e) {
    console.log('Error', e);
  }
  process.exit();
}
test();
