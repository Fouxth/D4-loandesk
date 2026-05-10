import sql from '../src/db';

async function migrate() {
  try {
    console.log('Starting migration...');

    // Add is_interest_only to loans
    await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS is_interest_only BOOLEAN DEFAULT false`;
    console.log('Added is_interest_only column to loans table.');

    // Create payment_category enum if it doesn't exist
    const checkEnum = await sql`SELECT 1 FROM pg_type WHERE typname = 'payment_category'`;
    if (checkEnum.length === 0) {
      await sql`CREATE TYPE payment_category AS ENUM ('interest', 'principal')`;
      console.log('Created payment_category enum.');
    }

    // Add category to payments
    await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS category payment_category DEFAULT 'principal'`;
    console.log('Added category column to payments table.');

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
