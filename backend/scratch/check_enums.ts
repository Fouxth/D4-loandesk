import sql from '../src/db';
async function test() {
  try {
    const res = await sql`
      SELECT typname, enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE typname IN ('payment_type_enum', 'loan_status_enum', 'payment_method_enum')
    `;
    console.log(res);
  } catch (e) {
    console.log('Error', e);
  }
  process.exit();
}
test();
