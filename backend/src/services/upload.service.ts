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

export async function dbAddAttachment(loanId: string, filePath: string, fileName: string) {
  return await sql`
    INSERT INTO loan_attachments (loan_id, file_path, file_name)
    VALUES (${loanId}, ${filePath}, ${fileName})
    RETURNING *
  `;
}

export async function dbGetAttachments(loanId: string) {
  const rows = await sql`
    SELECT * FROM loan_attachments WHERE loan_id = ${loanId} ORDER BY created_at DESC
  `;
  return await withFreshUrls(rows as any[]);
}

export async function dbDeleteAttachment(id: string) {
  const [attachment] = await sql`SELECT * FROM loan_attachments WHERE id = ${id}`;
  if (!attachment) throw new Error("Attachment not found");

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

export async function dbAddCustomerAttachment(customerId: string, filePath: string, fileName: string) {
  return await sql`
    INSERT INTO customer_attachments (customer_id, file_path, file_name)
    VALUES (${customerId}, ${filePath}, ${fileName})
    RETURNING *
  `;
}

export async function dbGetCustomerAttachments(customerId: string) {
  const rows = await sql`
    SELECT * FROM customer_attachments WHERE customer_id = ${customerId} ORDER BY created_at DESC
  `;
  return await withFreshUrls(rows as any[]);
}

export async function dbDeleteCustomerAttachment(id: string) {
  const [attachment] = await sql`SELECT * FROM customer_attachments WHERE id = ${id}`;
  if (!attachment) throw new Error("Attachment not found");

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
