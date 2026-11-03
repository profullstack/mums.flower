#!/usr/bin/env node
// mums.flower CLI: remember mom's days, look up flower meanings, send bouquet cards, and an
// MCP bridge over stdio. Talks to the API at MUMS_URL (default https://mums.flower.pit.world).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const VERSION = '0.1.0';
const BASE = (process.env.MUMS_URL || 'https://mums.flower.pit.world').replace(/\/$/, '');
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'mums.flower');
const CONFIG = join(CONFIG_DIR, 'config.json');

function readKey() {
  if (process.env.MUMS_API_KEY) return process.env.MUMS_API_KEY;
  try {
    return JSON.parse(readFileSync(CONFIG, 'utf8')).apiKey || null;
  } catch {
    return null;
  }
}

async function call(method, path, body, { auth = true } = {}) {
  const headers = { accept: 'application/json' };
  const key = readKey();
  if (auth && key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = r.status === 401 ? ` (run: mums login, or set MUMS_API_KEY; keys at ${BASE}/account)` : '';
    throw new Error(`${data.error || `HTTP ${r.status}`}${hint}`);
  }
  return data;
}

const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : undefined);

function parse(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      if (inline !== undefined) opts[k] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts[k] = argv[++i];
      else opts[k] = true;
    } else pos.push(a);
  }
  return { pos, opts };
}

const out = (v, opts) => {
  if (opts.json) console.log(JSON.stringify(v, null, 2));
  return !opts.json;
};

const HELP = `mums.flower ${VERSION}: flowers for moms (${BASE})

  mums login                      save an API key (create one at ${BASE}/account)
  mums whoami
  mums flowers [slug]             what flowers mean
  mums mothers-day [--country US|UK] [--year 2027]
  mums moms                       list your moms
  mums moms add <name> [--birthday MM-DD] [--country US|UK] [--flowers a,b] [--email e] [--relationship Grandma]
  mums moms rm <id>
  mums upcoming [--days 60]       birthdays and Mother's Days coming up
  mums card --from <you> --message <text> [--to <name> | --mom <id>] [--flowers a,b] [--theme blush]
  mums cards                      your cards
  mums send <card-id> <email>     email a card
  mums mcp                        MCP server over stdio (uses MUMS_API_KEY or the saved key)

  --json on any command prints JSON. MUMS_URL changes the server.`;

