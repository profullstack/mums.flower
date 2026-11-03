import { createClient } from '@libsql/client';
import { signCoinPayWebhook } from '@profullstack/stack/coinpay';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, one, setDb } from '../src/db.ts';
import { setMailSender } from '../src/mail.ts';

/**
 * End to end through app.request(): the same Hono app the server runs, an
 * in-memory database, and a mail transport that records instead of sending.
 */
process.env.MUMS_HOSTS = 'mums.flower.pit.world,mums.flower,localhost';
process.env.COINPAYPORTAL_WEBHOOK_SECRET = 'whsec_test';
const { app } = await import('../src/app.ts');

const HOST = 'mums.flower.pit.world';
let outbox: Array<{ to: string; subject: string; text: string; html: string }> = [];

beforeAll(async () => {
  const c = createClient({ url: ':memory:' });
  setDb(c);
  await migrate(c);
});
beforeEach(() => {
  outbox = [];
  setMailSender(async (m) => {
    outbox.push(m);
    return { sent: true };
  });
});

type Opts = { method?: string; body?: unknown; form?: Record<string, string | string[]>; cookie?: string; key?: string; origin?: string };
async function req(path: string, o: Opts = {}) {
  const headers: Record<string, string> = { host: HOST };
  let body: BodyInit | undefined;
  if (o.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(o.body);
  }
  if (o.form) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o.form)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = p.toString();
  }
  if (o.cookie) headers.cookie = o.cookie;
  if (o.key) headers.authorization = `Bearer ${o.key}`;
  if (o.origin) headers.origin = o.origin;
  return app.request(`https://${HOST}${path}`, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body });
}

