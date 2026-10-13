COINFALL - free-to-play casino with fake coins only (no real money)

THE MULTIPLAYER WEBSITE (upload these two to GitHub, then connect Cloudflare):
  worker.js       The whole game: the website page, all 24 games, cases, battles,
                  chat, rain, levels, streaks, seasons, codes, invites and admin.
  wrangler.jsonc  Tells Cloudflare how to run worker.js. Keep "name" as coinfall.

PLAY WITHOUT A SERVER:
  coinfall-offline.html   The same game with bot players. Open it in any browser,
                          or drag it into Cloudflare Pages. Coins save on that device.

Setup:
  1. github.com > New repository "coinfall" > "uploading an existing file"
     > add worker.js and wrangler.jsonc > Commit changes.
  2. dash.cloudflare.com > Workers & Pages > Create application > Import a repository
     > pick coinfall > keep the name coinfall > Save and Deploy.
  3. Open your link and sign up first. The first account is the owner (admin).

To update: upload the new worker.js to GitHub over the old one.