async function main(argv) {
  const { pos, opts } = parse(argv);
  const [cmd, sub, ...rest] = pos;
  switch (cmd) {
    case undefined:
    case 'help':
      console.log(HELP);
      return;
    case 'version':
      console.log(VERSION);
      return;
    case 'login': {
      let key = opts.key;
      if (!key) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        key = (await rl.question(`API key (from ${BASE}/account): `)).trim();
        rl.close();
      }
      if (!/^mf_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('That does not look like a mums.flower API key (mf_...)');
      process.env.MUMS_API_KEY = key;
      const me = await call('GET', '/me');
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      writeFileSync(CONFIG, JSON.stringify({ apiKey: key }, null, 2), { mode: 0o600 });
      console.log(`Signed in as ${me.email}. Key saved to ${CONFIG}`);
      return;
    }
    case 'whoami': {
      const me = await call('GET', '/me');
      if (out(me, opts)) console.log(me.email);
      return;
    }
    case 'flowers': {
      if (sub) {
        const { flower: f } = await call('GET', `/flowers/${encodeURIComponent(sub)}`, undefined, { auth: false });
        if (out(f, opts)) console.log(`${f.emoji} ${f.name}\n  ${f.meaning}\n  For mom: ${f.forMom}\n  Season: ${f.season} · Colours: ${f.colors.join(', ')}\n  Care: ${f.care}`);
      } else {
        const { flowers } = await call('GET', '/flowers', undefined, { auth: false });
        if (out(flowers, opts)) for (const f of flowers) console.log(`${f.emoji} ${f.slug.padEnd(14)} ${f.meaning}`);
      }
      return;
    }
    case 'mothers-day': {
      const q = new URLSearchParams();
      if (opts.country) q.set('country', String(opts.country));
      if (opts.year) q.set('year', String(opts.year));
      const r = await call('GET', `/mothers-day?${q}`, undefined, { auth: false });
      if (out(r, opts)) console.log(`${r.name} (${r.country}): ${r.date}`);
      return;
    }
    case 'moms': {
      if (sub === 'add') {
        const name = rest.join(' ') || opts.name;
        if (!name) throw new Error('usage: mums moms add <name> [--birthday MM-DD] ...');
        const { mom } = await call('POST', '/moms', {
          name,
          birthday: opts.birthday,
          country: opts.country,
          favoriteFlowers: list(opts.flowers),
          email: opts.email,
          relationship: opts.relationship,
          notes: opts.notes,
        });
        if (out(mom, opts)) console.log(`Saved ${mom.name} (${mom.id})`);
        return;
      }
      if (sub === 'rm') {
        if (!rest[0]) throw new Error('usage: mums moms rm <id>');
        await call('DELETE', `/moms/${encodeURIComponent(rest[0])}`);
        if (out({ ok: true }, opts)) console.log('Removed.');
        return;
      }
      const { moms } = await call('GET', '/moms');
      if (out(moms, opts)) {
        if (!moms.length) console.log('No moms yet: mums moms add "Mom" --birthday 05-14');
        for (const m of moms) console.log(`${m.id}  ${m.name} (${m.relationship})${m.birthday ? `  birthday ${m.birthday}` : ''}  ${m.country}  ${m.favoriteFlowers.join(', ')}`);
      }
      return;
    }
    case 'upcoming': {
      const r = await call('GET', `/upcoming?days=${encodeURIComponent(opts.days || 60)}`);
      if (out(r, opts)) {
        if (!r.upcoming.length) console.log('Nothing in that window.');
        for (const u of r.upcoming) console.log(`${u.date}  ${u.daysAway === 0 ? 'today ' : `in ${u.daysAway}d`.padEnd(6)}  ${u.label}${u.kind === 'mothers-day' ? ` (${u.momName})` : ''}  → ${u.suggestion.map((s) => s.name).join(', ')}`);
      }
      return;
    }
    case 'card': {
      const { card } = await call('POST', '/cards', {
        toName: opts.to,
        momId: opts.mom,
        fromName: opts.from,
        message: opts.message,
        flowers: list(opts.flowers),
        theme: opts.theme,
      });
      if (out(card, opts)) console.log(`Card for ${card.toName}: ${card.url}\nSend it: mums send ${card.id} <email>`);
      return;
    }
    case 'cards': {
      const { cards } = await call('GET', '/cards');
      if (out(cards, opts)) for (const k of cards) console.log(`${k.id}  to ${k.toName}  ${new Date(k.createdAt).toISOString().slice(0, 10)}${k.sentTo ? `  sent to ${k.sentTo}` : ''}  ${k.url}`);
      return;
    }
    case 'send': {
      if (!sub || !rest[0]) throw new Error('usage: mums send <card-id> <email>');
      const r = await call('POST', `/cards/${encodeURIComponent(sub)}/send`, { to: rest[0] });
      if (out(r, opts)) console.log(`Sent to ${r.sentTo}. ${r.url}`);
      return;
    }
    case 'mcp':
      return mcpStdio();
    default:
      throw new Error(`Unknown command "${cmd}". Run: mums help`);
  }
}

/** MCP over stdio: forwards each JSON-RPC message to the remote /mcp endpoint with the API key. */
async function mcpStdio() {
  const key = readKey();
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      const r = await fetch(`${BASE}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(msg),
      });
      if (r.status === 202 || msg.id === undefined) continue; // notifications get no reply
      const text = await r.text();
      process.stdout.write(`${text.trim()}\n`);
    } catch (e) {
      if (msg.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: String(e.message || e) } })}\n`);
    }
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`mums: ${e.message || e}`);
  process.exit(1);
});
