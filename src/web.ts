import { Hono, type Context } from 'hono';
import {
  createApiKey,
  createLoginLink,
  createSession,
  currentUser,
  deleteApiKey,
  deletePasskey,
  endSession,
  listApiKeys,
  listPasskeys,
  publicOrigin,
  rateLimited,
  redeemLoginToken,
} from './auth.ts';
import { FLOWERS, getFlower } from './flowers.ts';
import { flash, h, layout } from './html.ts';
import { sendCard, sendLoginLink } from './mail.ts';
import { nextMothersDay, todayUtc } from './occasions.ts';
import { paymentsConfigured, startPremiumCheckout } from './payments.ts';
import {
  addMom,
  createCard,
  deleteMom,
  displayTheme,
  getCard,
  getMom,
  listCards,
  listMoms,
  markCardSent,
  PREMIUM_PRICE_USD,
  PREMIUM_THEMES,
  THEMES,
  updateMom,
  upcoming,
  UserError,
  cleanEmail,
  type Card,
  type Mom,
} from './service.ts';

export const web = new Hono();

const clientIp = (c: Context) => (c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'local').split(',')[0].trim();

async function form(c: Context): Promise<Record<string, string | string[]>> {
  const body = await c.req.parseBody({ all: true });
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(body)) out[k] = Array.isArray(v) ? v.map(String) : String(v);
  return out;
}
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Redirect back with a message in the query string. */
const back = (c: Context, path: string, msg: string, kind: 'ok' | 'err' = 'ok') =>
  c.redirect(`${path}${path.includes('?') ? '&' : '?'}${kind === 'ok' ? 'm' : 'e'}=${encodeURIComponent(msg)}`, 303);

const msgs = (c: Context) => flash(c.req.query('m')) + flash(c.req.query('e'), 'err');

async function requireUser(c: Context) {
  const u = await currentUser(c);
  if (!u) return null;
  return u;
}

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const flowerChip = (slug: string) => {
  const f = getFlower(slug);
  return f ? `<a class="chip" href="/flowers/${f.slug}">${f.emoji} ${h(f.name)}</a>` : '';
};

// --- public pages -----------------------------------------------------------------

web.get('/', async (c) => {
  const user = await currentUser(c);
  const today = todayUtc();
  const us = nextMothersDay('US', today);
  const uk = nextMothersDay('UK', today);
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  const featured = ['carnation', 'chrysanthemum', 'peony', 'rose', 'tulip', 'orchid'].map((s) => getFlower(s)!);
  return c.html(
    await layout(
      { title: "mums.flower: flowers for moms", user, canonicalPath: '/' },
      `<section class="hero">
  <p class="eyebrow">Flowers for moms</p>
  <h1>Never miss a day to send mom flowers.</h1>
  <p class="lede">Keep your mom's birthday and Mother's Day in one place, get a reminder in time, learn what each flower says, and send her a bouquet card she can open anywhere.</p>
  <p class="cta"><a class="btn" href="/cards/new">💐 Make a bouquet card</a> <a class="btn ghost" href="${user ? '/app' : '/login'}">${user ? 'My moms' : 'Remember her days'}</a></p>
</section>
<section class="countdown">
  <div class="tile"><span class="big">${days(us)}</span><span>days to Mother's Day (US)</span><small>${h(fmtDate(us))}</small></div>
  <div class="tile"><span class="big">${days(uk)}</span><span>days to Mothering Sunday (UK)</span><small>${h(fmtDate(uk))}</small></div>
</section>
<section>
  <h2>Flowers moms love, and what they say</h2>
  <div class="grid flowers">${featured.map(flowerCard).join('')}</div>
  <p><a href="/flowers">All ${FLOWERS.length} flowers →</a></p>
</section>
<section class="how">
  <h2>How it works</h2>
  <ol>
    <li><b>Add your mom</b> (or grandma, stepmom, mother-in-law): her birthday, her country and the flowers she likes.</li>
    <li><b>Get a reminder</b> by email two weeks and two days before her birthday and Mother's Day.</li>
    <li><b>Send a bouquet card</b>: pick her flowers, write a note, and email it or share the link.</li>
  </ol>
  <p class="muted">Also an <a href="/docs">API, MCP server and CLI</a>, so your assistant can remember for you.</p>
</section>`,
    ),
  );
});

