import sql from '../src/db';

async function update() {
  try {
    console.log('🔄 Updating business profile structure...');
    
    // Fetch existing profile
    const result = await sql`SELECT value FROM settings WHERE key = 'business_profile'`;
    let currentProfile = result[0]?.value || {};

    // Update with new structure if not already there
    const updatedProfile = {
      nameTH: currentProfile.nameTH || currentProfile.name || 'มั่งมี การเงิน',
      nameEN: currentProfile.nameEN || 'LoanDesk Pro',
      phone: currentProfile.phone || '08x-xxx-xxxx',
      address: currentProfile.address || 'กรุงเทพมหานคร'
    };

    await sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('business_profile', ${JSON.stringify(updatedProfile)}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;

    console.log('✅ Business profile updated to support TH/EN names.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Update failed:', e);
    process.exit(1);
  }
}

update();
