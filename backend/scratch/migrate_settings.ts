import sql from '../src/db';

async function migrate() {
  try {
    console.log('🚀 Creating settings table...');
    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Insert default settings if they don't exist
    const defaults = [
      {
        key: 'business_profile',
        value: {
          name: 'LoanDesk Pro',
          phone: '08x-xxx-xxxx',
          address: 'กรุงเทพมหานคร'
        }
      },
      {
        key: 'lending_config',
        value: {
          defaultInterestRate: 2,
          lateFeePerDay: 50,
          deductInterestUpfront: true
        }
      },
      {
        key: 'customer_limits',
        value: [
          { id: 'new', label: 'ลูกค้าใหม่', min: 1000, max: 5000 },
          { id: 'regular', label: 'ลูกค้าประจำ', min: 3000, max: 20000 },
          { id: 'good', label: 'เครดิตดี', min: 5000, max: 50000 },
          { id: 'blocked', label: 'เครดิตไม่ผ่าน', min: 0, max: 0 }
        ]
      }
    ];

    for (const d of defaults) {
      await sql`
        INSERT INTO settings (key, value)
        VALUES (${d.key}, ${JSON.stringify(d.value)}::jsonb)
        ON CONFLICT (key) DO NOTHING
      `;
    }

    console.log('✅ Settings table created and seeded.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  }
}

migrate();
