import sql from '../db';
import fs from 'fs';
import path from 'path';
import { refreshDiscordUrls } from './discord.service';

const uploadsRoot = path.resolve(process.cwd(), 'uploads');

/**
 * Replaces stored Discord CDN URLs with freshly re-signed ones so images that
 * were uploaded more than ~24h ago don't 404. Non-Discord (local disk) paths
 * are left untouched. Falls back to the stored value if a URL can't be refreshed.
 */
async function withFreshUrls(rows: any[]): Promise<any[]> {
  const discordUrls = rows
    .map((r) => r.filePath as string)
    .filter((fp) => typeof fp === 'string' && fp.includes('discordapp'));

  if (discordUrls.length === 0) return rows;

  const fresh = await refreshDiscordUrls(discordUrls);
  if (fresh.size === 0) return rows;

  return rows.map((r) => ({
    ...r,
    filePath: fresh.get(r.filePath) ?? r.filePath,
  }));
}

export async function dbAddAttachment(loanId: string, filePath: string, fileName: string, tenantId: string) {
  const [loan] = await sql`SELECT id FROM loans WHERE id = ${loanId} AND tenant_id = ${tenantId}`;
  if (!loan) throw new Error('Loan not found or access denied');

  return await sql`
    INSERT INTO loan_attachments (loan_id, file_path, file_name)
    VALUES (${loanId}, ${filePath}, ${fileName})
    RETURNING *
  `;
}

export async function dbGetAttachments(loanId: string, tenantId: string) {
  const rows = await sql`
    SELECT a.* 
    FROM loan_attachments a
    JOIN loans l ON a.loan_id = l.id
    WHERE a.loan_id = ${loanId} AND l.tenant_id = ${tenantId} 
    ORDER BY a.created_at DESC
  `;
  return await withFreshUrls(rows as any[]);
}

export async function dbDeleteAttachment(id: string, tenantId: string) {
  const [attachment] = await sql`
    SELECT a.* 
    FROM loan_attachments a
    JOIN loans l ON a.loan_id = l.id
    WHERE a.id = ${id} AND l.tenant_id = ${tenantId}
  `;
  if (!attachment) throw new Error("Attachment not found or access denied");

  // If it's a Discord URL, skip local disk removal
  if (attachment.filePath.startsWith('http://') || attachment.filePath.startsWith('https://')) {
    return await sql`DELETE FROM loan_attachments WHERE id = ${id}`;
  }

  // Remove file from disk
  const fullPath = path.resolve(process.cwd(), attachment.filePath);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Invalid attachment path');
  }

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  return await sql`DELETE FROM loan_attachments WHERE id = ${id}`;
}

export async function dbAddCustomerAttachment(customerId: string, filePath: string, fileName: string, tenantId: string) {
  const [customer] = await sql`SELECT id FROM customers WHERE id = ${customerId} AND tenant_id = ${tenantId}`;
  if (!customer) throw new Error('Customer not found or access denied');

  return await sql`
    INSERT INTO customer_attachments (customer_id, file_path, file_name)
    VALUES (${customerId}, ${filePath}, ${fileName})
    RETURNING *
  `;
}

export async function dbGetCustomerAttachments(customerId: string, tenantId: string) {
  const rows = await sql`
    SELECT a.* 
    FROM customer_attachments a
    JOIN customers c ON a.customer_id = c.id
    WHERE a.customer_id = ${customerId} AND c.tenant_id = ${tenantId} 
    ORDER BY a.created_at DESC
  `;
  return await withFreshUrls(rows as any[]);
}

export async function dbDeleteCustomerAttachment(id: string, tenantId: string) {
  const [attachment] = await sql`
    SELECT a.* 
    FROM customer_attachments a
    JOIN customers c ON a.customer_id = c.id
    WHERE a.id = ${id} AND c.tenant_id = ${tenantId}
  `;
  if (!attachment) throw new Error("Attachment not found or access denied");

  // If it's a Discord URL, skip local disk removal
  if (attachment.filePath.startsWith('http://') || attachment.filePath.startsWith('https://')) {
    return await sql`DELETE FROM customer_attachments WHERE id = ${id}`;
  }

  // Remove file from disk
  const fullPath = path.resolve(process.cwd(), attachment.filePath);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Invalid attachment path');
  }

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  return await sql`DELETE FROM customer_attachments WHERE id = ${id}`;
}
