DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(username)
    FROM users
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique username index: duplicate usernames exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
ON users (LOWER(username));
