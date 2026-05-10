import sql from '../src/db';

async function migrate() {
  try {
    console.log('Starting migration for indefinite loans...');

    // Add is_indefinite to loans
    await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS is_indefinite BOOLEAN DEFAULT false`;
    console.log('Added is_indefinite column to loans table.');

    // Ensure due_date can be null
    await sql`ALTER TABLE loans ALTER COLUMN due_date DROP NOT NULL`;
    console.log('Modified due_date column to allow NULL values.');

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
