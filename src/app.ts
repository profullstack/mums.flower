import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descriptorResponse } from '@profullstack/footer';
import { Hono } from 'hono';
import { api } from './api.ts';
import { allowedHosts, currentUser, publicHost } from './auth.ts';
import { FLOWERS } from './flowers.ts';
import { h, layout } from './html.ts';
import { handleMcp } from './mcp.ts';
import { web } from './web.ts';

/** The whole app: pages, API, MCP and static files. server.ts listens; tests call app.request(). */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const require = createRequire(import.meta.url);

const STATIC: Record<string, { body: string; type: string }> = {
  '/app.css': { body: read('static/app.css'), type: 'text/css; charset=utf-8' },
  '/app.js': { body: read('static/app.js'), type: 'text/javascript; charset=utf-8' },
  '/sw.js': { body: read('static/sw.js'), type: 'text/javascript; charset=utf-8' },
  '/icon.svg': { body: read('static/icon.svg'), type: 'image/svg+xml' },
  // UMD build: sets window.SimpleWebAuthnBrowser (the package ships no single-file ESM bundle).
  '/vendor/simplewebauthn.js': {
    body: readFileSync(join(dirname(require.resolve('@simplewebauthn/browser')), '..', 'dist', 'bundle', 'index.umd.min.js'), 'utf8'),
    type: 'text/javascript; charset=utf-8',
  },
};
const PNG: Record<string, Buffer | null> = {};
for (const size of [192, 512]) {
  try {
    PNG[`/icon-${size}.png`] = readFileSync(join(root, `static/icon-${size}.png`));
  } catch {
    PNG[`/icon-${size}.png`] = null;
  }
}

const MANIFEST = {
  name: 'mums.flower: flowers for moms',
  short_name: 'mums.flower',
  description: "Remember mom's birthday and Mother's Day, learn what flowers mean, and send her a bouquet card.",
  start_url: '/app',
  scope: '/',
  display: 'standalone',
  background_color: '#fff3f6',
  theme_color: '#b0476b',
  icons: [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  shortcuts: [
    { name: 'New bouquet card', url: '/cards/new' },
    { name: 'My moms', url: '/app' },
  ],
};

export const app = new Hono();

// Security headers on everything.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// Cookie-authenticated writes must come from our own pages (SameSite=Lax plus an Origin check).
app.use('*', async (c, next) => {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
  const p = c.req.path;
  if (p === '/api/v1/webhooks/coinpay' || p === '/mcp' || (c.req.header('authorization') || '').startsWith('Bearer ')) return next();
  const origin = c.req.header('origin') || c.req.header('referer');
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      /* bad header */
    }
    if (!allowedHosts().includes(host) && host !== publicHost(c)) return c.text('Cross-site request refused', 403);
  }
  return next();
});

for (const [path, f] of Object.entries(STATIC)) {
  app.get(path, (c) => {
    c.header('Content-Type', f.type);
    c.header('Cache-Control', path === '/sw.js' ? 'no-cache' : 'public, max-age=3600');
    return c.body(f.body);
  });
}
for (const [path, buf] of Object.entries(PNG)) {
  app.get(path, (c) => {
    if (!buf) return c.redirect('/icon.svg', 302);
    c.header('Content-Type', 'image/png');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(new Uint8Array(buf));
  });
}

