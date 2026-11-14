import { neon } from "@neondatabase/serverless";
import { hashPassword } from "../src/lib/password";

const email = process.env.MIGRATE_EMAIL?.trim().toLowerCase();
const password = process.env.MIGRATE_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

if (!email || !password || !databaseUrl) {
  throw new Error("MIGRATE_EMAIL, MIGRATE_PASSWORD, and DATABASE_URL are required");
}

const sql = neon(databaseUrl);
const passwordHash = await hashPassword(password);

await sql`
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
  )
`;
await sql`CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`;

await sql`ALTER TABLE directories ADD COLUMN IF NOT EXISTS user_id uuid`;
await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id uuid`;

const existing = await sql`
  SELECT id FROM users WHERE email = ${email} LIMIT 1
`;

let userId: string;
if (existing[0]?.id) {
  userId = existing[0].id as string;
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}, updated_at = now()
    WHERE id = ${userId}::uuid
  `;
  console.log("Updated existing user", email);
} else {
  const created = await sql`
    INSERT INTO users (email, password_hash)
    VALUES (${email}, ${passwordHash})
    RETURNING id
  `;
  const createdRow = created[0];
  if (!createdRow) throw new Error("Failed to create user");
  userId = createdRow.id as string;
  console.log("Created user", email);
}

await sql`UPDATE directories SET user_id = ${userId}::uuid WHERE user_id IS NULL`;
await sql`UPDATE notes SET user_id = ${userId}::uuid WHERE user_id IS NULL`;

await sql`ALTER TABLE directories ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE notes ALTER COLUMN user_id SET NOT NULL`;

await sql`
  DO $$ BEGIN
    ALTER TABLE directories
      ADD CONSTRAINT directories_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$
`;
await sql`
  DO $$ BEGIN
    ALTER TABLE notes
      ADD CONSTRAINT notes_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$
`;

await sql`CREATE INDEX IF NOT EXISTS directories_user_idx ON directories (user_id)`;
await sql`CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id)`;

const counts = await sql`
  SELECT
    (SELECT count(*)::int FROM directories WHERE user_id = ${userId}::uuid) AS directories,
    (SELECT count(*)::int FROM notes WHERE user_id = ${userId}::uuid) AS notes
`;
console.log("Attached content:", counts[0]);
console.log("Done.");
