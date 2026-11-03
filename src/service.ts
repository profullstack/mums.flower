import { randomBytes, randomUUID } from 'node:crypto';
import { all, one, run } from './db.ts';
import { cleanFlowers, FLOWERS, getFlower } from './flowers.ts';
import { cleanBirthday, occasionsFor, todayUtc, type Occasion } from './occasions.ts';

/**
 * Everything the web pages, the API, MCP and the CLI do goes through here, so
 * every surface enforces the same rules (ownership, validation, limits).
 */
export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const THEMES = ['blush', 'meadow', 'sunrise', 'lavender', 'midnight'] as const;
export const PREMIUM_THEMES = ['gold', 'watercolor'] as const;
export const PREMIUM_PRICE_USD = 3;
const MAX_MOMS = 50;

export interface Mom {
  id: string;
  name: string;
  relationship: string;
  birthday: string | null;
  country: 'US' | 'UK';
  favoriteFlowers: string[];
  email: string | null;
  notes: string | null;
  createdAt: number;
}

export interface Card {
  id: string;
  toName: string;
  fromName: string;
  message: string;
  flowers: string[];
  theme: string;
  premium: boolean;
  momId: string | null;
  sentTo: string | null;
  sentAt: number | null;
  createdAt: number;
  url: string;
}

const str = (v: unknown, max: number, field: string, required = false): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (!s) {
    if (required) throw new UserError(`${field} is required`);
    return null;
  }
  if (s.length > max) throw new UserError(`${field} is too long (max ${max})`);
  return s;
};

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export function cleanEmail(v: unknown, required = false): string | null {
  const s = str(v, 254, 'email', required)?.toLowerCase() ?? null;
  if (s && !EMAIL_RE.test(s)) throw new UserError('That email address does not look right');
  return s;
}

// --- users -------------------------------------------------------------------

export async function userByEmail(email: string): Promise<{ id: string; email: string } | null> {
  return one('select id, email from users where email = ?', [email]);
}

export async function ensureUser(email: string): Promise<{ id: string; email: string }> {
  const e = cleanEmail(email, true)!;
  const existing = await userByEmail(e);
  if (existing) return existing;
  const id = randomUUID();
  await run('insert or ignore into users (id, email, created_at) values (?, ?, ?)', [id, e, Date.now()]);
  return (await userByEmail(e))!;
}

// --- moms --------------------------------------------------------------------

type MomRow = {
  id: string;
  name: string;
  relationship: string;
  birthday: string | null;
  country: string;
  favorite_flowers: string;
  email: string | null;
  notes: string | null;
  created_at: number;
};

const toMom = (r: MomRow): Mom => ({
  id: r.id,
  name: r.name,
  relationship: r.relationship,
  birthday: r.birthday,
  country: r.country === 'UK' ? 'UK' : 'US',
  favoriteFlowers: JSON.parse(r.favorite_flowers || '[]'),
  email: r.email,
  notes: r.notes,
  createdAt: Number(r.created_at),
});

function momFields(input: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};
  if (!partial || 'name' in input) out.name = str(input.name, 80, 'name', true);
  if (!partial || 'relationship' in input) out.relationship = str(input.relationship, 40, 'relationship') ?? 'Mom';
  if (!partial || 'birthday' in input) {
    const raw = input.birthday;
    const b = raw == null || raw === '' ? null : cleanBirthday(raw);
    if (raw != null && raw !== '' && !b) throw new UserError('birthday must be MM-DD (or YYYY-MM-DD)');
    out.birthday = b;
  }
  if (!partial || 'country' in input) {
    const c = String(input.country ?? 'US').toUpperCase();
    if (c !== 'US' && c !== 'UK') throw new UserError('country must be US or UK');
    out.country = c;
  }
  if (!partial || 'favoriteFlowers' in input) out.favorite_flowers = JSON.stringify(cleanFlowers(input.favoriteFlowers ?? []));
  if (!partial || 'email' in input) out.email = cleanEmail(input.email);
  if (!partial || 'notes' in input) out.notes = str(input.notes, 500, 'notes');
  return out;
}

export async function listMoms(userId: string): Promise<Mom[]> {
  return (await all<MomRow>('select * from moms where user_id = ? order by name', [userId])).map(toMom);
}

export async function getMom(userId: string, id: string): Promise<Mom> {
  const r = await one<MomRow>('select * from moms where id = ? and user_id = ?', [id, userId]);
  if (!r) throw new UserError('No such mom', 404);
  return toMom(r);
}

export async function addMom(userId: string, input: Record<string, unknown>): Promise<Mom> {
  const n = await one<{ n: number }>('select count(*) as n from moms where user_id = ?', [userId]);
  if (Number(n?.n ?? 0) >= MAX_MOMS) throw new UserError(`You can keep up to ${MAX_MOMS} moms`);
  const f = momFields(input);
  const id = randomUUID();
  await run(
    'insert into moms (id, user_id, name, relationship, birthday, country, favorite_flowers, email, notes, created_at) values (?,?,?,?,?,?,?,?,?,?)',
    [id, userId, f.name as string, f.relationship as string, f.birthday as string | null, f.country as string, f.favorite_flowers as string, f.email as string | null, f.notes as string | null, Date.now()],
  );
  return getMom(userId, id);
}

