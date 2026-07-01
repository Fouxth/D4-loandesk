CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE customers
ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE loans
ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE payments
ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE activity_logs
ALTER COLUMN id SET DEFAULT gen_random_uuid();