app.get('/manifest.webmanifest', (c) => {
  c.header('Content-Type', 'application/manifest+json');
  return c.body(JSON.stringify(MANIFEST));
});
app.get('/healthz', (c) => c.json({ ok: true }));
app.get('/robots.txt', (c) => c.text('User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /account\nDisallow: /c/\nSitemap: https://mums.flower.pit.world/sitemap.xml\n'));
app.get('/sitemap.xml', (c) => {
  const base = 'https://mums.flower.pit.world';
  const urls = ['/', '/flowers', '/cards/new', '/docs', ...FLOWERS.map((f) => `/flowers/${f.slug}`)];
  c.header('Content-Type', 'application/xml');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`);
});
app.get('/.well-known/openwebring.json', () => descriptorResponse({ site: 'https://mums.flower.pit.world/', name: 'mums.flower' }));

const LLMS = `# mums.flower

> Flowers for moms: remember a mom's birthday and Mother's Day (US: second Sunday of May; UK: Mothering Sunday, three weeks before Easter), learn what flowers mean, and send her a bouquet card.

Web: https://mums.flower.pit.world (Moshpit name: mums.flower)

## Agents
- MCP (streamable HTTP): https://mums.flower.pit.world/mcp  tools: list_flowers, flower_meaning, mothers_day, list_moms, add_mom, update_mom, upcoming, create_card, send_card
- API: https://mums.flower.pit.world/api/v1  (index lists every endpoint)
- CLI: npx mums.flower --help
- Auth for personal tools: Authorization: Bearer <API key from https://mums.flower.pit.world/account>

## Pages
- [Flower meanings](https://mums.flower.pit.world/flowers)
- [Make a bouquet card](https://mums.flower.pit.world/cards/new)
- [API, MCP and CLI docs](https://mums.flower.pit.world/docs)
`;
app.get('/llms.txt', (c) => c.text(LLMS));

app.all('/mcp', (c) => handleMcp(c));
app.route('/api/v1', api);

app.get('/offline', async (c) =>
  c.html(await layout({ title: 'Offline · mums.flower', noindex: true }, '<section class="narrow"><h1>You are offline</h1><p>Reconnect to see your moms and cards. Saved pages still open.</p></section>')),
);

app.get('/docs', async (c) => {
  const user = await currentUser(c);
  const base = 'https://mums.flower.pit.world';
  return c.html(
    await layout(
      { title: 'API, MCP and CLI · mums.flower', description: 'Use mums.flower from your terminal, your scripts and your AI assistant.', user, canonicalPath: '/docs' },
      `<article class="narrow">
<h1>API, MCP and CLI</h1>
<p>Everything on the site works from code too. Personal tools need an API key: create one in <a href="/account">Account</a>.</p>
<h2>CLI</h2>
<pre><code>npx mums.flower login            # paste your API key
npx mums.flower moms add "Mom" --birthday 05-14 --flowers peony,carnation
npx mums.flower upcoming
npx mums.flower card --to Mom --from "Sam" --message "Love you!" --flowers peony,tulip
npx mums.flower send &lt;card-id&gt; mom@example.com
npx mums.flower flowers peony
npx mums.flower mcp              # MCP over stdio, for desktop assistants</code></pre>
<h2>MCP</h2>
<p>Streamable HTTP at <code>${base}/mcp</code>. Tools: list_flowers, flower_meaning, mothers_day (no key needed); list_moms, add_mom, update_mom, upcoming, create_card, send_card (send <code>Authorization: Bearer &lt;key&gt;</code>).</p>
<pre><code>{
  "mcpServers": {
    "mums.flower": {
      "url": "${base}/mcp",
      "headers": { "Authorization": "Bearer mf_..." }
    }
  }
}</code></pre>
<p>Or run it locally over stdio: <code>MUMS_API_KEY=mf_... npx mums.flower mcp</code>.</p>
<h2>API</h2>
<p>JSON at <code>${base}/api/v1</code> (the index lists every endpoint).</p>
<pre><code>curl ${base}/api/v1/mothers-day?country=UK
curl -H "Authorization: Bearer mf_..." ${base}/api/v1/upcoming
curl -X POST -H "Authorization: Bearer mf_..." -H "content-type: application/json" \\
  -d '{"name":"Mom","birthday":"05-14","country":"US","favoriteFlowers":["peony"]}' \\
  ${base}/api/v1/moms
curl -X POST -H "Authorization: Bearer mf_..." -H "content-type: application/json" \\
  -d '{"toName":"Mom","fromName":"Sam","message":"Love you","flowers":["peony","tulip"]}' \\
  ${base}/api/v1/cards</code></pre>
<p>Flowers: ${FLOWERS.map((f) => `<code>${h(f.slug)}</code>`).join(' ')}</p>
</article>`,
    ),
  );
});

app.route('/', web);

app.notFound(async (c) =>
  c.html(await layout({ title: 'Not found · mums.flower', noindex: true }, '<section class="narrow"><h1>🥀 Not found</h1><p><a href="/">Back to the flowers</a></p></section>'), 404),
);

app.onError(async (err, c) => {
  console.error('[app]', err);
  return c.html(await layout({ title: 'Something went wrong · mums.flower', noindex: true }, '<section class="narrow"><h1>Something went wrong</h1><p>Try again in a moment.</p></section>'), 500);
});
