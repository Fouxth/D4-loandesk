import sql from '../db';

export async function dbLogActivity(
  tenantId: string,
  userId: string | null | undefined,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  details?: any,
) {
  try {
    if (!tenantId) return;
    await sql`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, tenant_id, created_at)
      VALUES (${userId ?? null}, ${action}, ${entityType ?? null}, ${entityId ?? null}, ${details ? JSON.stringify(details) : null}, ${tenantId}, CURRENT_TIMESTAMP)
    `;
  } catch (e) {
    console.error('dbLogActivity failed:', e);
  }
}
