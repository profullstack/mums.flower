import { createCoinPayClient, verifyAndReadCoinPayWebhook } from '@profullstack/stack/coinpay';
import { one, run } from './db.ts';
import { getOwnCard, markCardPremium, PREMIUM_PRICE_USD, UserError, type Card } from './service.ts';

/**
 * Premium cards (gold and watercolour themes) through CoinPay: crypto or
 * PayPal on CoinPay's hosted checkout. No cards, no Stripe.
 */
export function paymentsConfigured(): boolean {
  return !!process.env.COINPAYPORTAL_API_KEY;
}

export async function startPremiumCheckout(user: { id: string; email: string }, cardId: string, origin: string): Promise<{ checkoutUrl: string; sessionId: string }> {
  if (!paymentsConfigured()) throw new UserError('Payments are not set up yet', 503);
  const card: Card = await getOwnCard(user.id, cardId);
  if (card.premium) throw new UserError('This card is already premium');
  const client = createCoinPayClient({ apiKey: process.env.COINPAYPORTAL_API_KEY! });
  const { sessionId, checkoutUrl } = await client.createCheckout({
    amountUsd: PREMIUM_PRICE_USD,
    customerEmail: user.email,
    accountId: user.id,
    property: 'mums.flower.pit.world',
    description: `Premium bouquet card for ${card.toName}`,
    metadata: { card_id: card.id, user_id: user.id },
    successUrl: `${origin}/c/${card.id}?paid=1`,
    cancelUrl: `${origin}/c/${card.id}`,
    expiresInMinutes: 60,
  });
  await run('insert or replace into payments (session_id, card_id, user_id, status, amount_usd, created_at) values (?,?,?,?,?,?)', [
    sessionId,
    card.id,
    user.id,
    'pending',
    PREMIUM_PRICE_USD,
    Date.now(),
  ]);
  return { checkoutUrl, sessionId };
}

/** CoinPay webhook: verify the signature over the raw body, then fulfil once. */
export async function handleCoinPayWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const secret = process.env.COINPAYPORTAL_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: 'webhook_unconfigured' } };
  const hook = verifyAndReadCoinPayWebhook({ rawBody, signature, secret });
  if (!hook) return { status: 401, body: { error: 'invalid_signature' } };
  if (!hook.paid) return { status: 200, body: { ok: true, ignored: true } };
  const meta = (hook.metadata ?? {}) as Record<string, unknown>;
  const cardId = typeof meta.card_id === 'string' ? meta.card_id : null;
  const sessionId = hook.checkoutSessionId ?? null;
  const pay = sessionId ? await one<{ card_id: string; status: string }>('select card_id, status from payments where session_id = ?', [sessionId]) : null;
  const target = pay?.card_id ?? cardId;
  if (!target) return { status: 200, body: { ok: true, ignored: 'no card' } };
  if (pay && pay.card_id !== cardId && cardId) return { status: 400, body: { error: 'card mismatch' } };
  if (Number(hook.amountUsd ?? 0) + 0.01 < PREMIUM_PRICE_USD) return { status: 400, body: { error: 'underpaid' } };
  await markCardPremium(target);
  if (sessionId) await run("update payments set status = 'paid', paid_at = ? where session_id = ?", [Date.now(), sessionId]);
  console.log(`[payments] card ${target} premium (session ${sessionId}, ${hook.rail}, $${hook.amountUsd})`);
  return { status: 200, body: { ok: true } };
}
