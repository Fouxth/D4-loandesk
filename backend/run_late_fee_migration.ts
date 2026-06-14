import fs from 'fs';
import path from 'path';
import sql from './src/db';

async function main() {
  const sqlPath = path.join(__dirname, 'migrations', '002_late_fee_override.sql');
  const migrationSql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Applying migration:', sqlPath);
  await sql.unsafe(migrationSql);
  console.log('Done.');
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
