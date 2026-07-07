CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customer_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Carry over any single ID document already attached via the old columns
-- (008_customer_id_document.sql) so nothing gets lost when customers move
-- to multiple attachments per record.
INSERT INTO customer_attachments (customer_id, file_path, file_name)
SELECT id, id_document_url, id_document_file_name
FROM customers
WHERE id_document_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customer_attachments ca
    WHERE ca.customer_id = customers.id AND ca.file_path = customers.id_document_url
  );
