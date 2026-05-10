import sql from '../src/db';

async function migrate() {
  try {
    console.log('Starting migration for pawn feature...');

    // Create pawn_status_enum
    const checkEnum = await sql`SELECT 1 FROM pg_type WHERE typname = 'pawn_status'`;
    if (checkEnum.length === 0) {
      await sql`CREATE TYPE pawn_status AS ENUM ('in_storage', 'redeemed', 'forfeited')`;
      console.log('Created pawn_status enum.');
    }

    // Add columns to loans
    await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS is_pawn BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS pawn_item TEXT`;
    await sql`ALTER TABLE loans ADD COLUMN IF NOT EXISTS pawn_status pawn_status DEFAULT 'in_storage'`;
    console.log('Added pawn columns to loans table.');

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit();
  }
}

migrate();
