import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Context } from 'hono';
import { z } from 'zod';
import { currentUser, rateLimited } from './auth.ts';
import { FLOWERS, getFlower } from './flowers.ts';
import { sendCard } from './mail.ts';
import { mothersDay, nextMothersDay, todayUtc } from './occasions.ts';
import { addMom, cleanEmail, createCard, getOwnCard, listMoms, markCardSent, updateMom, upcoming, UserError } from './service.ts';

/**
 * MCP over streamable HTTP at /mcp (stateless, JSON responses). Public tools
 * work for anyone; tools about your moms and cards need
 * `Authorization: Bearer <API key from /account>`.
 */
const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (msg: string) => ({ isError: true, content: [{ type: 'text' as const, text: msg }] });

export function buildMcpServer(user: { id: string; email: string } | null): McpServer {
  const server = new McpServer(
    { name: 'mums.flower', version: '0.1.0' },
    {
      instructions:
        "mums.flower remembers moms' birthdays and Mother's Day and makes bouquet cards. Use list_flowers / flower_meaning for flower meanings, mothers_day for dates. With an API key: list_moms, add_mom, update_mom, upcoming, create_card, send_card.",
    },
  );

  const signedIn = async <T>(fn: (u: { id: string; email: string }) => Promise<T>) => {
    if (!user) return fail('Needs an API key: create one at https://mums.flower.pit.world/account and send Authorization: Bearer <key>.');
    try {
      return text(await fn(user));
    } catch (e) {
      return fail(e instanceof UserError ? e.message : 'Something went wrong');
    }
  };

  server.registerTool('list_flowers', { description: 'Every flower in the guide with its meaning and why moms love it.', inputSchema: {} }, async () =>
    text(FLOWERS.map((f) => ({ slug: f.slug, name: f.name, meaning: f.meaning, forMom: f.forMom }))),
  );

  server.registerTool(
    'flower_meaning',
    { description: 'What one flower means, colours, season and care.', inputSchema: { slug: z.string().describe('e.g. carnation, peony, chrysanthemum') } },
    async ({ slug }) => {
      const f = getFlower(String(slug).toLowerCase());
      return f ? text(f) : fail(`Unknown flower. Try one of: ${FLOWERS.map((x) => x.slug).join(', ')}`);
    },
  );

  server.registerTool(
    'mothers_day',
    {
      description: "The date of Mother's Day: US (second Sunday of May) or UK (Mothering Sunday, three weeks before Easter). Without a year: the next one.",
      inputSchema: { country: z.enum(['US', 'UK']).optional(), year: z.number().int().min(1900).max(2200).optional() },
    },
    async ({ country, year }) => {
      const cc = country ?? 'US';
      return text({ country: cc, date: year ? mothersDay(year, cc) : nextMothersDay(cc, todayUtc()) });
    },
  );

  server.registerTool('list_moms', { description: 'Your moms (name, birthday MM-DD, country, favourite flowers).', inputSchema: {} }, async () =>
    signedIn((u) => listMoms(u.id)),
  );

  const momShape = {
    name: z.string().max(80),
    relationship: z.string().max(40).optional().describe('Mom, Grandma, Mother-in-law…'),
    birthday: z.string().optional().describe('MM-DD or YYYY-MM-DD (the year is not kept)'),
    country: z.enum(['US', 'UK']).optional().describe("Which Mother's Day she gets"),
    favoriteFlowers: z.array(z.string()).optional().describe('flower slugs from list_flowers'),
    email: z.string().optional().describe('her email, to send her cards'),
    notes: z.string().max(500).optional(),
  };

  server.registerTool('add_mom', { description: 'Remember a mom.', inputSchema: momShape }, async (args) => signedIn((u) => addMom(u.id, args)));

  server.registerTool(
    'update_mom',
    { description: 'Change a mom you saved (only the fields you pass).', inputSchema: { id: z.string(), ...Object.fromEntries(Object.entries(momShape).map(([k, v]) => [k, v.optional()])) } },
    async ({ id, ...rest }) => signedIn((u) => updateMom(u.id, String(id), rest as Record<string, unknown>)),
  );

  server.registerTool(
    'upcoming',
    { description: "Your moms' next birthdays and Mother's Days, soonest first, with flower ideas.", inputSchema: { days: z.number().int().min(1).max(400).optional() } },
    async ({ days }) => signedIn((u) => upcoming(u.id, todayUtc(), days ?? 60)),
  );

  server.registerTool(
    'create_card',
    {
      description: 'Make a bouquet card. Returns its shareable URL.',
      inputSchema: {
        fromName: z.string().max(60),
        message: z.string().max(1000),
        toName: z.string().max(60).optional(),
        momId: z.string().optional().describe('use her saved name and favourite flowers'),
        flowers: z.array(z.string()).optional().describe('flower slugs'),
        theme: z.enum(['blush', 'meadow', 'sunrise', 'lavender', 'midnight']).optional(),
      },
    },
    async (args) => signedIn((u) => createCard(u.id, args)),
  );

  server.registerTool(
    'send_card',
    { description: 'Email one of your cards (to her, usually).', inputSchema: { cardId: z.string(), to: z.string() } },
    async ({ cardId, to }) =>
      signedIn(async (u) => {
        const card = await getOwnCard(u.id, String(cardId));
        const email = cleanEmail(to, true)!;
        if (rateLimited(`send:${u.id}`, 20, 86_400_000)) throw new UserError('Daily send limit reached');
        const r = await sendCard(email, card, u.email);
        if (!r.sent) throw new UserError(`Not sent: ${r.error || 'unknown error'}`);
        await markCardSent(card.id, email);
        return { ok: true, sentTo: email, url: card.url };
      }),
  );

  return server;
}

export async function handleMcp(c: Context): Promise<Response> {
  const user = await currentUser(c);
  const server = buildMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    void server.close();
  }
}