function flowerCard(f: (typeof FLOWERS)[number]) {
  return `<a class="card flower" href="/flowers/${f.slug}"><span class="emoji">${f.emoji}</span><b>${h(f.name)}</b><span>${h(f.meaning)}</span></a>`;
}

web.get('/flowers', async (c) => {
  const user = await currentUser(c);
  return c.html(
    await layout(
      { title: 'What flowers mean: a guide for moms · mums.flower', description: 'What each flower means and which ones suit a mom: carnations, mums, peonies, roses, tulips and more.', user, canonicalPath: '/flowers' },
      `<h1>What flowers mean</h1>
<p class="lede">Meanings follow the Western "language of flowers" tradition; they differ between cultures, so pick what fits your mom.</p>
<div class="grid flowers">${FLOWERS.map(flowerCard).join('')}</div>`,
    ),
  );
});

web.get('/flowers/:slug', async (c) => {
  const f = getFlower(c.req.param('slug'));
  if (!f) return c.notFound();
  const user = await currentUser(c);
  return c.html(
    await layout(
      { title: `${f.name}: meaning and why moms love it · mums.flower`, description: `${f.name}: ${f.meaning} ${f.forMom}`, user, canonicalPath: `/flowers/${f.slug}` },
      `<article class="flower-detail">
  <p class="emoji-xl">${f.emoji}</p>
  <h1>${h(f.name)}</h1>
  <p class="lede">${h(f.meaning)}</p>
  <h2>For mom</h2><p>${h(f.forMom)}</p>
  <dl><dt>Colours</dt><dd>${h(f.colors.join(', '))}</dd><dt>Season</dt><dd>${h(f.season)}</dd><dt>Care</dt><dd>${h(f.care)}</dd></dl>
  <p><a class="btn" href="/cards/new?flower=${f.slug}">Send her ${h(f.name.toLowerCase())}s 💐</a></p>
  <p><a href="/flowers">← All flowers</a></p>
</article>`,
    ),
  );
});

// --- sign in ---------------------------------------------------------------------

web.get('/login', async (c) => {
  if (await currentUser(c)) return c.redirect('/app', 302);
  return c.html(
    await layout(
      { title: 'Sign in · mums.flower', user: null, noindex: true },
      `<section class="narrow">
<h1>Sign in</h1>
${msgs(c)}
<form method="post" action="/login" class="stack">
  <label>Email <input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
  <button class="btn" type="submit">Email me a sign-in link</button>
</form>
<p class="muted">New here? The same link creates your account. No password.</p>
<div class="or"><span>or</span></div>
<button class="btn ghost" type="button" data-passkey-login hidden>🔑 Sign in with a passkey</button>
<p class="muted small" data-passkey-msg></p>
</section>`,
    ),
  );
});

web.post('/login', async (c) => {
  const f = await form(c);
  let email: string;
  try {
    email = cleanEmail(one(f.email), true)!;
  } catch (e) {
    return back(c, '/login', e instanceof Error ? e.message : 'Check the email address', 'err');
  }
  if (rateLimited(`email:${email}`, 5, 15 * 60_000) || rateLimited(`ip:${clientIp(c)}`, 20, 15 * 60_000)) {
    return back(c, '/login', 'Too many sign-in emails. Wait a few minutes and try again.', 'err');
  }
  const { link } = await createLoginLink(publicOrigin(c), email);
  const sent = await sendLoginLink(email, link);
  if (!sent.sent) return back(c, '/login', `We could not send the email (${sent.error || 'unknown error'}). Try again shortly.`, 'err');
  return back(c, '/login', `Check ${email} for your sign-in link. It works once, for 20 minutes.`);
});

web.get('/auth/verify', async (c) => {
  const user = await redeemLoginToken(c.req.query('token') || '');
  if (!user) return back(c, '/login', 'That link has expired or was already used. Send a new one.', 'err');
  await createSession(c, user.id);
  return c.redirect('/app?m=' + encodeURIComponent("You're signed in. Add a passkey in Account to skip the email next time."), 303);
});

