# Coinfall

A free-to-play casino with fake coins only. Coins can't be bought, sold or cashed out.

- `public/index.html` is the whole website page.
- `src/casino.js` is the game server: accounts, coins, every game, rain, levels and admin tools.
- `src/worker.js` connects them on Cloudflare. Players live in one Durable Object named Casino.
- `wrangler.jsonc` tells Cloudflare how to run it.

Deploys automatically from GitHub through Cloudflare Workers Builds. The first account made on the site becomes the owner and admin.
