import { Hono, type Context } from 'hono';
import {
  createSession,
  currentUser,
  passkeyLoginOptions,
  passkeyLoginVerify,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  rateLimited,
} from './auth.ts';
import { FLOWERS, getFlower } from './flowers.ts';
import { sendCard } from './mail.ts';
import { mothersDay, nextMothersDay, todayUtc } from './occasions.ts';
import { handleCoinPayWebhook } from './payments.ts';
import {
  addMom,
  cleanEmail,
  createCard,
  deleteMom,
  getCard,
  getMom,
  getOwnCard,
  listCards,
  listMoms,
  markCardSent,
  updateMom,
  upcoming,
  UserError,
} from './service.ts';

/** JSON API, v1. Auth: the session cookie or `Authorization: Bearer mf_...` (an API key from /account). */
export const api = new Hono();

api.onError((err, c) => {
  if (err instanceof UserError) return c.json({ error: err.message }, err.status as 400);
  if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON' }, 400);
  console.error('[api]', err);
  return c.json({ error: 'Internal error' }, 500);
});

async function need(c: Context) {
  const u = await currentUser(c);
  if (!u) throw new UserError('Sign in, or send Authorization: Bearer <API key from /account>', 401);
  return u;
}

const json = async (c: Context): Promise<Record<string, unknown>> => {
  const body = await c.req.json().catch(() => {
    throw new UserError('Send a JSON body');
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('Send a JSON object');
  return body as Record<string, unknown>;
};

api.get('/', (c) =>
  c.json({
    name: 'mums.flower API',
    version: 1,
    docs: '/docs',
    auth: 'Authorization: Bearer <API key from /account>',
    endpoints: [
      'GET /api/v1/flowers',
      'GET /api/v1/flowers/:slug',
      'GET /api/v1/mothers-day?country=US|UK&year=',
      'GET /api/v1/me',
      'GET /api/v1/moms',
      'POST /api/v1/moms',
      'GET /api/v1/moms/:id',
      'PATCH /api/v1/moms/:id',
      'DELETE /api/v1/moms/:id',
      'GET /api/v1/upcoming?days=60',
      'GET /api/v1/cards',
      'POST /api/v1/cards',
      'GET /api/v1/cards/:id',
      'POST /api/v1/cards/:id/send',
    ],
  }),
);

// --- public ------------------------------------------------------------------
api.get('/flowers', (c) => c.json({ flowers: FLOWERS }));
api.get('/flowers/:slug', (c) => {
  const f = getFlower(c.req.param('slug'));
  return f ? c.json({ flower: f }) : c.json({ error: 'No such flower' }, 404);
});
api.get('/mothers-day', (c) => {
  const country = (c.req.query('country') || 'US').toUpperCase() === 'UK' ? 'UK' : 'US';
  const year = c.req.query('year');
  if (year && !/^\d{4}$/.test(year)) throw new UserError('year must be YYYY');
  const date = year ? mothersDay(Number(year), country) : nextMothersDay(country, todayUtc());
  return c.json({ country, date, name: country === 'UK' ? 'Mothering Sunday' : "Mother's Day" });
});

// --- signed in -----------------------------------------------------------------
api.get('/me', async (c) => {
  const u = await need(c);
  return c.json({ id: u.id, email: u.email });
});

api.get('/moms', async (c) => c.json({ moms: await listMoms((await need(c)).id) }));
api.post('/moms', async (c) => c.json({ mom: await addMom((await need(c)).id, await json(c)) }, 201));
api.get('/moms/:id', async (c) => c.json({ mom: await getMom((await need(c)).id, c.req.param('id')) }));
api.patch('/moms/:id', async (c) => c.json({ mom: await updateMom((await need(c)).id, c.req.param('id'), await json(c)) }));
api.delete('/moms/:id', async (c) => {
  await deleteMom((await need(c)).id, c.req.param('id'));
  return c.json({ ok: true });
});

api.get('/upcoming', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') || 60) || 60, 1), 400);
  return c.json({ today: todayUtc(), upcoming: await upcoming((await need(c)).id, todayUtc(), days) });
});

api.get('/cards', async (c) => c.json({ cards: await listCards((await need(c)).id) }));
api.post('/cards', async (c) => c.json({ card: await createCard((await need(c)).id, await json(c)) }, 201));
api.get('/cards/:id', async (c) => {
  const card = await getCard(c.req.param('id'));
  return card ? c.json({ card }) : c.json({ error: 'No such card' }, 404);
});
api.post('/cards/:id/send', async (c) => {
  const u = await need(c);
  const card = await getOwnCard(u.id, c.req.param('id'));
  const to = cleanEmail((await json(c)).to, true)!;
  if (rateLimited(`send:${u.id}`, 20, 86_400_000)) throw new UserError('Daily send limit reached; try again tomorrow', 429);
  const r = await sendCard(to, card, u.email);
  if (!r.sent) throw new UserError(`Not sent: ${r.error || 'unknown error'}`, 502);
  await markCardSent(card.id, to);
  return c.json({ ok: true, sentTo: to, url: card.url });
});

// --- passkeys (browser) ----------------------------------------------------------
api.post('/passkeys/register/options', async (c) => c.json(await passkeyRegisterOptions(c, await need(c))));
api.post('/passkeys/register/verify', async (c) => {
  const u = await need(c);
  const b = await json(c);
  await passkeyRegisterVerify(c, u, String(b.challengeId || ''), b.response);
  return c.json({ ok: true });
});
api.post('/passkeys/login/options', async (c) => c.json(await passkeyLoginOptions(c)));
api.post('/passkeys/login/verify', async (c) => {
  const b = await json(c);
  const u = await passkeyLoginVerify(c, String(b.challengeId || ''), (b.response ?? {}) as Record<string, unknown>);
  await createSession(c, u.id);
  return c.json({ ok: true });
});

// --- payments ------------------------------------------------------------------
api.post('/webhooks/coinpay', async (c) => {
  const raw = await c.req.text();
  const r = await handleCoinPayWebhook(raw, c.req.header('x-coinpay-signature') ?? null);
  return c.json(r.body, r.status as 200);
});