export async function updateMom(userId: string, id: string, input: Record<string, unknown>): Promise<Mom> {
  await getMom(userId, id);
  const f = momFields(input, true);
  const cols = Object.keys(f);
  if (cols.length) {
    await run(`update moms set ${cols.map((c) => `${c} = ?`).join(', ')} where id = ? and user_id = ?`, [
      ...cols.map((c) => f[c] as string | null),
      id,
      userId,
    ]);
  }
  return getMom(userId, id);
}

export async function deleteMom(userId: string, id: string): Promise<void> {
  if (!(await run('delete from moms where id = ? and user_id = ?', [id, userId]))) throw new UserError('No such mom', 404);
}

export interface Upcoming extends Occasion {
  momId: string;
  momName: string;
  suggestion: { slug: string; name: string; emoji: string }[];
}

/** Every mom's next occasions, soonest first, with a flower suggestion for each. */
export async function upcoming(userId: string, today = todayUtc(), withinDays = 400): Promise<Upcoming[]> {
  const moms = await listMoms(userId);
  const out: Upcoming[] = [];
  for (const m of moms) {
    for (const o of occasionsFor(m, today)) {
      if (o.daysAway > withinDays) continue;
      const fav = m.favoriteFlowers.map(getFlower).filter(Boolean);
      const picks = (fav.length ? fav : [getFlower(o.kind === 'mothers-day' ? 'carnation' : 'peony')]).slice(0, 3);
      out.push({ ...o, momId: m.id, momName: m.name, suggestion: picks.map((f) => ({ slug: f!.slug, name: f!.name, emoji: f!.emoji })) });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.momName.localeCompare(b.momName));
}

// --- cards -------------------------------------------------------------------

type CardRow = {
  id: string;
  to_name: string;
  from_name: string;
  message: string;
  flowers: string;
  theme: string;
  premium: number;
  mom_id: string | null;
  sent_to: string | null;
  sent_at: number | null;
  created_at: number;
};

export const publicBase = () => (process.env.MUMS_PUBLIC_URL || 'https://mums.flower.pit.world').replace(/\/$/, '');

const toCard = (r: CardRow): Card => ({
  id: r.id,
  toName: r.to_name,
  fromName: r.from_name,
  message: r.message,
  flowers: JSON.parse(r.flowers),
  theme: r.theme,
  premium: !!Number(r.premium),
  momId: r.mom_id,
  sentTo: r.sent_to,
  sentAt: r.sent_at == null ? null : Number(r.sent_at),
  createdAt: Number(r.created_at),
  url: `${publicBase()}/c/${r.id}`,
});

/** Unguessable, short, URL-safe card id. */
const cardId = () => randomBytes(9).toString('base64url');

export async function createCard(userId: string | null, input: Record<string, unknown>): Promise<Card> {
  let toName = str(input.toName, 60, 'toName');
  const momId = str(input.momId, 64, 'momId');
  let mom: Mom | null = null;
  if (momId) {
    if (!userId) throw new UserError('Sign in to send a card to one of your moms', 401);
    mom = await getMom(userId, momId);
    toName ??= mom.name;
  }
  if (!toName) throw new UserError('toName is required');
  const fromName = str(input.fromName, 60, 'fromName', true)!;
  const message = str(input.message, 1000, 'message', true)!;
  let flowers = cleanFlowers(input.flowers);
  if (!flowers.length && mom?.favoriteFlowers.length) flowers = mom.favoriteFlowers.slice(0, 6);
  if (!flowers.length) throw new UserError(`Pick at least one flower (one of: ${FLOWERS.map((f) => f.slug).join(', ')})`);
  const theme = String(input.theme ?? 'blush');
  if (!(THEMES as readonly string[]).includes(theme) && !(PREMIUM_THEMES as readonly string[]).includes(theme)) {
    throw new UserError(`theme must be one of ${[...THEMES, ...PREMIUM_THEMES].join(', ')}`);
  }
  const id = cardId();
  await run(
    'insert into cards (id, user_id, mom_id, to_name, from_name, message, flowers, theme, premium, created_at) values (?,?,?,?,?,?,?,?,0,?)',
    [id, userId, mom?.id ?? null, toName, fromName, message, JSON.stringify(flowers), theme, Date.now()],
  );
  return (await getCard(id))!;
}

export async function getCard(id: string): Promise<Card | null> {
  const r = await one<CardRow>('select * from cards where id = ?', [id]);
  return r ? toCard(r) : null;
}

export async function getOwnCard(userId: string, id: string): Promise<Card> {
  const r = await one<CardRow>('select * from cards where id = ? and user_id = ?', [id, userId]);
  if (!r) throw new UserError('No such card', 404);
  return toCard(r);
}

export async function listCards(userId: string): Promise<Card[]> {
  return (await all<CardRow>('select * from cards where user_id = ? order by created_at desc limit 200', [userId])).map(toCard);
}

/** A premium theme shows as the free 'blush' until the card is paid for. */
export function displayTheme(card: Card): string {
  return (PREMIUM_THEMES as readonly string[]).includes(card.theme) && !card.premium ? 'blush' : card.theme;
}

export async function markCardSent(id: string, to: string): Promise<void> {
  await run('update cards set sent_to = ?, sent_at = ? where id = ?', [to, Date.now(), id]);
}

export async function markCardPremium(id: string): Promise<void> {
  await run('update cards set premium = 1 where id = ?', [id]);
}