/** Sign in through the real magic-link flow; returns the session cookie. */
async function signIn(email: string): Promise<string> {
  const r = await req('/login', { form: { email }, origin: `https://${HOST}` });
  expect(r.status).toBe(303);
  const mail = outbox.find((m) => m.to === email);
  expect(mail?.subject).toMatch(/sign-in link/);
  const link = /https:\/\/mums\.flower\.pit\.world\/auth\/verify\?token=[\w-]+/.exec(mail!.text)![0];
  const v = await req(link.replace(`https://${HOST}`, ''));
  expect(v.status).toBe(303);
  const cookie = v.headers.get('set-cookie')!;
  expect(cookie).toMatch(/mums_session=/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  // The link works once.
  const again = await req(link.replace(`https://${HOST}`, ''));
  expect(again.headers.get('location')).toMatch(/^\/login\?e=/);
  return cookie.split(';')[0];
}

describe('public pages', () => {
  it('renders every public page with the footers', async () => {
    for (const p of ['/', '/flowers', '/flowers/carnation', '/cards/new', '/login', '/docs', '/offline']) {
      const r = await req(p);
      expect(r.status, p).toBe(200);
      const html = await r.text();
      expect(html, p).toContain('mums.flower');
    }
    const home = await (await req('/')).text();
    expect(home).toMatch(/days to Mother&#39;s Day \(US\)|days to Mother's Day \(US\)/);
    expect(home).toContain('/ring/profullstack/'); // Profullstack webring row
    expect((await req('/flowers/not-a-flower')).status).toBe(404);
  });

  it('serves the PWA, llms.txt, robots and sitemap', async () => {
    const m = await (await req('/manifest.webmanifest')).json();
    expect(m.display).toBe('standalone');
    expect((await req('/sw.js')).headers.get('content-type')).toMatch(/javascript/);
    expect(await (await req('/llms.txt')).text()).toMatch(/MCP/);
    expect(await (await req('/sitemap.xml')).text()).toContain('/flowers/peony');
    expect((await req('/vendor/simplewebauthn.js')).status).toBe(200);
  });
});

describe('signed-in journey', () => {
  let cookie = '';
  let momId = '';
  let key = '';

  beforeAll(async () => {
    cookie = await signIn('kid@example.com');
  });

  it('adds a mom from the dashboard form and shows her days', async () => {
    const r = await req('/moms', {
      cookie,
      origin: `https://${HOST}`,
      form: { name: 'Mom <script>', relationship: 'Mom', birthday_date: '2000-05-14', country: 'US', email: 'mom@example.com', favoriteFlowers: ['peony', 'tulip', 'nope'] },
    });
    expect(r.status).toBe(303);
    const page = await (await req('/app', { cookie })).text();
    expect(page).toContain('Mom &lt;script&gt;');
    expect(page).not.toContain('Mom <script>');
    expect(page).toMatch(/birthday 05-14/);
    const mom = await one<{ id: string; favorite_flowers: string }>("select id, favorite_flowers from moms where name like 'Mom%'");
    momId = mom!.id;
    expect(JSON.parse(mom!.favorite_flowers)).toEqual(['peony', 'tulip']);
  });

  it('refuses a cross-site form post', async () => {
    const r = await req('/moms', { cookie, origin: 'https://evil.example', form: { name: 'X' } });
    expect(r.status).toBe(403);
  });

  it('creates an API key and uses it on the API', async () => {
    const r = await req('/account/keys', { cookie, origin: `https://${HOST}`, form: { label: 'test' } });
    key = decodeURIComponent(/key=([^&]+)/.exec(r.headers.get('location')!)![1]);
    expect(key).toMatch(/^mf_/);
    const me = await (await req('/api/v1/me', { key })).json();
    expect(me.email).toBe('kid@example.com');
    const moms = await (await req('/api/v1/moms', { key })).json();
    expect(moms.moms).toHaveLength(1);
    const up = await (await req('/api/v1/upcoming?days=400', { key })).json();
    expect(up.upcoming.map((u: { kind: string }) => u.kind).sort()).toEqual(['birthday', 'mothers-day']);
  });

  it('validates API input', async () => {
    const bad = await req('/api/v1/moms', { key, body: { name: 'A', birthday: '02-31' } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/birthday/);
    expect((await req('/api/v1/moms', { body: { name: 'A' } })).status).toBe(401);
    const upd = await req(`/api/v1/moms/${momId}`, { key, method: 'PATCH', body: { country: 'UK' } });
    expect((await upd.json()).mom.country).toBe('UK');
  });

  it('makes a card from a mom, emails it, and keeps it private to its owner', async () => {
    const r = await req('/api/v1/cards', { key, body: { momId, fromName: 'Sam', message: 'Love you <3' } });
    expect(r.status).toBe(201);
    const { card } = await r.json();
    expect(card.toName).toBe('Mom <script>');
    expect(card.flowers).toEqual(['peony', 'tulip']);
    expect(card.url).toBe(`https://mums.flower.pit.world/c/${card.id}`);
    const page = await (await req(`/c/${card.id}`)).text();
    expect(page).toContain('Love you &lt;3');
    const sent = await req(`/api/v1/cards/${card.id}/send`, { key, body: { to: 'mom@example.com' } });
    expect(sent.status).toBe(200);
    expect(outbox.at(-1)!.to).toBe('mom@example.com');
    expect(outbox.at(-1)!.html).not.toContain('<3'); // escaped in the email too

    const other = await signIn('stranger@example.com');
    const k2 = await req('/account/keys', { cookie: other, origin: `https://${HOST}`, form: { label: 'x' } });
    const key2 = decodeURIComponent(/key=([^&]+)/.exec(k2.headers.get('location')!)![1]);
    expect((await req(`/api/v1/cards/${card.id}/send`, { key: key2, body: { to: 'x@example.com' } })).status).toBe(404);
    expect((await req(`/api/v1/moms/${momId}`, { key: key2 })).status).toBe(404);
    expect((await req('/api/v1/cards', { key: key2, body: { momId, fromName: 'x', message: 'y' } })).status).toBe(404);
  });

  it('lets anyone make a card without an account (no email sending)', async () => {
    const r = await req('/cards', { origin: `https://${HOST}`, form: { toName: 'Grandma', fromName: 'Al', message: 'Hi', flowers: ['rose'], theme: 'meadow' } });
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toMatch(/^\/c\/[\w-]+\?new=1$/);
  });

  it('premium themes stay blush until paid; a signed CoinPay webhook unlocks them', async () => {
    const { card } = await (await req('/api/v1/cards', { key, body: { toName: 'Mom', fromName: 'Sam', message: 'x', flowers: ['rose'], theme: 'gold' } })).json();
    expect(await (await req(`/c/${card.id}`)).text()).toContain('theme-blush');
    const rawBody = JSON.stringify({ type: 'payment.confirmed', data: { checkout_session_id: 'cs_1', amount_usd: 3, metadata: { card_id: card.id } } });
    const bad = await app.request('https://mums.flower.pit.world/api/v1/webhooks/coinpay', { method: 'POST', body: rawBody, headers: { host: HOST, 'x-coinpay-signature': 't=1,v1=00' } });
    expect(bad.status).toBe(401);
    const sig = signCoinPayWebhook({ rawBody, secret: 'whsec_test' });
    const ok = await app.request('https://mums.flower.pit.world/api/v1/webhooks/coinpay', { method: 'POST', body: rawBody, headers: { host: HOST, 'x-coinpay-signature': sig } });
    expect(ok.status).toBe(200);
    expect(await (await req(`/c/${card.id}`)).text()).toContain('theme-gold');
  });

  it('sign-out ends the session', async () => {
    const c2 = await signIn('leaver@example.com');
    await req('/logout', { cookie: c2, method: 'POST', origin: `https://${HOST}` });
    expect((await req('/app', { cookie: c2 })).headers.get('location')).toBe('/login');
  });
});

describe('MCP', () => {
  const rpc = async (method: string, params: unknown, key?: string) => {
    const r = await app.request('https://mums.flower.pit.world/mcp', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    expect(r.status).toBe(200);
    return r.json();
  };

  it('lists tools and answers public ones without a key', async () => {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const tools = await rpc('tools/list', {});
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['list_flowers', 'flower_meaning', 'mothers_day', 'list_moms', 'add_mom', 'upcoming', 'create_card', 'send_card']),
    );
    const md = await rpc('tools/call', { name: 'mothers_day', arguments: { country: 'UK', year: 2027 } });
    expect(md.result.content[0].text).toContain('2027-03-07');
    const moms = await rpc('tools/call', { name: 'list_moms', arguments: {} });
    expect(moms.result.isError).toBe(true);
  });

  it('acts as the user with an API key', async () => {
    const cookie = await signIn('mcp@example.com');
    const k = await req('/account/keys', { cookie, origin: `https://${HOST}`, form: { label: 'mcp' } });
    const key = decodeURIComponent(/key=([^&]+)/.exec(k.headers.get('location')!)![1]);
    const added = await rpc('tools/call', { name: 'add_mom', arguments: { name: 'Nana', birthday: '1940-03-02', country: 'UK', favoriteFlowers: ['daisy'] } }, key);
    expect(added.result.isError).toBeFalsy();
    const card = await rpc('tools/call', { name: 'create_card', arguments: { fromName: 'Me', message: 'Hi Nana', toName: 'Nana', flowers: ['daisy'] } }, key);
    expect(JSON.parse(card.result.content[0].text).url).toMatch(/\/c\//);
  });
});
