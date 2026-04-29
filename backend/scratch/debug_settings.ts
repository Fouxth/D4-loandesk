import sql from '../src/db';

async function check() {
  try {
    const result = await sql`SELECT * FROM settings`;
    console.log('Current Settings in DB:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
check();
