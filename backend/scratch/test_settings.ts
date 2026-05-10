import sql from '../src/db';
async function test() {
  try {
    const res = await sql`SELECT * FROM settings`;
    console.log('Settings:', res);
  } catch (e) {
    console.error('Error', e);
  }
  process.exit();
}
test();
