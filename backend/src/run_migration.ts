import fs from 'fs';
import path from 'path';
import sql from './db';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx ts-node src/run_migration.ts <path-to-migration.sql>');
    process.exit(1);
  }

  const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const script = fs.readFileSync(filePath, 'utf-8');

  console.log(`Applying migration: ${filePath}`);
  await sql.unsafe(script);
  console.log('Migration applied successfully.');

  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
