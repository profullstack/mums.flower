# mums.flower

Flowers for moms. Remember your mom's birthday and Mother's Day (US: second Sunday of May; UK: Mothering
Sunday, three weeks before Easter), get an email two weeks and two days ahead, learn what flowers mean, and
send her a bouquet card she can open anywhere.

- Web + PWA: https://mums.flower.pit.world (Moshpit name `mums.flower`)
- API: `/api/v1` · MCP: `/mcp` (streamable HTTP) · CLI: [`npx mums.flower`](cli/) (also an MCP stdio bridge)
- Docs: https://mums.flower.pit.world/docs · `llms.txt`

## Stack

Hono on Node 24 (TypeScript run directly), libSQL (Turso-compatible; a file on the box), magic link + passkeys
(`@simplewebauthn`), Resend mail from `noreply@pit.world` via `@profullstack/stack/email`, CoinPay checkout for
premium card looks via `@profullstack/stack/coinpay`, `@profullstack/footer` webring row plus the pit.world footer.

## Run

```sh
pnpm install
pnpm test
MUMS_DB_URL=file:mums.db node src/server.ts   # http://127.0.0.1:8811
```

Environment (production values live in the logicsrc team vault `profullstack/mums-flower--prod`):

| Variable | Purpose |
| --- | --- |
| `MUMS_DB_URL` | libSQL URL, e.g. `file:/data/mums.db` |
| `MUMS_HOSTS` | hosts served (default `mums.flower.pit.world,mums.flower,...`) |
| `MUMS_PUBLIC_URL` | canonical URL in links (default `https://mums.flower.pit.world`) |
| `RESEND_API_KEY` | mail; without it mail is logged, not sent |
| `COINPAYPORTAL_API_KEY`, `COINPAYPORTAL_WEBHOOK_SECRET` | premium card checkout |
| `PORT`, `HOST` | listen address (default `127.0.0.1:8811`) |

## Deploy

dev3: `deploy/deploy.sh` (rsync to `/opt/mums.flower`, systemd `mums-flower` running `node:24-alpine` in Docker,
nginx in front of the Moshpit origin; `mums.flower.pit.world` arrives through the pit.world relay).

MIT
