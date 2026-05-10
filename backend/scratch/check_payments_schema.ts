import sql from '../src/db';
async function test() {
  try {
    const res = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'payments'
    `;
    console.log(res);
  } catch (e) {
    console.log('Error', e);
  }
  process.exit();
}
test();