web.post('/logout', async (c) => {
  await endSession(c);
  return c.redirect('/', 303);
});

// --- dashboard: moms -----------------------------------------------------------

const countryOpts = (sel: string) => ['US', 'UK'].map((x) => `<option value="${x}"${x === sel ? ' selected' : ''}>${x === 'US' ? "US (May Mother's Day)" : 'UK (Mothering Sunday)'}</option>`).join('');

const flowerChecks = (selected: string[], name = 'flowers') =>
  `<div class="checks">${FLOWERS.map((f) => `<label class="check"><input type="checkbox" name="${name}" value="${f.slug}"${selected.includes(f.slug) ? ' checked' : ''}> ${f.emoji} ${h(f.name)}</label>`).join('')}</div>`;

const momForm = (m: Partial<Mom> & { favoriteFlowers?: string[] }, action: string, submit: string) => `<form method="post" action="${action}" class="stack">
  <div class="row">
    <label>Name <input name="name" required maxlength="80" value="${h(m.name)}" placeholder="Mom"></label>
    <label>Who is she? <input name="relationship" maxlength="40" value="${h(m.relationship ?? 'Mom')}" placeholder="Mom, Grandma, Mother-in-law"></label>
  </div>
  <div class="row">
    <label>Birthday <input type="date" name="birthday_date" value="${m.birthday ? `2000-${h(m.birthday)}` : ''}"><small>The year is not kept.</small></label>
    <label>Country <select name="country">${countryOpts(m.country ?? 'US')}</select></label>
  </div>
  <label>Her email (optional, to send her cards) <input type="email" name="email" maxlength="254" value="${h(m.email)}"></label>
  <fieldset><legend>Flowers she likes</legend>${flowerChecks(m.favoriteFlowers ?? [], 'favoriteFlowers')}</fieldset>
  <label>Notes <textarea name="notes" maxlength="500" rows="2" placeholder="Allergic to lilies; loves yellow">${h(m.notes)}</textarea></label>
  <button class="btn" type="submit">${h(submit)}</button>
</form>`;

function momInput(f: Record<string, string | string[]>) {
  const date = one(f.birthday_date);
  return {
    name: one(f.name),
    relationship: one(f.relationship),
    birthday: date ? date.slice(5) : '',
    country: one(f.country) || 'US',
    email: one(f.email),
    notes: one(f.notes),
    favoriteFlowers: many(f.favoriteFlowers),
  };
}

web.get('/app', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  const [moms, next, cards] = await Promise.all([listMoms(user.id), upcoming(user.id), listCards(user.id)]);
  return c.html(
    await layout(
      { title: 'My moms · mums.flower', user, noindex: true },
      `${msgs(c)}
<h1>My moms</h1>
<section>
  <h2>Coming up</h2>
  ${
    next.length
      ? `<ul class="upcoming">${next
          .slice(0, 8)
          .map(
            (u) => `<li><span class="when">${u.daysAway === 0 ? '<b>Today</b>' : `in <b>${u.daysAway}</b> days`}</span>
  <span><b>${h(u.label)}</b>${u.kind === 'mothers-day' ? ` for ${h(u.momName)}` : ''} · ${h(fmtDate(u.date))}</span>
  <span>${u.suggestion.map((s) => `${s.emoji} ${h(s.name)}`).join(', ')}</span>
  <a class="btn small" href="/cards/new?mom=${h(u.momId)}">Card</a></li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">Add a mom below and her days show up here.</p>'
  }
</section>
<section>
  <h2>Your moms</h2>
  ${
    moms.length
      ? `<ul class="moms">${moms
          .map(
            (m) => `<li><b>${h(m.name)}</b> <span class="muted">${h(m.relationship)}${m.birthday ? ` · birthday ${h(m.birthday)}` : ''} · ${m.country}</span>
  <span>${m.favoriteFlowers.map(flowerChip).join(' ')}</span>
  <a href="/moms/${h(m.id)}">Edit</a></li>`,
          )
          .join('')}</ul>`
      : ''
  }
  <details${moms.length ? '' : ' open'}><summary class="btn ghost">＋ Add a mom</summary>${momForm({}, '/moms', 'Save')}</details>
</section>
<section>
  <h2>Your cards</h2>
  ${cards.length ? `<ul class="cards-list">${cards.slice(0, 20).map((k) => `<li><a href="/c/${h(k.id)}">To ${h(k.toName)}</a> <span class="muted">${new Date(k.createdAt).toISOString().slice(0, 10)}${k.sentAt ? ' · sent' : ''}${k.premium ? ' · premium' : ''}</span></li>`).join('')}</ul>` : '<p class="muted">No cards yet. <a href="/cards/new">Make one</a>.</p>'}
</section>`,
    ),
  );
});

web.post('/moms', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  try {
    const m = await addMom(user.id, momInput(await form(c)));
    return back(c, '/app', `Saved ${m.name}.`);
  } catch (e) {
    return back(c, '/app', e instanceof Error ? e.message : 'Could not save', 'err');
  }
});

