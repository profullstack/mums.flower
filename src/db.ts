import { createClient, type Client, type InValue } from '@libsql/client';

/**
 * libSQL (Turso-compatible). In production a file on the box
 * (MUMS_DB_URL=file:/data/mums.db); tests use an in-memory database. The schema
 * is created on start: every statement is idempotent.
 */
const SCHEMA = [
  `create table if not exists users (
     id text primary key,
     email text not null unique,
     created_at integer not null
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     expires_at integer not null
   )`,
  `create table if not exists login_tokens (
     token_hash text primary key,
     email text not null,
     expires_at integer not null,
     used_at integer
   )`,
  `create table if not exists passkeys (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     public_key text not null,
     counter integer not null default 0,
     transports text,
     rp_id text not null,
     created_at integer not null
   )`,
  `create table if not exists webauthn_challenges (
     id text primary key,
     challenge text not null,
     user_id text,
     expires_at integer not null
   )`,
  `create table if not exists api_keys (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     key_hash text not null unique,
     label text not null,
     created_at integer not null,
     last_used_at integer
   )`,
  `create table if not exists moms (
     id text primary key,
     user_id text not null references users(id) on delete cascade,
     name text not null,
     relationship text not null default 'Mom',
     birthday text,
     country text not null default 'US',
     favorite_flowers text not null default '[]',
     email text,
     notes text,
     created_at integer not null
   )`,
  `create index if not exists moms_user on moms(user_id)`,
  `create table if not exists cards (
     id text primary key,
     user_id text references users(id) on delete set null,
     mom_id text references moms(id) on delete set null,
     to_name text not null,
     from_name text not null,
     message text not null,
     flowers text not null,
     theme text not null default 'blush',
     premium integer not null default 0,
     sent_to text,
     sent_at integer,
     created_at integer not null
   )`,
  `create index if not exists cards_user on cards(user_id)`,
  `create table if not exists payments (
     session_id text primary key,
     card_id text not null references cards(id) on delete cascade,
     user_id text,
     status text not null,
     amount_usd real not null,
     created_at integer not null,
     paid_at integer
   )`,
  `create table if not exists reminders_sent (
     mom_id text not null,
     occasion text not null,
     year integer not null,
     sent_at integer not null,
     primary key (mom_id, occasion, year)
   )`,
];

let client: Client | null = null;

export function db(): Client {
  if (!client) client = createClient({ url: process.env.MUMS_DB_URL || 'file:mums.db' });
  return client;
}

/** Use a specific client (tests). */
export function setDb(c: Client): void {
  client = c;
}

export async function migrate(c: Client = db()): Promise<void> {
  await c.execute('pragma foreign_keys = on');
  for (const sql of SCHEMA) await c.execute(sql);
}

export async function one<T>(sql: string, args: InValue[] = []): Promise<T | null> {
  const r = await db().execute({ sql, args });
  return (r.rows[0] as unknown as T) ?? null;
}

export async function all<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const r = await db().execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function run(sql: string, args: InValue[] = []): Promise<number> {
  const r = await db().execute({ sql, args });
  return r.rowsAffected;
}
