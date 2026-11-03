import { createEmailer, escapeHtml } from '@profullstack/stack/email';
import { getFlower } from './flowers.ts';
import type { Card, Upcoming } from './service.ts';

/**
 * Outgoing mail via Resend (pit.world is a verified sending domain). Without
 * RESEND_API_KEY nothing is sent: the message is logged (dev and tests) and the
 * caller is told it was not delivered.
 */
const FROM = () => process.env.MUMS_MAIL_FROM || 'mums.flower <noreply@pit.world>';

export interface Sent {
  sent: boolean;
  error?: string;
}

export type MailSender = (msg: { to: string; subject: string; html: string; text: string; replyTo?: string }) => Promise<Sent>;

let sender: MailSender | null = null;

/** Tests swap the transport. */
export function setMailSender(s: MailSender | null): void {
  sender = s;
}

async function send(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<Sent> {
  if (sender) return sender(msg);
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] (not sent: no RESEND_API_KEY) to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
    return { sent: false, error: 'email is not configured' };
  }
  const r = await createEmailer({ resendApiKey: key, defaultFrom: FROM() }).send({ ...msg, from: FROM() });
  return { sent: r.sent, error: r.error };
}

const shell = (body: string) => `<!doctype html><html><body style="margin:0;background:#fff7f9;font-family:Georgia,serif;color:#3b2a30">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">${body}
<p style="margin-top:32px;font:12px/1.5 system-ui,sans-serif;color:#9b7f88">mums.flower · flowers for moms · <a href="https://mums.flower.pit.world" style="color:#b0476b">mums.flower.pit.world</a></p>
</div></body></html>`;

export function sendLoginLink(to: string, link: string): Promise<Sent> {
  return send({
    to,
    subject: 'Your mums.flower sign-in link',
    text: `Sign in to mums.flower (link works once, for 20 minutes):\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
    html: shell(`<h1 style="font-weight:normal">🌷 Sign in to mums.flower</h1>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#b0476b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-family:system-ui,sans-serif">Sign in</a></p>
<p style="font:14px/1.5 system-ui,sans-serif">The link works once, for 20 minutes. If you did not ask for it, ignore this email.</p>`),
  });
}

export function sendCard(to: string, card: Card, replyTo?: string): Promise<Sent> {
  const flowers = card.flowers.map((s) => getFlower(s)).filter(Boolean);
  const bouquet = flowers.map((f) => f!.emoji).join(' ');
  return send({
    to,
    replyTo,
    subject: `${card.fromName} sent you flowers 💐`,
    text: `${card.toName},\n\n${card.message}\n\nLove, ${card.fromName}\n\n${bouquet}\nSee your bouquet: ${card.url}`,
    html: shell(`<p style="font-size:40px;text-align:center;margin:0">${escapeHtml(bouquet)}</p>
<h1 style="font-weight:normal;text-align:center">${escapeHtml(card.toName)}, ${escapeHtml(card.fromName)} sent you flowers</h1>
<p style="white-space:pre-wrap;font-size:18px;line-height:1.6">${escapeHtml(card.message)}</p>
<p style="text-align:center"><a href="${escapeHtml(card.url)}" style="display:inline-block;background:#b0476b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-family:system-ui,sans-serif">Open your bouquet</a></p>
<p style="font:13px/1.5 system-ui,sans-serif;color:#7a5a64">${flowers.map((f) => `${f!.emoji} <b>${escapeHtml(f!.name)}</b>: ${escapeHtml(f!.meaning)}`).join('<br>')}</p>`),
  });
}

export function sendReminder(to: string, items: Upcoming[], origin: string): Promise<Sent> {
  const lines = items.map((u) => `${u.label} on ${u.date} (${u.daysAway === 0 ? 'today' : `in ${u.daysAway} days`}): try ${u.suggestion.map((s) => s.name).join(', ')}`);
  return send({
    to,
    subject: items.length === 1 ? `Coming up: ${items[0].label}` : `Coming up: ${items.length} days to send mom flowers`,
    text: `${lines.join('\n')}\n\nMake her a bouquet card: ${origin}/cards/new`,
    html: shell(`<h1 style="font-weight:normal">🌸 Coming up</h1>
<ul style="font:16px/1.7 system-ui,sans-serif">${items
      .map(
        (u) =>
          `<li><b>${escapeHtml(u.label)}</b>, ${escapeHtml(u.date)} (${u.daysAway === 0 ? 'today' : `in ${u.daysAway} days`}). Try ${u.suggestion.map((s) => `${s.emoji} ${escapeHtml(s.name)}`).join(', ')}.</li>`,
      )
      .join('')}</ul>
<p><a href="${escapeHtml(origin)}/cards/new" style="display:inline-block;background:#b0476b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-family:system-ui,sans-serif">Make her a bouquet card</a></p>`),
  });
}
