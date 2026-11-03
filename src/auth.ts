import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { all, one, run } from './db.ts';
import { ensureUser, UserError, cleanEmail } from './service.ts';

/**
 * Sign-in: a magic link by email (it doubles as sign-up), then passkeys for
 * the next time. API keys (mf_...) let the CLI and MCP clients act as a user.
 */
export const SESSION_COOKIE = 'mums_session';
const SESSION_DAYS = 30;
const LINK_MINUTES = 20;
const RP_NAME = 'mums.flower';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

export interface User {
  id: string;
  email: string;
}

// --- the public host -----------------------------------------------------------

/** Hosts this app answers for (clearnet relay name, Moshpit name, local dev). */
export function allowedHosts(): string[] {
  return (process.env.MUMS_HOSTS || 'mums.flower.pit.world,mums.flower,localhost:8811,127.0.0.1:8811')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** The host the visitor typed: X-Forwarded-Host (the pit.world relay) when allowed, else Host. */
export function publicHost(c: Context): string {
  const hosts = allowedHosts();
  const fwd = (c.req.header('x-forwarded-host') || '').split(',')[0].trim().toLowerCase();
  if (fwd && hosts.includes(fwd)) return fwd;
  const host = (c.req.header('host') || '').toLowerCase();
  return hosts.includes(host) ? host : hosts[0];
}

export function publicOrigin(c: Context): string {
  const host = publicHost(c);
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return `http://${host}`;
  if (host.endsWith('.pit.world')) return `https://${host}`;
  // The Moshpit name is served on both ports (no CA can issue for it): follow the request.
  const proto = (c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol.replace(':', '')).split(',')[0].trim();
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

const rpId = (c: Context) => publicHost(c).replace(/:\d+$/, '');

// --- sessions ------------------------------------------------------------------

export async function createSession(c: Context, userId: string): Promise<void> {
  const t = token();
  await run('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)', [sha256(t), userId, Date.now() + SESSION_DAYS * 86_400_000]);
  setCookie(c, SESSION_COOKIE, t, {
    httpOnly: true,
    secure: publicOrigin(c).startsWith('https'),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(c: Context): Promise<void> {
  const t = getCookie(c, SESSION_COOKIE);
  if (t) await run('delete from sessions where token_hash = ?', [sha256(t)]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** The signed-in user from the session cookie or a Bearer API key, else null. */
export async function currentUser(c: Context): Promise<(User & { via: 'cookie' | 'key' }) | null> {
  const auth = c.req.header('authorization') || '';
  const bearer = /^Bearer\s+(mf_[A-Za-z0-9_-]{20,})$/.exec(auth)?.[1];
  if (bearer) {
    const u = await one<User & { key_id: string }>(
      'select u.id, u.email, k.id as key_id from api_keys k join users u on u.id = k.user_id where k.key_hash = ?',
      [sha256(bearer)],
    );
    if (!u) return null;
    await run('update api_keys set last_used_at = ? where id = ?', [Date.now(), u.key_id]);
    return { id: u.id, email: u.email, via: 'key' };
  }
  const t = getCookie(c, SESSION_COOKIE);
  if (!t) return null;
  const u = await one<User>(
    'select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ?',
    [sha256(t), Date.now()],
  );
  return u ? { ...u, via: 'cookie' } : null;
}

// --- magic link ----------------------------------------------------------------

const attempts = new Map<string, number[]>();
/** At most `max` in `windowMs` per key (email or IP). */
export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 10_000) attempts.clear();
  return false;
}

export async function createLoginLink(origin: string, emailInput: string): Promise<{ email: string; link: string }> {
  const email = cleanEmail(emailInput, true)!;
  const t = token();
  await run('insert into login_tokens (token_hash, email, expires_at) values (?, ?, ?)', [sha256(t), email, Date.now() + LINK_MINUTES * 60_000]);
  return { email, link: `${origin}/auth/verify?token=${t}` };
}

/** Spend a magic-link token once: the user it signs in, or null if bad/used/expired. */
export async function redeemLoginToken(t: string): Promise<User | null> {
  const h = sha256(String(t || ''));
  const row = await one<{ email: string }>('select email from login_tokens where token_hash = ? and used_at is null and expires_at > ?', [h, Date.now()]);
  if (!row) return null;
  if (!(await run('update login_tokens set used_at = ? where token_hash = ? and used_at is null', [Date.now(), h]))) return null;
  return ensureUser(row.email);
}

// --- API keys ------------------------------------------------------------------

export async function createApiKey(userId: string, label: string): Promise<{ id: string; key: string; label: string }> {
  const clean = String(label || 'CLI').trim().slice(0, 60) || 'CLI';
  const n = await one<{ n: number }>('select count(*) as n from api_keys where user_id = ?', [userId]);
  if (Number(n?.n ?? 0) >= 20) throw new UserError('You can have up to 20 API keys; delete one first');
  const key = `mf_${token(30)}`;
  const id = randomUUID();
  await run('insert into api_keys (id, user_id, key_hash, label, created_at) values (?,?,?,?,?)', [id, userId, sha256(key), clean, Date.now()]);
  return { id, key, label: clean };
}

export async function listApiKeys(userId: string) {
  return all<{ id: string; label: string; created_at: number; last_used_at: number | null }>(
    'select id, label, created_at, last_used_at from api_keys where user_id = ? order by created_at desc',
    [userId],
  );
}

export async function deleteApiKey(userId: string, id: string): Promise<void> {
  if (!(await run('delete from api_keys where id = ? and user_id = ?', [id, userId]))) throw new UserError('No such key', 404);
}

// --- passkeys ------------------------------------------------------------------

async function saveChallenge(challenge: string, userId: string | null): Promise<string> {
  const id = randomUUID();
  await run('delete from webauthn_challenges where expires_at < ?', [Date.now()]);
  await run('insert into webauthn_challenges (id, challenge, user_id, expires_at) values (?,?,?,?)', [id, challenge, userId, Date.now() + 5 * 60_000]);
  return id;
}

async function takeChallenge(id: string): Promise<{ challenge: string; user_id: string | null } | null> {
  const row = await one<{ challenge: string; user_id: string | null }>('select challenge, user_id from webauthn_challenges where id = ? and expires_at > ?', [String(id || ''), Date.now()]);
  await run('delete from webauthn_challenges where id = ?', [String(id || '')]);
  return row;
}

export async function passkeyRegisterOptions(c: Context, user: User) {
  const existing = await all<{ id: string; transports: string | null }>('select id, transports from passkeys where user_id = ? and rp_id = ?', [user.id, rpId(c)]);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(c),
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ? JSON.parse(p.transports) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  return { options, challengeId: await saveChallenge(options.challenge, user.id) };
}

export async function passkeyRegisterVerify(c: Context, user: User, challengeId: string, response: unknown) {
  const ch = await takeChallenge(challengeId);
  if (!ch || ch.user_id !== user.id) throw new UserError('That passkey request expired; try again');
  const v = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge: ch.challenge,
    expectedOrigin: publicOrigin(c),
    expectedRPID: rpId(c),
    requireUserVerification: false,
  });
  if (!v.verified || !v.registrationInfo) throw new UserError('The passkey could not be verified');
  const cred = v.registrationInfo.credential;
  await run('insert or replace into passkeys (id, user_id, public_key, counter, transports, rp_id, created_at) values (?,?,?,?,?,?,?)', [
    cred.id,
    user.id,
    Buffer.from(cred.publicKey).toString('base64'),
    cred.counter,
    JSON.stringify(cred.transports ?? []),
    rpId(c),
    Date.now(),
  ]);
}

export async function passkeyLoginOptions(c: Context) {
  const options = await generateAuthenticationOptions({ rpID: rpId(c), userVerification: 'preferred' });
  return { options, challengeId: await saveChallenge(options.challenge, null) };
}

export async function passkeyLoginVerify(c: Context, challengeId: string, response: { id?: string } & Record<string, unknown>): Promise<User> {
  const ch = await takeChallenge(challengeId);
  if (!ch) throw new UserError('That sign-in request expired; try again');
  const pk = await one<{ id: string; user_id: string; public_key: string; counter: number; transports: string | null }>(
    'select * from passkeys where id = ? and rp_id = ?',
    [String(response?.id || ''), rpId(c)],
  );
  if (!pk) throw new UserError('This passkey is not registered here. Sign in with an email link instead.', 401);
  const v = await verifyAuthenticationResponse({
    response: response as unknown as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
    expectedChallenge: ch.challenge,
    expectedOrigin: publicOrigin(c),
    expectedRPID: rpId(c),
    credential: {
      id: pk.id,
      publicKey: new Uint8Array(Buffer.from(pk.public_key, 'base64')),
      counter: Number(pk.counter),
      transports: pk.transports ? JSON.parse(pk.transports) : undefined,
    },
    requireUserVerification: false,
  });
  if (!v.verified) throw new UserError('The passkey could not be verified', 401);
  await run('update passkeys set counter = ? where id = ?', [v.authenticationInfo.newCounter, pk.id]);
  const u = await one<User>('select id, email from users where id = ?', [pk.user_id]);
  if (!u) throw new UserError('Account not found', 401);
  return u;
}

export async function listPasskeys(userId: string) {
  return all<{ id: string; rp_id: string; created_at: number }>('select id, rp_id, created_at from passkeys where user_id = ? order by created_at desc', [userId]);
}

export async function deletePasskey(userId: string, id: string): Promise<void> {
  if (!(await run('delete from passkeys where id = ? and user_id = ?', [id, userId]))) throw new UserError('No such passkey', 404);
}