web.get('/moms/:id', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  let m: Mom;
  try {
    m = await getMom(user.id, c.req.param('id'));
  } catch {
    return c.notFound();
  }
  return c.html(
    await layout(
      { title: `${m.name} · mums.flower`, user, noindex: true },
      `<section class="narrow">${msgs(c)}<h1>${h(m.name)}</h1>${momForm(m, `/moms/${m.id}`, 'Save changes')}
<form method="post" action="/moms/${h(m.id)}/delete" onsubmit="return confirm('Remove her from your moms?')"><button class="btn danger small" type="submit">Remove</button></form>
<p><a href="/app">← My moms</a></p></section>`,
    ),
  );
});

web.post('/moms/:id', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  try {
    await updateMom(user.id, c.req.param('id'), momInput(await form(c)));
    return back(c, '/app', 'Saved.');
  } catch (e) {
    return back(c, `/moms/${encodeURIComponent(c.req.param('id'))}`, e instanceof Error ? e.message : 'Could not save', 'err');
  }
});

web.post('/moms/:id/delete', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  try {
    await deleteMom(user.id, c.req.param('id'));
    return back(c, '/app', 'Removed.');
  } catch (e) {
    return back(c, '/app', e instanceof Error ? e.message : 'Could not remove', 'err');
  }
});

// --- cards -----------------------------------------------------------------------

web.get('/cards/new', async (c) => {
  const user = await currentUser(c);
  const moms = user ? await listMoms(user.id) : [];
  const momId = c.req.query('mom') || '';
  const mom = moms.find((m) => m.id === momId);
  const pre = mom?.favoriteFlowers.length ? mom.favoriteFlowers : c.req.query('flower') ? [c.req.query('flower')!] : [];
  const themes = [...THEMES, ...PREMIUM_THEMES];
  return c.html(
    await layout(
      { title: 'Make a bouquet card · mums.flower', description: 'Pick her flowers, write a note, and send mom a bouquet card.', user, canonicalPath: '/cards/new' },
      `<section class="narrow">${msgs(c)}
<h1>💐 Make a bouquet card</h1>
<form method="post" action="/cards" class="stack">
  ${
    moms.length
      ? `<label>For <select name="momId"><option value="">Someone else (type a name)</option>${moms.map((m) => `<option value="${h(m.id)}"${m.id === momId ? ' selected' : ''}>${h(m.name)}</option>`).join('')}</select></label>`
      : ''
  }
  <div class="row">
    <label>To <input name="toName" maxlength="60" placeholder="Mom" value="${h(mom?.name ?? '')}"></label>
    <label>From <input name="fromName" required maxlength="60" placeholder="Your name"></label>
  </div>
  <label>Your note <textarea name="message" required maxlength="1000" rows="5" placeholder="Happy Mother's Day! Thank you for everything."></textarea></label>
  <fieldset><legend>Her bouquet</legend>${flowerChecks(pre)}</fieldset>
  <fieldset><legend>Look</legend><div class="themes">${themes
    .map((t, i) => `<label class="theme t-${t}"><input type="radio" name="theme" value="${t}"${i === 0 ? ' checked' : ''}> ${t}${(PREMIUM_THEMES as readonly string[]).includes(t) ? ` <small>$${PREMIUM_PRICE_USD}</small>` : ''}</label>`)
    .join('')}</div></fieldset>
  <button class="btn" type="submit">Make the card</button>
  ${user ? '' : '<p class="muted small">No account needed to make a card. <a href="/login">Sign in</a> to email it to her and keep it.</p>'}
</form></section>`,
    ),
  );
});

