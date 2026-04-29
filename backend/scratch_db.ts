import sql from './src/db';

async function run() {
  try {
    const loanStatus = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'loan_status'`;
    console.log('Loan Status Enum:', loanStatus);
    
    const riskLevel = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'risk_level'`;
    console.log('Risk Level Enum:', riskLevel);

    const paymentType = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'payment_type'`;
    console.log('Payment Type Enum:', paymentType);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

run();
