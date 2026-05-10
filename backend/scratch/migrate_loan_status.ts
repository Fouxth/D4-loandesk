import sql from '../src/db';

async function migrate() {
  try {
    console.log('Starting migration for loan status sync...');

    // Add forfeited to loan_status enum
    await sql`ALTER TYPE loan_status ADD VALUE IF NOT EXISTS 'forfeited'`;
    console.log('Added forfeited to loan_status enum.');

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
