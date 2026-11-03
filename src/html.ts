import { footerHtml } from '@profullstack/footer';

/** HTML helpers: escaping, the shared layout, and the footers. */
export const h = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const SITE = 'https://mums.flower.pit.world/';

let pitFooter = { html: '', at: 0 };
/** The pit.world network footer (pit.world, *.pit.world and Moshpit names only). Cached 1 h; never blocks a page. */
async function pitWorldFooter(): Promise<string> {
  if (process.env.NODE_ENV === 'test') return '';
  if (Date.now() - pitFooter.at < 3600_000) return pitFooter.html;
  try {
    const r = await fetch('https://pit.world/snippets/footer.html?site=mums.flower.pit.world', { signal: AbortSignal.timeout(1500) });
    if (r.ok) pitFooter = { html: await r.text(), at: Date.now() };
    else pitFooter.at = Date.now() - 3000_000; // retry in ~10 min
  } catch {
    pitFooter.at = Date.now() - 3000_000;
  }
  return pitFooter.html;
}

let ringFooter = { html: '', at: 0 };
/** Site links + the Profullstack webring row (server-rendered so the ring verifier sees it). */
async function siteFooter(): Promise<string> {
  if (Date.now() - ringFooter.at < 900_000 && ringFooter.html) return ringFooter.html;
  try {
    const html = await footerHtml({
      site: SITE,
      since: 2026,
      links: [
        { label: 'Flowers', href: '/flowers' },
        { label: 'Bouquet card', href: '/cards/new' },
        { label: 'API, MCP + CLI', href: '/docs' },
        { label: 'llms.txt', href: '/llms.txt' },
      ],
    });
    ringFooter = { html, at: Date.now() };
  } catch {
    ringFooter = { html: '<footer><p>mums.flower · <a href="/docs">API, MCP + CLI</a></p></footer>', at: Date.now() - 600_000 };
  }
  return ringFooter.html;
}

export interface LayoutOpts {
  title: string;
  description?: string;
  user?: { email: string } | null;
  canonicalPath?: string;
  noindex?: boolean;
  bodyClass?: string;
}

export async function layout(o: LayoutOpts, body: string): Promise<string> {
  const desc = o.description || "Remember mom's birthday and Mother's Day, learn what flowers mean, and send her a bouquet card.";
  const [site, pit] = await Promise.all([siteFooter(), pitWorldFooter()]);
  const nav = o.user
    ? `<a href="/app">My moms</a><a href="/cards/new">New card</a><a href="/flowers">Flowers</a><a href="/account">Account</a>`
    : `<a href="/flowers">Flowers</a><a href="/cards/new">New card</a><a href="/login" class="btn small">Sign in</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${h(o.title)}</title>
<meta name="description" content="${h(desc)}">
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
${o.canonicalPath ? `<link rel="canonical" href="${h(SITE.replace(/\/$/, '') + o.canonicalPath)}">` : ''}
<meta property="og:title" content="${h(o.title)}">
<meta property="og:description" content="${h(desc)}">
<meta property="og:site_name" content="mums.flower">
<meta name="theme-color" content="#b0476b">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="stylesheet" href="/app.css">
<script defer src="https://crawlproof.com/stats.js"></script>
<script type="module" src="/app.js"></script>
</head>
<body class="${h(o.bodyClass || '')}">
<header class="top"><a class="brand" href="/">💐 <span>mums.flower</span></a><nav>${nav}</nav></header>
<main>${body}</main>
${site}
${pit}
</body>
</html>`;
}

export const flash = (msg: string | undefined, kind: 'ok' | 'err' = 'ok') => (msg ? `<p class="flash ${kind}" role="status">${h(msg)}</p>` : '');
