# Coinfall

A free-to-play multiplayer casino that uses fake coins only. Players earn coins by being online and spend them on 19 games, 120 cases and case battles. The live tables and battles are shared, so everyone online plays together.

- **Live tables:** Roulette, Blackjack (6 seats), Crash, Jackpot, Coinflip (player vs player or vs the house)
- **Solo games:** Mines, Towers, Plinko, Dice, Limbo, Keno, Hi-Lo, Wheel, Slots, Baccarat, Video Poker, Diamonds, Pump, Upgrader
- **Coins:** 100 when you sign up, +20 every hour you're online, +100 daily bonus, and a rain pot every 30 minutes (0.2% of every bet goes into the rain, up to 1,000 coins, so it never grows out of control). The admin can change all of these numbers on the Admin page
- **Levels:** XP is coins wagered, and leveling is very hard on purpose (level 10 takes 546,750 coins of bets, level 100 takes 727 million)
- **Rakeback:** 0.25% of every bet back at level 1, plus 0.05% per level (0.30%, 0.35%, 0.40%…)
- **Cases:** 100 cases from 0.25 to 25,000 coins, 20 high roller cases from 30,000 to 1,000,000 coins, and 12 free cases you open once an hour that unlock as you level up. Every case has its own crate art (basic, steel, gold and black-and-gold high roller)
- **Case battles:** 1v1, 1v1v1, 1v1v1v1 and 2v2 with up to 50 cases each, and a cursed mode where the lowest total wins. Call in bots if nobody joins. Long battles spin faster (about 2 minutes for 50 cases)
- **Chat + tips:** a live chat where you can tip friends coins (tap a name, or type `/tip name amount`). Rude words are masked, links are removed, and there's a slow mode. Anyone can hide a player's messages, and the admin can delete messages and mute players. New accounts must bet 100 coins in total before they can send tips (change `TIP_MIN_WAGERED` in `public/shared.js`).
- **Leaderboards:** most won, richest, biggest single win, highest level, most wagered
- **Sound effects** for every game, with a mute button in the top bar

---

## Put it online for free (about 10 minutes)

You need two free accounts: **GitHub** (holds the code) and **Cloudflare** (runs the site). Your site will get its own address, like `https://coinfall.yourname.workers.dev`, that you can send to anyone.

### 1. Put the code on GitHub
1. Unzip `coinfall-files.zip`.
2. Go to **github.com**, sign in, and click **New repository**. Name it `coinfall` and click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Open the unzipped folder, select **everything inside it** (the `public`, `src`, `dev`, `artifact` and `test` folders plus `wrangler.jsonc`, `package.json` and this README) and drag it into the GitHub page. `wrangler.jsonc` must end up at the top of the repository, not inside another folder. Use Chrome or Edge so the folders upload too.
5. Click **Commit changes**.

### 2. Run it on Cloudflare
1. Go to **dash.cloudflare.com** and sign up (free).
2. In the left menu, open **Compute (Workers)** → **Workers & Pages**, then click **Create application**.
3. Choose **Import a repository**, connect your GitHub account, and pick `coinfall`.
4. Leave the project name as **coinfall**. It has to match the `name` in `wrangler.jsonc`.
5. Leave the deploy command as `npx wrangler deploy` and click **Deploy**.
6. When it finishes, Cloudflare shows your link (`https://coinfall.<something>.workers.dev`). That's your site.

### 3. Become the admin
Open your site **before you share it** and sign up. **The first account ever made becomes the owner.** The **Admin** page lets you:
- **Players:** give, take or set coins, rename, mute (10 minutes, 1 hour or 1 day), log someone out, ban, and reset someone's level and stats
- **More admins:** the owner can make other players admins (and remove them). Admins can't touch the owner or each other
- **Site tools:** post an announcement banner, give coins to everyone (or everyone online), add coins to the rain or make it rain now, clear the chat
- **Settings:** hourly coins, daily bonus, new account coins, rain size and limit, chat slow mode, tips on or off, chat on or off. Changes apply instantly
- **Reset everyone's coins** to one amount (optionally levels and leaderboards too). You have to type RESET to confirm
- **Admin log:** every admin action is listed with who did it

### Changing things later
Edit a file on GitHub and commit it. Cloudflare redeploys by itself in about a minute. Player accounts and coins are kept. Any bet that's in the middle of a round when the site restarts is refunded automatically.

If a yellow bar says **the game server is running an older version**, the page files updated but the game server didn't. That's what causes "unknown case" and "unknown" chat errors. Fix it like this:
1. Open **dash.cloudflare.com → Workers & Pages → coinfall → Deployments**. The newest deploy should say **Success** and match the time you uploaded. If it says **Failed**, open it and read the build log.
2. Open **Settings → Build** and look at **Root directory**. It must be the folder on GitHub that holds `wrangler.jsonc`. If `wrangler.jsonc` is on your repository's main page, the box should be empty (or `/`).
3. On GitHub, make sure there is only **one** copy of the files. If you have an old `coinfall` folder *and* files on the main page, delete the old folder so there's no mix-up.

### Easy settings to change
Coin amounts, the rain and chat rules can be changed on the **Admin page** without touching any code. For everything else, open `public/shared.js`:
- `LEVEL_BASE` (750, how hard leveling is) and `rakePct` (the rakeback formula)
- `FREE_CASES` (which free case unlocks at which level), `HIGH_ROLLER` (the expensive cases) and `BATTLE_MAX_ROUNDS` (50, most cases in one battle)
- `SETTINGS` (the starting values for everything on the Admin page's Settings card)
- `VERSION`: raise it by one whenever you change the game server, so players get the "updating" bar instead of strange errors
- `RAIN_MINUTES` (30), `RAIN_BASE_COINS` (25)
- Payout tables for every game

---

## Other ways to run it

**Command line deploy** (needs Node.js 22 or newer):
```
npm install
npx wrangler login
npx wrangler deploy
```

**On your own computer** (needs Node.js 22 or newer, nothing to install):
```
node dev/server.mjs
```
Then open http://localhost:8787. People on the same Wi-Fi can join using your computer's local IP address, for example `http://192.168.1.20:8787`. This saves to `coinfall.db` and also works on any host that runs Node.

---

## How it works
- `src/casino.js` is the game server. **Every result is decided on the server**, so nobody can cheat by editing the page. Money is stored in cents to avoid rounding errors.
- `src/index.js` runs the server on Cloudflare as one Durable Object with its built-in database.
- `public/` is the website: `app.js` (core, live tables and chat), `solo.js` (solo games), `cases.js` (cases, crate art, free cases and battles), `sound.js` (sound effects made in the browser, no audio files), `style.css` and `index.html`.
- `test/protocol.mjs`, `test/cases.mjs`, `test/chat.mjs` and `test/admin.mjs` play every action with fake players, and `test/ui_test.py` and `test/ui_cases.py` drive two real browsers.
- `artifact/` builds the single-page Claude version, where the live tables are filled with bots.

Cloudflare's free plan easily covers a group of friends. If the site ever gets very busy, check **Workers & Pages → coinfall → Metrics** in the dashboard.

## Keep it a game
- Coins can't be bought, sold or cashed out, and the footer says so. **Don't add a way to buy coins or win real prizes.** In most places that turns it into real gambling, which comes with legal rules and age limits.
- Chat filters rude words and removes links, and the chat box reminds players never to share personal info. Players can hide anyone's messages. As the admin, tap a name in chat to delete a message or mute someone, and use the Admin page to rename or ban players.
- Passwords are stored hashed, and no email is collected. That also means a forgotten password can't be reset.