web.post('/cards', async (c) => {
  const user = await currentUser(c);
  const f = await form(c);
  if (!user && rateLimited(`card:${clientIp(c)}`, 30, 3600_000)) return back(c, '/cards/new', 'Too many cards from here; try again later.', 'err');
  try {
    const card = await createCard(user?.id ?? null, {
      momId: one(f.momId) || undefined,
      toName: one(f.toName),
      fromName: one(f.fromName),
      message: one(f.message),
      flowers: many(f.flowers),
      theme: one(f.theme) || 'blush',
    });
    return c.redirect(`/c/${card.id}?new=1`, 303);
  } catch (e) {
    return back(c, '/cards/new', e instanceof Error ? e.message : 'Could not make the card', 'err');
  }
});

function cardView(card: Card) {
  const flowers = card.flowers.map((s) => getFlower(s)).filter(Boolean);
  return `<article class="bouquet theme-${h(displayTheme(card))}">
  <div class="blooms" aria-hidden="true">${flowers.map((f, i) => `<span style="--i:${i}">${f!.emoji}</span>`).join('')}</div>
  <h1>For ${h(card.toName)}</h1>
  <p class="note">${h(card.message)}</p>
  <p class="sig">With love, ${h(card.fromName)}</p>
  <ul class="meanings">${flowers.map((f) => `<li>${f!.emoji} <b>${h(f!.name)}</b>: ${h(f!.meaning)}</li>`).join('')}</ul>
</article>`;
}

web.get('/c/:id', async (c) => {
  const card = await getCard(c.req.param('id'));
  if (!card) return c.notFound();
  const user = await currentUser(c);
  const own = !!user && (await listCards(user.id)).some((k) => k.id === card.id);
  const premiumPending = (PREMIUM_THEMES as readonly string[]).includes(card.theme) && !card.premium;
  const ownerTools = own
    ? `<section class="narrow owner">
  ${c.req.query('new') ? '<p class="flash ok">Your card is ready. Send it or share the link.</p>' : ''}
  ${c.req.query('paid') ? `<p class="flash ok">${card.premium ? 'Thank you! Premium is on.' : 'Payment received by CoinPay; premium turns on as soon as it confirms (refresh in a minute).'}</p>` : ''}
  ${msgs(c)}
  <form method="post" action="/c/${h(card.id)}/send" class="row">
    <label>Email it to <input type="email" name="to" required placeholder="mom@example.com"></label>
    <button class="btn" type="submit">Send ✉️</button>
  </form>
  ${card.sentAt ? `<p class="muted small">Sent to ${h(card.sentTo)} on ${new Date(card.sentAt).toISOString().slice(0, 10)}.</p>` : ''}
  ${
    premiumPending
      ? paymentsConfigured()
        ? `<form method="post" action="/c/${h(card.id)}/premium"><button class="btn gold" type="submit">Unlock the ${h(card.theme)} look · $${PREMIUM_PRICE_USD} (crypto or PayPal via CoinPay)</button></form>`
        : '<p class="muted small">Premium looks are coming soon; this card shows the blush look for now.</p>'
      : ''
  }
</section>`
    : c.req.query('new')
      ? `<section class="narrow"><p class="flash ok">Your card is ready: copy the link below and send it to her. <a href="/login">Sign in</a> next time to email it and keep your cards.</p></section>`
      : '';
  return c.html(
    await layout(
      { title: `Flowers for ${card.toName} · mums.flower`, description: `${card.fromName} sent ${card.toName} a bouquet.`, user, noindex: true, bodyClass: 'card-page' },
      `${ownerTools}${cardView(card)}
<p class="share"><button class="btn ghost small" type="button" data-copy="${h(card.url)}">Copy link</button> <a class="btn ghost small" href="/cards/new">Make your own</a></p>`,
    ),
  );
});

