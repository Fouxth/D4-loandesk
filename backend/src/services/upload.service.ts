import sql from '../db';
import fs from 'fs';
import path from 'path';

export async function dbAddAttachment(loanId: string, filePath: string, fileName: string) {
  return await sql`
    INSERT INTO loan_attachments (loan_id, file_path, file_name)
    VALUES (${loanId}, ${filePath}, ${fileName})
    RETURNING *
  `;
}

export async function dbGetAttachments(loanId: string) {
  return await sql`
    SELECT * FROM loan_attachments WHERE loan_id = ${loanId} ORDER BY created_at DESC
  `;
}

export async function dbDeleteAttachment(id: string) {
  const [attachment] = await sql`SELECT * FROM loan_attachments WHERE id = ${id}`;
  if (!attachment) throw new Error("Attachment not found");

  // Remove file from disk
  const fullPath = path.join(process.cwd(), attachment.filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  return await sql`DELETE FROM loan_attachments WHERE id = ${id}`;
}
