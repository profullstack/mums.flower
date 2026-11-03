# mums.flower CLI

Flowers for moms, from your terminal: remember her birthday and Mother's Day, look up what flowers mean, and send her a bouquet card. Also an MCP bridge for desktop assistants.

```sh
npx mums.flower flowers peony
npx mums.flower mothers-day --country UK
npx mums.flower login                       # API key from https://mums.flower.pit.world/account
npx mums.flower moms add "Mom" --birthday 05-14 --flowers peony,carnation
npx mums.flower upcoming
npx mums.flower card --to Mom --from Sam --message "Love you!" --flowers peony,tulip
npx mums.flower send <card-id> mom@example.com
```

MCP over stdio (Claude Desktop and others):

```json
{ "mcpServers": { "mums.flower": { "command": "npx", "args": ["-y", "mums.flower", "mcp"], "env": { "MUMS_API_KEY": "mf_..." } } } }
```

Web: https://mums.flower.pit.world (Moshpit name `mums.flower`). MIT.