web.post('/c/:id/send', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  const id = c.req.param('id');
  const card = await getCard(id);
  if (!card || !(await listCards(user.id)).some((k) => k.id === id)) return c.notFound();
  const f = await form(c);
  let to: string;
  try {
    to = cleanEmail(one(f.to), true)!;
  } catch (e) {
    return back(c, `/c/${id}`, e instanceof Error ? e.message : 'Check the address', 'err');
  }
  if (rateLimited(`send:${user.id}`, 20, 86_400_000)) return back(c, `/c/${id}`, 'You have sent a lot of cards today; try again tomorrow.', 'err');
  const r = await sendCard(to, card, user.email);
  if (!r.sent) return back(c, `/c/${id}`, `Not sent: ${r.error || 'unknown error'}`, 'err');
  await markCardSent(id, to);
  return back(c, `/c/${id}`, `Sent to ${to}. 💐`);
});

web.post('/c/:id/premium', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  try {
    const { checkoutUrl } = await startPremiumCheckout(user, c.req.param('id'), publicOrigin(c));
    return c.redirect(checkoutUrl, 303);
  } catch (e) {
    return back(c, `/c/${encodeURIComponent(c.req.param('id'))}`, e instanceof UserError ? e.message : 'Could not start checkout', 'err');
  }
});

// --- account -----------------------------------------------------------------------

web.get('/account', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  const [keys, passkeys] = await Promise.all([listApiKeys(user.id), listPasskeys(user.id)]);
  const newKey = c.req.query('key');
  return c.html(
    await layout(
      { title: 'Account · mums.flower', user, noindex: true },
      `<section class="narrow">${msgs(c)}
<h1>Account</h1>
<p>Signed in as <b>${h(user.email)}</b>.</p>
<h2>Passkeys</h2>
<p class="muted small">Sign in with your fingerprint, face or device PIN instead of an email link.</p>
${passkeys.length ? `<ul>${passkeys.map((p) => `<li>${h(p.rp_id)} · added ${new Date(Number(p.created_at)).toISOString().slice(0, 10)} <form class="inline" method="post" action="/account/passkeys/${encodeURIComponent(p.id)}/delete"><button class="link" type="submit">remove</button></form></li>`).join('')}</ul>` : ''}
<button class="btn ghost" type="button" data-passkey-register>🔑 Add a passkey</button>
<p class="muted small" data-passkey-msg></p>
<h2>API keys</h2>
<p class="muted small">For the <code>mums</code> CLI and MCP clients. See <a href="/docs">the docs</a>.</p>
${newKey ? `<p class="flash ok">Your new key (shown once): <code class="key">${h(newKey)}</code></p>` : ''}
${keys.length ? `<ul>${keys.map((k) => `<li>${h(k.label)} · ${k.last_used_at ? `used ${new Date(Number(k.last_used_at)).toISOString().slice(0, 10)}` : 'never used'} <form class="inline" method="post" action="/account/keys/${h(k.id)}/delete"><button class="link" type="submit">delete</button></form></li>`).join('')}</ul>` : ''}
<form method="post" action="/account/keys" class="row"><label>Label <input name="label" maxlength="60" placeholder="My laptop"></label><button class="btn small" type="submit">Create key</button></form>
<h2>Sign out</h2>
<form method="post" action="/logout"><button class="btn ghost small" type="submit">Sign out</button></form>
</section>`,
    ),
  );
});

web.post('/account/keys', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  try {
    const { key } = await createApiKey(user.id, one((await form(c)).label));
    return c.redirect(`/account?key=${encodeURIComponent(key)}`, 303);
  } catch (e) {
    return back(c, '/account', e instanceof Error ? e.message : 'Could not create the key', 'err');
  }
});

web.post('/account/keys/:id/delete', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  await deleteApiKey(user.id, c.req.param('id')).catch(() => undefined);
  return back(c, '/account', 'Key deleted.');
});

web.post('/account/passkeys/:id/delete', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.redirect('/login', 302);
  await deletePasskey(user.id, c.req.param('id')).catch(() => undefined);
  return back(c, '/account', 'Passkey removed.');
});
