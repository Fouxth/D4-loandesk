ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE expenses
SET description = details
WHERE description IS NULL AND details IS NOT NULL;
