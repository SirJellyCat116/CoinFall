// Coinfall game server. Platform-neutral: give it a `sql` object with exec(query, ...params) -> { toArray() }
// (Cloudflare Durable Object SQLite storage, or the node:sqlite shim in dev/server.mjs) and feed it sockets.
// Every coin amount is in cents. All randomness and payouts happen here, never in the browser.

import {
  VERSION, CENTS, RAIN_MINUTES, CRASH_K, cleanSettings,
  BAC_PAY, bacPlay, vpHand, vpMult, DIAMOND_COLORS, diamondsHand, diamondsMult, PUMP, pumpMult, UPG_MIN, UPG_MAX, upgChance,
  WHEEL_ORDER, RL_SPOTS, rouletteMult, minesMult, TOWERS, TOWER_LEVELS, towersMult,
  PLINKO, KENO, WHEEL, SLOTS, slotsMult, bjValue, isBlackjack, cardVal, hiloChance,
  CHAT_MAX, CHAT_HISTORY, TIP_MIN_COINS, TIP_MIN_WAGERED,
  levelOf, rakeRate, rakePct, CASES, FREE_CASES, FREE_COOLDOWN, rollCase, BATTLE_MODES, BATTLE_MAX_ROUNDS, battleRoundMs, BOT_NAMES,
} from '../public/shared.js';

const HOUR = 3600e3, DAY = 86400e3;
const RAIN_MS = RAIN_MINUTES * 60e3;
const MAX_BET = 1e11;
const FEED_MAX = 25;
const HOUSE_CUT = 0.02; // PvP coinflip and jackpot; the cut goes into the rain

const RL_BET = 18000, RL_SPIN = 7000, RL_RESULT = 4500;
const CR_BET = 7000, CR_END = 3500;
const BJ_BET = 12000, BJ_TURN = 20000, BJ_STEP = 750, BJ_RESULT = 5000, BJ_SEATS = 6;
const JP_TIMER = 40000, JP_ROLL = 7000, JP_DONE = 5000;
const SOLO_GRACE = 90000;

const BAD_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'slut', 'whore', 'dick', 'cock', 'pussy', 'rape', 'nazi', 'hitler', 'porn', 'sex', 'kys'];

class UserError extends Error {}
const fail = msg => { throw new UserError(msg); };
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const rint = n => Math.floor(rnd() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const round2 = x => Math.round(x * 100) / 100;
const coins = c => (c / CENTS).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const drawCard = () => ({ r: rint(13) + 1, s: rint(4) });
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16)));
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const crashPoint = () => Math.max(1, Math.floor(99 / (1 - rnd())) / 100);

async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100000 }, key, 256);
  return hex(new Uint8Array(bits));
}
function sameHash(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// Chat cleanup: mask rude words, remove links, strip control characters.
function cleanChat(text) {
  let t = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  t = t.replace(/(https?:\/\/\S+|www\.\S+|\b[\w-]+\.(com|net|org|gg|io|xyz|ru|me|tk|co|us|uk|tv|link|app|site|online|shop|live)\b\S*)/gi, '[link removed]');
  for (const w of BAD_WORDS) t = t.replace(new RegExp(w, 'gi'), m => '*'.repeat(m.length));
  return t;
}
function checkName(name) {
  name = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) fail('Names are 3–16 letters, numbers or underscores');
  const low = name.toLowerCase();
  if (BAD_WORDS.some(w => low.includes(w))) fail('Please pick a different name');
  return name;
}

export class CasinoCore {
  constructor(sql, opts = {}) {
    this.sql = sql;
    this.log = opts.log || (() => {});
    this.socks = new Set();
    this.users = new Map();
    this.conn = new Map();
    this.solo = new Map();
    this.leftAt = new Map();
    this.feed = [];
    this.timer = null;
    this.lastSlow = 0;
    this.ts = opts.timeScale || 1; // tests can speed up the table timers
    this.initDb();
    this.cfg = cleanSettings(this.kvGet('settings'));
    this.announce = this.kvGet('announce');
    this.refundEscrow();
    this.loadRain();
    this.chat = this.kvGet('chat') || [];
    this.chatSeq = this.chat.reduce((a, m) => Math.max(a, m.id || 0), 0) + 1;
    this.chatDirty = false;
    this.resetTables();
  }

  /* ================= storage ================= */
  q(query, ...p) { return this.sql.exec(query, ...p).toArray(); }
  q1(query, ...p) { return this.q(query, ...p)[0]; }
  initDb() {
    this.q(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      salt TEXT NOT NULL, hash TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0, wagered INTEGER NOT NULL DEFAULT 0, won INTEGER NOT NULL DEFAULT 0,
      bets INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0, best_mult REAL NOT NULL DEFAULT 0, best_game TEXT NOT NULL DEFAULT '',
      hourly_at INTEGER NOT NULL DEFAULT 0, daily_at INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0,
      admin INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0)`);
    for (const col of ['rake REAL NOT NULL DEFAULT 0', "freecases TEXT NOT NULL DEFAULT '{}'", 'muted_until INTEGER NOT NULL DEFAULT 0']) { try { this.q('ALTER TABLE users ADD COLUMN ' + col); } catch { } }
    this.q('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uid INTEGER NOT NULL, created INTEGER NOT NULL)');
    this.q('CREATE TABLE IF NOT EXISTS escrow (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, amount INTEGER NOT NULL, game TEXT NOT NULL, created INTEGER NOT NULL)');
    this.q('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  }
  kvGet(k) { const r = this.q1('SELECT v FROM kv WHERE k=?', k); try { return r ? JSON.parse(r.v) : null; } catch { return null; } }
  kvSet(k, v) { this.q('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, JSON.stringify(v)); }
  rowToUser(r) {
    return { id: r.id, name: r.name, balance: r.balance, wagered: r.wagered, won: r.won, bets: r.bets, best: r.best, bestMult: r.best_mult, bestGame: r.best_game, hourlyAt: r.hourly_at, dailyAt: r.daily_at, created: r.created, admin: !!r.admin, banned: !!r.banned, rake: r.rake || 0, mutedUntil: r.muted_until || 0, free: (() => { try { return JSON.parse(r.freecases || '{}'); } catch { return {}; } })() };
  }
  getUser(uid) {
    let u = this.users.get(uid);
    if (u) return u;
    const r = this.q1('SELECT * FROM users WHERE id=?', uid);
    if (!r) return null;
    u = this.rowToUser(r);
    this.users.set(uid, u);
    return u;
  }
  save(u) {
    this.q('UPDATE users SET name=?, balance=?, wagered=?, won=?, bets=?, best=?, best_mult=?, best_game=?, hourly_at=?, daily_at=?, last_seen=?, admin=?, banned=?, rake=?, freecases=?, muted_until=? WHERE id=?',
      u.name, u.balance, u.wagered, u.won, u.bets, u.best, u.bestMult, u.bestGame, u.hourlyAt, u.dailyAt, Date.now(), u.admin ? 1 : 0, u.banned ? 1 : 0, u.rake || 0, JSON.stringify(u.free || {}), u.mutedUntil || 0, u.id);
  }
  refundEscrow() {
    for (const r of this.q('SELECT uid, SUM(amount) AS s FROM escrow GROUP BY uid')) {
      const u = this.getUser(r.uid);
      if (u) { u.balance += r.s; u.wagered = Math.max(0, u.wagered - r.s); this.save(u); }
    }
    this.q('DELETE FROM escrow');
  }

  /* ================= sockets ================= */
  open(sock) {
    sock.uid = null; sock.watch = null; sock.rl = { t: Date.now(), n: 0 }; sock.auth = { t: Date.now(), n: 0 };
    this.socks.add(sock);
    if (!this.timer) this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.log(e); } }, 100);
    this.send(sock, { t: 'hi', now: Date.now(), online: this.online(), v: VERSION, cfg: this.cfg });
    if (this.announce) this.send(sock, { t: 'announce', a: this.announce });
    this.send(sock, { t: 'feed', items: this.feed });
    this.send(sock, { t: 'chat', items: this.chat.slice(-50) });
    this.sendRain(sock);
    this.broadcastOnline();
  }
  close(sock) {
    if (!this.socks.has(sock)) return;
    this.socks.delete(sock);
    if (sock.uid) this.detach(sock);
    this.broadcastOnline();
    if (!this.socks.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  async message(sock, raw) {
    const t = Date.now();
    if (t - sock.rl.t > 1000) { sock.rl.t = t; sock.rl.n = 0; }
    if (++sock.rl.n > 40) return;
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const h = HANDLERS[m.t];
    if (!h) return this.reply(sock, m, null, 'This server does not know that action yet. Refresh the page');
    try { this.reply(sock, m, await h.call(this, sock, m)); }
    catch (e) {
      if (e instanceof UserError) this.reply(sock, m, null, e.message);
      else { this.log(e); this.reply(sock, m, null, 'Something went wrong on the server'); }
    }
  }
  reply(sock, m, d, e) {
    if (m.rid == null) return;
    this.send(sock, e ? { t: 'res', rid: m.rid, ok: false, e } : { t: 'res', rid: m.rid, ok: true, d: d ?? null });
  }
  send(sock, msg) { try { sock.send(JSON.stringify(msg)); } catch { } }
  toUser(uid, msg) { const s = this.conn.get(uid); if (s) { const str = JSON.stringify(msg); for (const k of s) { try { k.send(str); } catch { } } } }
  broadcast(msg, filter) { const str = JSON.stringify(msg); for (const s of this.socks) { if (filter && !filter(s)) continue; try { s.send(str); } catch { } } }
  online() { let guests = 0; for (const s of this.socks) if (!s.uid) guests++; return this.conn.size + guests; }
  broadcastOnline() { const n = this.online(); if (n !== this.lastOnline) { this.lastOnline = n; this.broadcast({ t: 'online', n }); } }
  toast(uid, m, k = '', extra = {}) { this.toUser(uid, { t: 'toast', m, k, ...extra }); }
  pub(u, priv) {
    const o = { id: u.id, name: u.name, balance: u.balance, wagered: u.wagered, won: u.won, bets: u.bets, best: u.best, bestMult: u.bestMult, bestGame: u.bestGame, level: levelOf(u.wagered) };
    if (priv) Object.assign(o, { hourlyAt: u.hourlyAt, dailyAt: u.dailyAt, admin: u.admin, now: Date.now(), rake: Math.floor(u.rake || 0), free: u.free || {} });
    return o;
  }
  pushMe(uid) { const u = this.getUser(uid); if (u && this.conn.has(uid)) this.toUser(uid, { t: 'me', me: this.pub(u, true) }); }
  attach(sock, uid) {
    if (sock.uid) this.detach(sock);
    sock.uid = uid;
    let s = this.conn.get(uid);
    if (!s) { s = new Set(); this.conn.set(uid, s); }
    s.add(sock);
    this.leftAt.delete(uid);
    const seat = this.bj.seats.find(x => x && x.uid === uid);
    if (seat) seat.away = false;
    this.pushMe(uid);
    this.sendRain(sock);
    this.send(sock, { t: 'solo', s: this.soloPublic(uid) });
    if (sock.watch) this.sendTable(sock, sock.watch);
    this.broadcastOnline();
  }
  detach(sock) {
    const uid = sock.uid;
    sock.uid = null;
    const s = this.conn.get(uid);
    if (!s) return;
    s.delete(sock);
    if (!s.size) {
      this.conn.delete(uid);
      this.leftAt.set(uid, Date.now());
      this.bjAway(uid);
    }
  }
  me(sock) {
    if (!sock.uid) fail('Log in to play');
    const u = this.getUser(sock.uid);
    if (!u || u.banned) fail('This account is not available');
    return u;
  }

  /* ================= wallet ================= */
  amount(x) {
    const v = Math.floor(Number(x));
    if (!Number.isFinite(v) || v < 1) fail('Bets start at 0.01 coins');
    if (v > MAX_BET) fail('That bet is too big');
    return v;
  }
  take(u, amt, game, opts = {}) {
    amt = this.amount(amt);
    if (amt > u.balance) fail(`You only have ${coins(u.balance)} coins`);
    u.balance -= amt;
    if (!opts.tip) {
      const before = levelOf(u.wagered);
      u.wagered += amt;
      u.rake = (u.rake || 0) + amt * rakeRate(before);
      this.rainAdd(Math.floor((amt * this.cfg.rainPct) / 100));
      const after = levelOf(u.wagered);
      if (after > before) this.levelUp(u, after);
    }
    this.save(u);
    let id = 0;
    if (!opts.instant) id = this.q1('INSERT INTO escrow (uid, amount, game, created) VALUES (?, ?, ?, ?) RETURNING id', u.id, amt, game, Date.now()).id;
    this.pushMe(u.id);
    return id;
  }
  lvl(uid) { const u = this.getUser(uid); return u ? levelOf(u.wagered) : 1; }
  levelUp(u, L) {
    const unlocked = FREE_CASES.filter(c => c.level === L).map(c => c.name);
    this.toast(u.id, `Level up! You're level ${L}. Rakeback is now ${rakePct(L).toFixed(2)}%` + (unlocked.length ? ` and you unlocked the ${unlocked.join(' and ')}` : ''), 'level', { coins: 120, level: L });
    if (L >= 5) this.addFeed({ id: u.id, name: u.name, game: 'Level up', bet: 0, payout: 0, mult: 0, level: L, lvl: L, ts: Date.now() });
  }
  release(ids) { for (const id of [].concat(ids || [])) if (id) this.q('DELETE FROM escrow WHERE id=?', id); }
  pay(uid, game, bet, payout, mult, esc) {
    this.release(esc);
    const u = this.getUser(uid);
    if (!u) return;
    payout = Math.max(0, Math.floor(payout));
    u.balance += payout; u.won += payout; u.bets += 1;
    const m = mult ?? (bet ? payout / bet : 0);
    const profit = payout - bet;
    if (profit > u.best) { u.best = profit; u.bestMult = round2(m); u.bestGame = game; }
    this.save(u);
    this.pushMe(uid);
    if (m >= 2 && profit >= 500) this.addFeed({ id: u.id, name: u.name, lvl: levelOf(u.wagered), game, bet, payout, mult: round2(m), ts: Date.now() });
  }
  refund(uid, amt, esc) {
    this.release(esc);
    const u = this.getUser(uid);
    if (!u) return;
    u.balance += amt; u.wagered = Math.max(0, u.wagered - amt);
    this.save(u);
    this.pushMe(uid);
  }
  credit(uid, amt) { const u = this.getUser(uid); if (!u) return; u.balance += amt; this.save(u); this.pushMe(uid); }
  addChat(msg) {
    msg.id = this.chatSeq++;
    msg.ts = msg.ts || Date.now();
    this.chat.push(msg);
    if (this.chat.length > CHAT_HISTORY) this.chat.splice(0, this.chat.length - CHAT_HISTORY);
    this.chatDirty = true;
    this.broadcast({ t: 'chatmsg', m: msg });
    return msg;
  }
  removeChat(pred) {
    const before = this.chat.length;
    this.chat = this.chat.filter(m => !pred(m));
    if (this.chat.length !== before) { this.chatDirty = true; this.broadcast({ t: 'chat', items: this.chat.slice(-50) }); }
  }
  addFeed(item) {
    this.feed.unshift(item);
    if (this.feed.length > FEED_MAX) this.feed.length = FEED_MAX;
    this.broadcast({ t: 'win', item });
  }

  /* ================= loop ================= */
  tick() {
    const t = Date.now();
    this.tickRoulette(t); this.tickCrash(t); this.tickBJ(t); this.tickJackpot(t); this.tickFlips(t); this.tickBattles(t);
    if (t - this.lastSlow >= 2000) {
      this.lastSlow = t;
      this.tickHourly(t); this.tickRain(t); this.tickLeft(t);
      if (this.chatDirty) { this.chatDirty = false; this.kvSet('chat', this.chat); }
    }
  }
  tickHourly(t) {
    for (const uid of this.conn.keys()) {
      const u = this.getUser(uid);
      if (u && !u.banned && t - u.hourlyAt >= HOUR) {
        u.hourlyAt = t;
        if (this.cfg.hourly > 0) { u.balance += this.cfg.hourly * CENTS; this.toast(uid, `+${this.cfg.hourly} coins from your hourly drop`, 'good', { coins: 24 }); }
        this.save(u); this.pushMe(uid);
      }
    }
  }
  tickLeft(t) {
    for (const [uid, at] of this.leftAt) {
      if (this.conn.has(uid)) { this.leftAt.delete(uid); continue; }
      if (t - at > SOLO_GRACE) { this.leftAt.delete(uid); this.soloAutoResolve(uid); }
    }
  }

  /* ================= rain ================= */
  nextRainEnd(t) { return (Math.floor(t / RAIN_MS) + 1) * RAIN_MS; }
  loadRain() {
    const r = this.kvGet('rain');
    this.rain = r && Array.isArray(r.joiners) ? r : { endsAt: this.nextRainEnd(Date.now()), pot: this.rainBase(), joiners: [], last: null };
    if (this.rain.pot > this.rainCap()) this.rain.pot = this.rainCap(); // older versions let the rain grow without a limit
    this.rainDirty = false;
  }
  rainBase() { return Math.round(this.cfg.rainBase * CENTS); }
  rainCap() { return Math.max(this.rainBase(), Math.round(this.cfg.rainMax * CENTS)); }
  // Bets top up the rain until it reaches the limit. Tips from players and admins can go past it.
  rainAdd(c) { const cap = this.rainCap(); if (c > 0 && this.rain.pot < cap) { this.rain.pot = Math.min(cap, this.rain.pot + c); this.rainDirty = true; } }
  rainState(uid) { const r = this.rain; return { endsAt: r.endsAt, pot: r.pot, n: r.joiners.length, joined: !!uid && r.joiners.includes(uid), last: r.last, now: Date.now() }; }
  sendRain(sock) { this.send(sock, { t: 'rain', s: this.rainState(sock.uid) }); }
  broadcastRain() { for (const s of this.socks) this.sendRain(s); }
  tickRain(t) {
    const r = this.rain;
    if (t >= r.endsAt) {
      const n = r.joiners.length;
      if (n) {
        const share = Math.floor(r.pot / n);
        for (const uid of r.joiners) {
          this.credit(uid, share);
          this.toast(uid, `It rained! +${coins(share)} coins`, 'rain', { coins: 90 });
        }
        r.last = { pot: r.pot, n, share, at: t };
        this.addChat({ kind: 'rain', text: `It rained ${coins(r.pot)} coins on ${n} ${n === 1 ? 'player' : 'players'}, ${coins(share)} each` });
        r.pot = this.rainBase();
      } else {
        r.last = { pot: r.pot, n: 0, share: 0, at: t };
      }
      r.joiners = [];
      r.endsAt = this.nextRainEnd(t);
      this.kvSet('rain', r);
      this.rainDirty = false;
      this.broadcastRain();
      return;
    }
    if (this.rainDirty) { this.rainDirty = false; this.kvSet('rain', r); this.broadcastRain(); }
  }

  /* ================= tables ================= */
  resetTables() {
    const t = Date.now();
    this.rl = { phase: 'betting', endsAt: t + RL_BET * this.ts, players: new Map(), result: null, spin: 0, history: [] };
    this.cr = { phase: 'betting', endsAt: t + CR_BET * this.ts, startAt: 0, cp: 0, crashAt: 0, bets: new Map(), history: [] };
    this.bj = { phase: 'idle', seats: Array(BJ_SEATS).fill(null), dealer: [], hole: true, turn: null, endsAt: 0 };
    this.jp = { phase: 'open', entries: [], endsAt: 0, winner: null, round: 1, history: [] };
    this.flips = new Map();
    this.flipSeq = 1;
    this.battles = new Map();
    this.battleSeq = 1;
  }
  sendTable(sock, game) {
    const s = this.tableState(game);
    if (s) this.send(sock, { t: 'table', game, s });
  }
  tableState(game) {
    switch (game) {
      case 'roulette': return this.rlState();
      case 'crash': return this.crState();
      case 'blackjack': return this.bjState();
      case 'jackpot': return this.jpState();
      case 'coinflip': return this.flipState();
      case 'battles': return this.battleState();
    }
    return null;
  }
  pushTable(game) {
    const s = this.tableState(game);
    this.broadcast({ t: 'table', game, s }, k => k.watch === game);
  }

  /* ---------- roulette ---------- */
  rlState() {
    const r = this.rl;
    return {
      phase: r.phase, endsAt: r.endsAt, now: Date.now(), result: r.result, spin: r.spin, history: r.history.slice(0, 16),
      players: [...r.players].map(([id, p]) => ({ id, name: p.name, lvl: this.lvl(id), total: p.total, bets: p.bets, payout: p.payout })),
    };
  }
  tickRoulette(t) {
    const r = this.rl;
    if (t < r.endsAt) return;
    if (r.phase === 'betting') {
      const idx = rint(37);
      r.result = { idx, n: WHEEL_ORDER[idx] };
      r.spin++;
      r.phase = 'spinning'; r.endsAt = t + RL_SPIN * this.ts;
    } else if (r.phase === 'spinning') {
      const n = r.result.n;
      for (const [uid, p] of r.players) {
        let pay = 0;
        for (const [k, v] of Object.entries(p.bets)) pay += v * rouletteMult(k, n);
        p.payout = Math.floor(pay);
        this.pay(uid, 'Roulette', p.total, p.payout, p.total ? p.payout / p.total : 0, p.esc);
      }
      r.history.unshift(n);
      if (r.history.length > 30) r.history.length = 30;
      r.phase = 'result'; r.endsAt = t + RL_RESULT * this.ts;
    } else {
      r.players.clear();
      r.phase = 'betting'; r.endsAt = t + RL_BET * this.ts;
    }
    this.pushTable('roulette');
  }

  /* ---------- crash ---------- */
  crMult(t) { return Math.exp(CRASH_K * Math.max(0, t - this.cr.startAt) / 1000); }
  crState() {
    const c = this.cr;
    return {
      phase: c.phase, endsAt: c.endsAt, startAt: c.startAt, now: Date.now(), k: CRASH_K,
      cp: c.phase === 'crashed' ? c.cp : null, history: c.history.slice(0, 16),
      players: [...c.bets].map(([id, b]) => ({ id, name: b.name, lvl: this.lvl(id), bet: b.bet, cashed: b.cashed, payout: b.payout })),
    };
  }
  crCash(uid, b, m) {
    b.cashed = m;
    b.payout = Math.floor(b.bet * m);
    this.pay(uid, 'Crash', b.bet, b.payout, m, b.esc);
  }
  tickCrash(t) {
    const c = this.cr;
    if (c.phase === 'betting' && t >= c.endsAt) {
      c.phase = 'running'; c.startAt = t; c.cp = crashPoint();
      c.crashAt = t + (Math.log(c.cp) / CRASH_K) * 1000;
      this.pushTable('crash');
    } else if (c.phase === 'running') {
      let changed = false;
      for (const [uid, b] of c.bets) {
        if (!b.cashed && b.auto && b.auto <= c.cp && t >= c.startAt + (Math.log(b.auto) / CRASH_K) * 1000) { this.crCash(uid, b, b.auto); changed = true; }
      }
      if (t >= c.crashAt) {
        for (const [uid, b] of c.bets) if (!b.cashed) this.pay(uid, 'Crash', b.bet, 0, 0, b.esc);
        c.history.unshift(c.cp);
        if (c.history.length > 30) c.history.length = 30;
        c.phase = 'crashed'; c.endsAt = t + CR_END * this.ts;
        changed = true;
      }
      if (changed) this.pushTable('crash');
    } else if (c.phase === 'crashed' && t >= c.endsAt) {
      c.bets.clear();
      c.phase = 'betting'; c.endsAt = t + CR_BET * this.ts;
      this.pushTable('crash');
    }
  }

  /* ---------- blackjack ---------- */
  bjState() {
    const b = this.bj;
    const dealer = b.hole && b.dealer.length ? [b.dealer[0], null] : b.dealer;
    const dv = b.dealer.length ? bjValue(b.hole ? [b.dealer[0]] : b.dealer) : null;
    return {
      phase: b.phase, endsAt: b.endsAt, now: Date.now(), turn: b.turn, dealer, dealerValue: dv,
      seats: b.seats.map(s => s && {
        id: s.uid, name: s.name, lvl: this.lvl(s.uid), bet: s.bet, away: s.away,
        hands: s.hands.map(h => ({ cards: h.cards, bet: h.bet, res: h.res, done: h.done, value: bjValue(h.cards), payout: h.payout })),
      }),
    };
  }
  bjSeatOf(uid) { return this.bj.seats.findIndex(s => s && s.uid === uid); }
  bjAway(uid) {
    const b = this.bj, i = this.bjSeatOf(uid);
    if (i < 0) return;
    const s = b.seats[i];
    s.away = true;
    if (!s.bet && (b.phase === 'idle' || b.phase === 'betting')) b.seats[i] = null;
    else if (b.phase === 'playing' && b.turn && b.turn.s === i) { s.hands[b.turn.h].done = true; this.bjAdvance(Date.now()); }
    this.pushTable('blackjack');
  }
  bjDeal(t) {
    const b = this.bj;
    const live = b.seats.filter(s => s && s.bet);
    if (!live.length) { b.phase = 'idle'; b.endsAt = 0; return; }
    for (const s of live) s.hands = [{ cards: [drawCard(), drawCard()], bet: s.bet, done: false, res: '', payout: 0 }];
    b.dealer = [drawCard(), drawCard()];
    b.hole = true;
    b.phase = 'playing';
    if (isBlackjack(b.dealer)) { b.hole = false; b.turn = null; b.phase = 'dealer'; b.endsAt = t + BJ_STEP * this.ts; return; }
    for (const s of live) if (isBlackjack(s.hands[0].cards)) s.hands[0].done = true;
    this.bjAdvance(t);
  }
  bjAdvance(t) {
    const b = this.bj;
    for (let i = 0; i < BJ_SEATS; i++) {
      const s = b.seats[i];
      if (!s || !s.hands.length) continue;
      for (let h = 0; h < s.hands.length; h++) {
        const hand = s.hands[h];
        if (!hand.done && bjValue(hand.cards).t >= 21) hand.done = true;
        if (hand.done) continue;
        if (s.away) { hand.done = true; continue; }
        b.turn = { s: i, h };
        b.endsAt = t + BJ_TURN * this.ts;
        return;
      }
    }
    b.turn = null;
    b.phase = 'dealer';
    b.endsAt = t + BJ_STEP * this.ts;
  }
  bjResolve(t) {
    const b = this.bj;
    const dv = bjValue(b.dealer).t, dBJ = isBlackjack(b.dealer);
    for (const s of b.seats) {
      if (!s || !s.hands.length) continue;
      let total = 0, pay = 0;
      const split = s.hands.length > 1;
      for (const h of s.hands) {
        total += h.bet;
        const v = bjValue(h.cards).t, bj = !split && isBlackjack(h.cards);
        let p = 0;
        if (bj && dBJ) { h.res = 'push'; p = h.bet; }
        else if (bj) { h.res = 'blackjack'; p = h.bet * 2.5; }
        else if (dBJ) h.res = 'lose';
        else if (v > 21) h.res = 'bust';
        else if (dv > 21 || v > dv) { h.res = 'win'; p = h.bet * 2; }
        else if (v === dv) { h.res = 'push'; p = h.bet; }
        else h.res = 'lose';
        h.payout = Math.floor(p);
        pay += h.payout;
      }
      this.pay(s.uid, 'Blackjack', total, pay, total ? pay / total : 0, s.esc);
      s.esc = [];
    }
    b.phase = 'result';
    b.endsAt = t + BJ_RESULT * this.ts;
  }
  tickBJ(t) {
    const b = this.bj;
    if (!b.endsAt || t < b.endsAt) return;
    if (b.phase === 'betting') this.bjDeal(t);
    else if (b.phase === 'playing' && b.turn) {
      const s = b.seats[b.turn.s];
      if (s) s.hands[b.turn.h].done = true;
      this.bjAdvance(t);
    } else if (b.phase === 'dealer') {
      if (b.hole) { b.hole = false; b.endsAt = t + BJ_STEP * this.ts; }
      else {
        const anyLive = b.seats.some(s => s && s.hands.some(h => bjValue(h.cards).t <= 21 && !(s.hands.length === 1 && isBlackjack(h.cards))));
        if (anyLive && !isBlackjack(b.dealer) && bjValue(b.dealer).t < 17) { b.dealer.push(drawCard()); b.endsAt = t + BJ_STEP * this.ts; }
        else this.bjResolve(t);
      }
    } else if (b.phase === 'result') {
      for (let i = 0; i < BJ_SEATS; i++) {
        const s = b.seats[i];
        if (!s) continue;
        s.idle = s.bet ? 0 : (s.idle || 0) + 1;
        if (s.away || s.leaving || s.idle >= 4) { b.seats[i] = null; continue; }
        s.bet = 0; s.hands = []; s.esc = [];
      }
      b.dealer = []; b.hole = true; b.turn = null;
      b.phase = 'idle'; b.endsAt = 0;
    }
    this.pushTable('blackjack');
  }

  /* ---------- jackpot ---------- */
  jpState() {
    const j = this.jp;
    return {
      phase: j.phase, endsAt: j.endsAt, now: Date.now(), round: j.round, winner: j.winner, history: j.history.slice(0, 10),
      total: j.entries.reduce((a, e) => a + e.amount, 0),
      entries: j.entries.map(e => ({ id: e.uid, name: e.name, lvl: this.lvl(e.uid), amount: e.amount })),
    };
  }
  tickJackpot(t) {
    const j = this.jp;
    if (!j.endsAt || t < j.endsAt) return;
    if (j.phase === 'open') {
      const total = j.entries.reduce((a, e) => a + e.amount, 0);
      let ticket = rint(total), w = j.entries[0];
      for (const e of j.entries) { if (ticket < e.amount) { w = e; break; } ticket -= e.amount; }
      const payout = Math.floor(total * (1 - HOUSE_CUT));
      j.winner = { id: w.uid, name: w.name, amount: w.amount, payout, total, chance: round2((w.amount / total) * 100) };
      j.phase = 'rolling'; j.endsAt = t + JP_ROLL * this.ts;
    } else if (j.phase === 'rolling') {
      const w = j.winner;
      this.rainAdd(w.total - w.payout);
      for (const e of j.entries) this.pay(e.uid, 'Jackpot', e.amount, e.uid === w.id ? w.payout : 0, e.uid === w.id ? w.payout / e.amount : 0, e.esc);
      j.history.unshift({ name: w.name, payout: w.payout, chance: w.chance });
      if (j.history.length > 20) j.history.length = 20;
      j.phase = 'done'; j.endsAt = t + JP_DONE * this.ts;
    } else {
      j.entries = []; j.winner = null; j.round++;
      j.phase = 'open'; j.endsAt = 0;
    }
    this.pushTable('jackpot');
  }

  /* ---------- coinflip (PvP lobby) ---------- */
  flipState() {
    return { now: Date.now(), flips: [...this.flips.values()].sort((a, b) => b.id - a.id).map(f => ({ id: f.id, uid: f.uid, name: f.name, lvl: this.lvl(f.uid), bet: f.bet, side: f.side, state: f.state, joiner: f.joiner, result: f.result, winner: f.winner })) };
  }
  tickFlips(t) {
    let changed = false;
    for (const [id, f] of this.flips) if (f.state === 'done' && t - f.doneAt > 15000) { this.flips.delete(id); changed = true; }
    if (changed) this.pushTable('coinflip');
  }

  /* ---------- case battles ---------- */
  battleState() {
    const rank = b => (b.state === 'open' ? 0 : b.state === 'running' ? 1 : 2);
    return {
      now: Date.now(),
      battles: [...this.battles.values()].sort((a, b) => rank(a) - rank(b) || b.id - a.id).map(b => ({
        id: b.id, mode: b.mode, cursed: b.cursed, cases: b.cases, cost: b.cost, state: b.state, round: b.round, roundAt: b.roundAt,
        creator: b.creator, winners: b.winners, pot: b.pot,
        seats: b.seats.map(s => s && { id: s.uid, name: s.name, bot: s.bot, lvl: s.lvl, total: s.total, drops: s.drops, payout: s.payout || 0 }),
      })),
    };
  }
  battleMaybeStart(b) {
    if (b.seats.every(Boolean)) { b.state = 'running'; b.round = -1; b.roundAt = Date.now() + 2500 * this.ts; }
  }
  tickBattles(t) {
    let changed = false;
    for (const b of this.battles.values()) {
      if (b.state === 'running' && t >= b.roundAt) {
        if (b.round + 1 < b.cases.length) {
          b.round++;
          const c = CASES[b.cases[b.round]];
          for (const s of b.seats) { const idx = rollCase(c, rint(100000)); s.drops.push(idx); s.total += c.items[idx].value; }
          b.roundAt = t + battleRoundMs(b.cases.length) * this.ts;
        } else this.battleFinish(b, t);
        changed = true;
      } else if (b.state === 'done' && t - b.doneAt > 90000) { this.battles.delete(b.id); changed = true; }
    }
    if (changed) this.pushTable('battles');
  }
  battleFinish(b, t) {
    const groups = BATTLE_MODES[b.mode].teams || b.seats.map((_, i) => [i]);
    const scores = groups.map(g => g.reduce((a, i) => a + b.seats[i].total, 0));
    const target = b.cursed ? Math.min(...scores) : Math.max(...scores);
    const winners = groups.filter((g, gi) => scores[gi] === target).flat();
    const pot = b.seats.reduce((a, s) => a + s.total, 0);
    const share = Math.floor(pot / winners.length);
    b.seats.forEach((s, i) => {
      const won = winners.includes(i);
      s.payout = won ? share : 0;
      if (!s.bot) this.pay(s.uid, 'Case Battle', b.cost, s.payout, s.payout / b.cost, s.esc);
    });
    Object.assign(b, { winners, pot, state: 'done', doneAt: t });
  }

  /* ================= solo games ================= */
  so(uid) { let s = this.solo.get(uid); if (!s) { s = {}; this.solo.set(uid, s); } return s; }
  soloPublic(uid) {
    const s = this.solo.get(uid) || {};
    const o = {};
    if (s.mines) o.mines = { bet: s.mines.bet, m: s.mines.m, rev: s.mines.rev };
    if (s.towers) o.towers = { bet: s.towers.bet, diff: s.towers.diff, lvl: s.towers.lvl, picks: s.towers.picks };
    if (s.hilo) o.hilo = { bet: s.hilo.bet, card: s.hilo.card, mult: s.hilo.mult, steps: s.hilo.steps, cards: s.hilo.cards };
    if (s.vp) o.vp = { bet: s.vp.bet, cards: s.vp.cards };
    if (s.pump) o.pump = { bet: s.pump.bet, diff: s.pump.diff, k: s.pump.k };
    return o;
  }
  soloAutoResolve(uid) {
    const s = this.solo.get(uid);
    if (!s) return;
    if (s.mines) { const g = s.mines; g.rev.length ? this.pay(uid, 'Mines', g.bet, g.bet * minesMult(g.m, g.rev.length), minesMult(g.m, g.rev.length), g.esc) : this.refund(uid, g.bet, g.esc); }
    if (s.towers) { const g = s.towers; g.lvl ? this.pay(uid, 'Towers', g.bet, g.bet * towersMult(g.diff, g.lvl), towersMult(g.diff, g.lvl), g.esc) : this.refund(uid, g.bet, g.esc); }
    if (s.hilo) { const g = s.hilo; g.steps ? this.pay(uid, 'Hi-Lo', g.bet, g.bet * g.mult, g.mult, g.esc) : this.refund(uid, g.bet, g.esc); }
    if (s.vp) { const g = s.vp, mult = vpMult(vpHand(g.cards)); this.pay(uid, 'Video Poker', g.bet, g.bet * mult, mult, g.esc); } // keeps the hand as dealt
    if (s.pump) { const g = s.pump; g.k ? this.pay(uid, 'Pump', g.bet, g.bet * pumpMult(g.diff, g.k), pumpMult(g.diff, g.k), g.esc) : this.refund(uid, g.bet, g.esc); }
    this.solo.delete(uid);
  }

  /* ================= admin helpers ================= */
  ownerId() { if (this._owner == null) { const r = this.q1('SELECT MIN(id) AS id FROM users'); this._owner = r && r.id != null ? r.id : 0; } return this._owner; }
  isOwner(u) { return !!u && u.id === this.ownerId(); }
  adminOf(sock) { const a = this.me(sock); if (!a.admin) fail('Admins only'); return a; }
  // The player an admin wants to act on. Only the owner (first account) can act on other admins.
  targetOf(a, id, self = false) {
    const u = this.getUser(Number(id));
    if (!u) fail('No such player');
    if (u.id === a.id && !self) fail("You can't do that to yourself");
    if (u.id !== a.id && u.admin && !this.isOwner(a)) fail('Only the owner can do that to another admin');
    return u;
  }
  alog(a, text) {
    const l = this.kvGet('adminlog') || [];
    l.unshift({ ts: Date.now(), by: a.name, text });
    if (l.length > 100) l.length = 100;
    this.kvSet('adminlog', l);
  }
  kickSocks(uid, msg) {
    this.q('DELETE FROM sessions WHERE uid=?', uid);
    for (const s of [...(this.conn.get(uid) || [])]) { this.send(s, { t: 'kicked', m: msg }); this.detach(s); }
  }
  // Every player's row, with the in-memory copy winning for anyone loaded right now.
  forAllUsers(fn) { for (const u of this.users.values()) fn(u); }
}

/* ================= message handlers ================= */
const int = (x, lo, hi, msg) => { const v = Number(x); if (!Number.isInteger(v) || v < lo || v > hi) fail(msg || 'Invalid choice'); return v; };

const HANDLERS = {
  /* ----- accounts ----- */
  async register(sock, m) {
    const name = checkName(m.name);
    const pass = String(m.pass || '');
    if (pass.length < 4 || pass.length > 64) fail('Passwords are 4–64 characters');
    if (this.q1('SELECT id FROM users WHERE name=? COLLATE NOCASE', name)) fail('That name is taken');
    const salt = randHex(16);
    const hash = await hashPass(pass, salt);
    const first = !this.q1('SELECT id FROM users LIMIT 1');
    const t = Date.now();
    let row;
    try { row = this.q1('INSERT INTO users (name, salt, hash, balance, hourly_at, created, last_seen, admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', name, salt, hash, Math.round(this.cfg.welcome * CENTS), t, t, t, first ? 1 : 0); }
    catch { fail('That name is taken'); }
    this._owner = null;
    const token = randHex(24);
    this.q('INSERT INTO sessions (token, uid, created) VALUES (?, ?, ?)', token, row.id, t);
    this.attach(sock, row.id);
    return { token, me: this.pub(this.getUser(row.id), true), welcome: true, coins: Math.round(this.cfg.welcome * CENTS) };
  },
  async login(sock, m) {
    const t = Date.now();
    if (t - sock.auth.t > 60000) { sock.auth.t = t; sock.auth.n = 0; }
    if (++sock.auth.n > 8) fail('Too many tries. Wait a minute and try again');
    const r = this.q1('SELECT * FROM users WHERE name=? COLLATE NOCASE', String(m.name || '').trim());
    if (!r) fail('Wrong name or password');
    const hash = await hashPass(String(m.pass || ''), r.salt);
    if (!sameHash(hash, r.hash)) fail('Wrong name or password');
    if (r.banned) fail('This account has been banned');
    const token = randHex(24);
    this.q('INSERT INTO sessions (token, uid, created) VALUES (?, ?, ?)', token, r.id, t);
    this.attach(sock, r.id);
    return { token, me: this.pub(this.getUser(r.id), true) };
  },
  hello(sock, m) {
    const r = this.q1('SELECT uid FROM sessions WHERE token=?', String(m.token || ''));
    if (!r) fail('expired');
    const u = this.getUser(r.uid);
    if (!u || u.banned) fail('expired');
    this.attach(sock, u.id);
    return { me: this.pub(u, true) };
  },
  logout(sock, m) {
    if (m.token) this.q('DELETE FROM sessions WHERE token=?', String(m.token));
    if (sock.uid) this.detach(sock);
    this.broadcastOnline();
    return {};
  },
  watch(sock, m) {
    const g = ['roulette', 'crash', 'blackjack', 'jackpot', 'coinflip', 'battles'].includes(m.game) ? m.game : null;
    sock.watch = g;
    return g ? this.tableState(g) : null;
  },
  lb(sock, m) {
    const ORDER = { profit: '(won - wagered)', balance: 'balance', best: 'best', wagered: 'wagered' };
    const o = ORDER[m.tab] || ORDER.profit;
    return this.q(`SELECT id, name, balance, wagered, won, bets, best, best_mult, best_game FROM users WHERE banned=0 ORDER BY ${o} DESC, id ASC LIMIT 50`)
      .map(r => ({ id: r.id, name: r.name, balance: r.balance, wagered: r.wagered, won: r.won, bets: r.bets, best: r.best, bestMult: r.best_mult, bestGame: r.best_game }));
  },

  /* ----- rewards ----- */
  daily(sock) {
    const u = this.me(sock), t = Date.now();
    if (t - u.dailyAt < DAY) fail('Your daily bonus is not ready yet');
    u.dailyAt = t; u.balance += this.cfg.daily * CENTS; this.save(u); this.pushMe(u.id);
    return { amount: this.cfg.daily * CENTS };
  },
  'rain.join'(sock) {
    const u = this.me(sock);
    if (!this.rain.joiners.includes(u.id)) { this.rain.joiners.push(u.id); this.kvSet('rain', this.rain); this.broadcastRain(); }
    return this.rainState(u.id);
  },
  'rain.tip'(sock, m) {
    const u = this.me(sock);
    const amt = this.amount(m.amount);
    if (amt < CENTS) fail('Tips start at 1 coin');
    this.take(u, amt, 'Rain', { tip: true, instant: true });
    this.rain.pot += amt;
    this.kvSet('rain', this.rain);
    this.broadcastRain();
    return this.rainState(u.id);
  },

  /* ----- roulette ----- */
  'rl.bet'(sock, m) {
    const u = this.me(sock), r = this.rl;
    if (r.phase !== 'betting' || Date.now() > r.endsAt - 250) fail('Bets are closed for this spin');
    const list = Array.isArray(m.bets) ? m.bets : [];
    if (!list.length || list.length > 49) fail('Place a chip first');
    let total = 0;
    const clean = [];
    for (const b of list) {
      if (!Array.isArray(b) || !RL_SPOTS.includes(b[0])) fail('Invalid bet spot');
      const a = this.amount(b[1]);
      total += a; clean.push([b[0], a]);
    }
    const esc = this.take(u, total, 'Roulette');
    let p = r.players.get(u.id);
    if (!p) { p = { name: u.name, bets: {}, esc: [], total: 0, payout: 0 }; r.players.set(u.id, p); }
    for (const [k, a] of clean) p.bets[k] = (p.bets[k] || 0) + a;
    p.esc.push(esc); p.total += total;
    this.pushTable('roulette');
    return { total: p.total };
  },
  'rl.clear'(sock) {
    const u = this.me(sock), r = this.rl;
    if (r.phase !== 'betting') fail('Bets are closed for this spin');
    const p = r.players.get(u.id);
    if (p) { this.refund(u.id, p.total, p.esc); r.players.delete(u.id); this.pushTable('roulette'); }
    return {};
  },

  /* ----- crash ----- */
  'cr.bet'(sock, m) {
    const u = this.me(sock), c = this.cr;
    if (c.phase !== 'betting') fail('Wait for the next round');
    if (c.bets.has(u.id)) fail('You already have a bet this round');
    const auto = Number(m.auto) >= 1.01 ? Math.min(1e6, Math.floor(Number(m.auto) * 100) / 100) : 0;
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Crash');
    c.bets.set(u.id, { name: u.name, bet: amt, auto, esc, cashed: 0, payout: 0 });
    this.pushTable('crash');
    return {};
  },
  'cr.cancel'(sock) {
    const u = this.me(sock), c = this.cr, b = c.bets.get(u.id);
    if (c.phase !== 'betting' || !b) fail('Nothing to cancel');
    this.refund(u.id, b.bet, b.esc); c.bets.delete(u.id);
    this.pushTable('crash');
    return {};
  },
  'cr.cashout'(sock) {
    const u = this.me(sock), c = this.cr, b = c.bets.get(u.id), t = Date.now();
    if (c.phase !== 'running' || !b || b.cashed) fail('Nothing to cash out');
    if (t >= c.crashAt) fail('Too late, it crashed');
    const mm = Math.max(1, Math.floor(this.crMult(t) * 100) / 100);
    this.crCash(u.id, b, mm);
    this.pushTable('crash');
    return { mult: mm, payout: b.payout };
  },

  /* ----- blackjack ----- */
  'bj.sit'(sock, m) {
    const u = this.me(sock), b = this.bj;
    const i = int(m.seat, 0, BJ_SEATS - 1, 'Pick a seat');
    if (this.bjSeatOf(u.id) >= 0) fail('You already have a seat');
    if (b.seats[i]) fail('That seat is taken');
    b.seats[i] = { uid: u.id, name: u.name, bet: 0, esc: [], hands: [], away: false, idle: 0 };
    this.pushTable('blackjack');
    return {};
  },
  'bj.leave'(sock) {
    const u = this.me(sock), b = this.bj, i = this.bjSeatOf(u.id);
    if (i < 0) return {};
    const s = b.seats[i];
    if (s.bet && (b.phase === 'playing' || b.phase === 'dealer' || b.phase === 'result')) s.leaving = true;
    else { if (s.bet) this.refund(u.id, s.bet, s.esc); b.seats[i] = null; }
    if (!b.seats.some(x => x && x.bet) && b.phase === 'betting') { b.phase = 'idle'; b.endsAt = 0; }
    this.pushTable('blackjack');
    return {};
  },
  'bj.bet'(sock, m) {
    const u = this.me(sock), b = this.bj, i = this.bjSeatOf(u.id);
    if (i < 0) fail('Take a seat first');
    if (b.phase !== 'idle' && b.phase !== 'betting') fail('Wait for the next hand');
    const s = b.seats[i];
    if (s.bet) fail('You already bet this hand');
    const amt = this.amount(m.amount);
    s.esc = [this.take(u, amt, 'Blackjack')];
    s.bet = amt; s.idle = 0;
    const t = Date.now();
    if (b.phase === 'idle') { b.phase = 'betting'; b.endsAt = t + BJ_BET * this.ts; }
    if (b.seats.every(x => !x || x.bet || x.away)) b.endsAt = Math.min(b.endsAt, t + 1500);
    this.pushTable('blackjack');
    return {};
  },
  'bj.act'(sock, m) {
    const u = this.me(sock), b = this.bj;
    if (b.phase !== 'playing' || !b.turn) fail('It is not your turn');
    const s = b.seats[b.turn.s];
    if (!s || s.uid !== u.id) fail('It is not your turn');
    const hand = s.hands[b.turn.h];
    const t = Date.now();
    switch (m.a) {
      case 'hit': hand.cards.push(drawCard()); if (bjValue(hand.cards).t >= 21) hand.done = true; break;
      case 'stand': hand.done = true; break;
      case 'double':
        if (hand.cards.length !== 2) fail('You can only double on two cards');
        s.esc.push(this.take(u, hand.bet, 'Blackjack'));
        hand.bet *= 2; hand.cards.push(drawCard()); hand.done = true;
        break;
      case 'split': {
        if (s.hands.length !== 1 || hand.cards.length !== 2 || cardVal(hand.cards[0]) !== cardVal(hand.cards[1])) fail('You can only split a pair');
        s.esc.push(this.take(u, hand.bet, 'Blackjack'));
        const [c1, c2] = hand.cards, aces = c1.r === 1;
        s.hands = [
          { cards: [c1, drawCard()], bet: hand.bet, done: aces, res: '', payout: 0 },
          { cards: [c2, drawCard()], bet: hand.bet, done: aces, res: '', payout: 0 },
        ];
        b.turn.h = 0;
        break;
      }
      default: fail('Unknown move');
    }
    this.bjAdvance(t);
    this.pushTable('blackjack');
    return {};
  },

  /* ----- jackpot ----- */
  'jp.deposit'(sock, m) {
    const u = this.me(sock), j = this.jp;
    if (j.phase !== 'open') fail('Wait for the next round');
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Jackpot');
    let e = j.entries.find(x => x.uid === u.id);
    if (!e) { e = { uid: u.id, name: u.name, amount: 0, esc: [] }; j.entries.push(e); }
    e.amount += amt; e.esc.push(esc);
    if (j.entries.length >= 2 && !j.endsAt) j.endsAt = Date.now() + JP_TIMER * this.ts;
    this.pushTable('jackpot');
    return {};
  },
  'jp.withdraw'(sock) {
    const u = this.me(sock), j = this.jp;
    if (j.phase !== 'open' || j.entries.length !== 1 || j.entries[0].uid !== u.id) fail('You can only take your coins back while you are alone in the pot');
    const e = j.entries[0];
    this.refund(u.id, e.amount, e.esc);
    j.entries = [];
    this.pushTable('jackpot');
    return {};
  },

  /* ----- coinflip ----- */
  'cf.house'(sock, m) {
    const u = this.me(sock);
    const side = m.side === 'tails' ? 'tails' : 'heads';
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Coinflip', { instant: true });
    const result = rnd() < 0.5 ? 'heads' : 'tails';
    const win = result === side, payout = win ? Math.floor(amt * 1.96) : 0;
    this.pay(u.id, 'Coinflip', amt, payout, win ? 1.96 : 0);
    return { result, win, payout };
  },
  'cf.create'(sock, m) {
    const u = this.me(sock);
    if ([...this.flips.values()].filter(f => f.uid === u.id && f.state === 'open').length >= 3) fail('You can have 3 open flips at a time');
    const side = m.side === 'tails' ? 'tails' : 'heads';
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Coinflip');
    const f = { id: this.flipSeq++, uid: u.id, name: u.name, bet: amt, side, esc, state: 'open', joiner: null, result: null, winner: null, doneAt: 0 };
    this.flips.set(f.id, f);
    this.pushTable('coinflip');
    return { id: f.id };
  },
  'cf.join'(sock, m) {
    const u = this.me(sock), f = this.flips.get(Number(m.id));
    if (!f || f.state !== 'open') fail('That flip is gone');
    if (f.uid === u.id) fail('You cannot join your own flip');
    this.take(u, f.bet, 'Coinflip', { instant: true });
    const result = rnd() < 0.5 ? 'heads' : 'tails';
    const creatorWins = result === f.side;
    const pot = f.bet * 2, payout = Math.floor(pot * (1 - HOUSE_CUT));
    this.rainAdd(pot - payout);
    const winner = creatorWins ? f.uid : u.id, loser = creatorWins ? u.id : f.uid;
    this.pay(winner, 'Coinflip', f.bet, payout, payout / f.bet, winner === f.uid ? f.esc : null);
    this.pay(loser, 'Coinflip', f.bet, 0, 0, loser === f.uid ? f.esc : null);
    Object.assign(f, { state: 'done', joiner: { id: u.id, name: u.name }, result, winner, doneAt: Date.now() });
    this.pushTable('coinflip');
    return { result, win: winner === u.id, payout: winner === u.id ? payout : 0 };
  },
  'cf.cancel'(sock, m) {
    const u = this.me(sock), f = this.flips.get(Number(m.id));
    if (!f || f.state !== 'open' || f.uid !== u.id) fail('You can only cancel your own open flip');
    this.refund(u.id, f.bet, f.esc);
    this.flips.delete(f.id);
    this.pushTable('coinflip');
    return {};
  },

  /* ----- mines ----- */
  'mines.start'(sock, m) {
    const u = this.me(sock), s = this.so(u.id);
    if (s.mines) fail('Finish your current Mines round first');
    const mines = int(m.mines, 1, 24, 'Pick 1 to 24 mines');
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Mines');
    s.mines = { bet: amt, m: mines, mines: shuffle([...Array(25).keys()]).slice(0, mines), rev: [], esc };
    return {};
  },
  'mines.pick'(sock, m) {
    const u = this.me(sock), s = this.so(u.id), g = s.mines;
    if (!g) fail('Start a round first');
    const i = int(m.i, 0, 24);
    if (g.rev.includes(i)) fail('Already revealed');
    if (g.mines.includes(i)) {
      delete s.mines;
      this.pay(u.id, 'Mines', g.bet, 0, 0, g.esc);
      return { mine: true, mines: g.mines };
    }
    g.rev.push(i);
    const k = g.rev.length, mult = minesMult(g.m, k);
    if (k === 25 - g.m) {
      delete s.mines;
      const payout = Math.floor(g.bet * mult);
      this.pay(u.id, 'Mines', g.bet, payout, mult, g.esc);
      return { gem: true, done: true, mult, payout, mines: g.mines };
    }
    return { gem: true, mult, next: minesMult(g.m, k + 1) };
  },
  'mines.cashout'(sock) {
    const u = this.me(sock), s = this.so(u.id), g = s.mines;
    if (!g || !g.rev.length) fail('Reveal a tile first');
    delete s.mines;
    const mult = minesMult(g.m, g.rev.length), payout = Math.floor(g.bet * mult);
    this.pay(u.id, 'Mines', g.bet, payout, mult, g.esc);
    return { mult, payout, mines: g.mines };
  },

  /* ----- towers ----- */
  'towers.start'(sock, m) {
    const u = this.me(sock), s = this.so(u.id);
    if (s.towers) fail('Finish your current Towers climb first');
    const diff = TOWERS[m.diff] ? m.diff : 'medium', d = TOWERS[diff];
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Towers');
    s.towers = { bet: amt, diff, lvl: 0, picks: [], esc, bombs: Array.from({ length: TOWER_LEVELS }, () => shuffle([...Array(d.cols).keys()]).slice(0, d.cols - d.safe)) };
    return {};
  },
  'towers.pick'(sock, m) {
    const u = this.me(sock), s = this.so(u.id), g = s.towers;
    if (!g) fail('Start a climb first');
    const c = int(m.c, 0, TOWERS[g.diff].cols - 1);
    if (g.bombs[g.lvl].includes(c)) {
      delete s.towers;
      this.pay(u.id, 'Towers', g.bet, 0, 0, g.esc);
      return { bomb: true, bombs: g.bombs };
    }
    g.picks.push(c);
    g.lvl++;
    const mult = towersMult(g.diff, g.lvl);
    if (g.lvl === TOWER_LEVELS) {
      delete s.towers;
      const payout = Math.floor(g.bet * mult);
      this.pay(u.id, 'Towers', g.bet, payout, mult, g.esc);
      return { safe: true, done: true, mult, payout, bombs: g.bombs };
    }
    return { safe: true, lvl: g.lvl, mult, row: g.bombs[g.lvl - 1] };
  },
  'towers.cashout'(sock) {
    const u = this.me(sock), s = this.so(u.id), g = s.towers;
    if (!g || !g.lvl) fail('Climb at least one floor first');
    delete s.towers;
    const mult = towersMult(g.diff, g.lvl), payout = Math.floor(g.bet * mult);
    this.pay(u.id, 'Towers', g.bet, payout, mult, g.esc);
    return { mult, payout, bombs: g.bombs };
  },

  /* ----- hi-lo ----- */
  'hilo.start'(sock, m) {
    const u = this.me(sock), s = this.so(u.id);
    if (s.hilo) fail('Finish your current Hi-Lo round first');
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Hi-Lo');
    const card = drawCard();
    s.hilo = { bet: amt, card, mult: 1, steps: 0, esc, cards: [{ ...card, g: 'start' }] };
    return { card };
  },
  'hilo.guess'(sock, m) {
    const u = this.me(sock), s = this.so(u.id), g = s.hilo;
    if (!g) fail('Start a round first');
    const n = drawCard();
    if (m.dir === 'skip') {
      g.card = n; g.cards.push({ ...n, g: 'skip' });
      if (g.cards.length > 40) g.cards.shift();
      return { card: n, skip: true, mult: g.mult };
    }
    const dir = m.dir === 'lo' ? 'lo' : 'hi';
    const p = hiloChance(g.card.r, dir);
    if (p >= 1) fail('That guess always wins. Pick the other one or skip');
    const win = dir === 'hi' ? n.r >= g.card.r : n.r <= g.card.r;
    if (!win) {
      delete s.hilo;
      this.pay(u.id, 'Hi-Lo', g.bet, 0, 0, g.esc);
      return { card: n, win: false };
    }
    g.mult = Math.min(1e6, Math.floor(g.mult * (0.99 / p) * 10000) / 10000);
    g.steps++; g.card = n; g.cards.push({ ...n, g: dir });
    if (g.cards.length > 40) g.cards.shift();
    return { card: n, win: true, mult: g.mult };
  },
  'hilo.cashout'(sock) {
    const u = this.me(sock), s = this.so(u.id), g = s.hilo;
    if (!g || !g.steps) fail('Make a correct guess first');
    delete s.hilo;
    const payout = Math.floor(g.bet * g.mult);
    this.pay(u.id, 'Hi-Lo', g.bet, payout, g.mult, g.esc);
    return { mult: g.mult, payout };
  },

  /* ----- instant games ----- */
  'dice.roll'(sock, m) {
    const u = this.me(sock);
    const target = Math.round(Number(m.target) * 100) / 100;
    if (!(target >= 2 && target <= 98)) fail('Pick a target between 2 and 98');
    const over = !!m.over;
    const chance = over ? 100 - target : target;
    const mult = Math.floor((99 / chance) * 10000) / 10000;
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Dice', { instant: true });
    const roll = rint(10001) / 100;
    const win = over ? roll > target : roll < target;
    const payout = win ? Math.floor(amt * mult) : 0;
    this.pay(u.id, 'Dice', amt, payout, win ? mult : 0);
    return { roll, win, mult, payout };
  },
  'limbo.play'(sock, m) {
    const u = this.me(sock);
    const target = Math.floor(Number(m.target) * 100) / 100;
    if (!(target >= 1.01 && target <= 1e6)) fail('Pick a target between 1.01× and 1,000,000×');
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Limbo', { instant: true });
    const result = crashPoint();
    const win = result >= target, payout = win ? Math.floor(amt * target) : 0;
    this.pay(u.id, 'Limbo', amt, payout, win ? target : 0);
    return { result, win, payout };
  },
  'plinko.drop'(sock, m) {
    const u = this.me(sock);
    const rows = [8, 12, 16].includes(Number(m.rows)) ? Number(m.rows) : 12;
    const risk = PLINKO[rows][m.risk] ? m.risk : 'medium';
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Plinko', { instant: true });
    const bits = Array.from({ length: rows }, () => (rnd() < 0.5 ? 0 : 1));
    const idx = bits.reduce((a, b) => a + b, 0), mult = PLINKO[rows][risk][idx];
    const payout = Math.floor(amt * mult);
    this.pay(u.id, 'Plinko', amt, payout, mult);
    return { bits, idx, mult, payout };
  },
  'keno.play'(sock, m) {
    const u = this.me(sock);
    const picks = [...new Set((Array.isArray(m.picks) ? m.picks : []).map(Number))];
    if (picks.length < 1 || picks.length > 10 || picks.some(p => !Number.isInteger(p) || p < 1 || p > 40)) fail('Pick 1 to 10 numbers');
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Keno', { instant: true });
    const drawn = shuffle(Array.from({ length: 40 }, (_, i) => i + 1)).slice(0, 10);
    const hits = picks.filter(p => drawn.includes(p)).length;
    const mult = KENO[picks.length][hits], payout = Math.floor(amt * mult);
    this.pay(u.id, 'Keno', amt, payout, mult);
    return { drawn, hits, mult, payout };
  },
  'wheel.spin'(sock, m) {
    const u = this.me(sock);
    const risk = WHEEL[m.risk] ? m.risk : 'medium';
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Wheel', { instant: true });
    const idx = rint(WHEEL[risk].length), mult = WHEEL[risk][idx], payout = Math.floor(amt * mult);
    this.pay(u.id, 'Wheel', amt, payout, mult);
    return { idx, mult, payout };
  },
  'slots.spin'(sock, m) {
    const u = this.me(sock);
    const amt = this.amount(m.amount);
    this.take(u, amt, 'Slots', { instant: true });
    const total = SLOTS.weights.reduce((a, b) => a + b, 0);
    const pick = () => { let x = rint(total); for (let i = 0; i < SLOTS.weights.length; i++) { if (x < SLOTS.weights[i]) return i; x -= SLOTS.weights[i]; } return 0; };
    const reels = [pick(), pick(), pick()];
    const mult = slotsMult(reels), payout = Math.floor(amt * mult);
    this.pay(u.id, 'Slots', amt, payout, mult);
    return { reels, mult, payout };
  },

  /* ----- levels, rakeback, cases ----- */
  'rake.claim'(sock) {
    const u = this.me(sock);
    const amt = Math.floor(u.rake || 0);
    if (amt < 1) fail('No rakeback to claim yet. It builds up as you bet');
    u.rake -= amt; u.balance += amt; this.save(u); this.pushMe(u.id);
    return { amount: amt };
  },
  'free.open'(sock, m) {
    const u = this.me(sock), i = int(m.i, 0, FREE_CASES.length - 1, 'Unknown case'), c = FREE_CASES[i], t = Date.now();
    if (levelOf(u.wagered) < c.level) fail(`Reach level ${c.level} to unlock the ${c.name}`);
    u.free = u.free || {};
    if (t - (u.free[i] || 0) < FREE_COOLDOWN) fail('This case is not ready yet');
    const idx = rollCase(c, rint(100000)), value = c.items[idx].value;
    u.free[i] = t; u.balance += value; this.save(u); this.pushMe(u.id);
    if (value >= c.price * 5 && value >= 1000) this.addFeed({ id: u.id, name: u.name, lvl: levelOf(u.wagered), game: c.name, bet: 0, payout: value, mult: 0, free: true, ts: t });
    return { idx, value };
  },
  'case.open'(sock, m) {
    const u = this.me(sock), c = CASES[int(m.id, 0, CASES.length - 1, 'Unknown case')];
    this.take(u, c.price, 'Cases', { instant: true });
    const idx = rollCase(c, rint(100000)), value = c.items[idx].value;
    this.pay(u.id, 'Cases', c.price, value, value / c.price);
    return { idx, value };
  },

  /* ----- case battles ----- */
  'battle.create'(sock, m) {
    const u = this.me(sock);
    if (!BATTLE_MODES[m.mode]) fail('Pick a battle mode');
    const cases = Array.isArray(m.cases) ? m.cases.map(Number) : [];
    if (!cases.length || cases.length > BATTLE_MAX_ROUNDS) fail(`Add 1 to ${BATTLE_MAX_ROUNDS} cases`);
    if (cases.some(id => !Number.isInteger(id) || !CASES[id])) fail('Unknown case');
    if ([...this.battles.values()].filter(b => b.creator === u.id && b.state === 'open').length >= 3) fail('You can have 3 open battles at a time');
    const cost = cases.reduce((a, id) => a + CASES[id].price, 0);
    const esc = this.take(u, cost, 'Case Battle');
    const seats = Array(BATTLE_MODES[m.mode].seats).fill(null);
    seats[0] = { uid: u.id, name: u.name, bot: false, lvl: levelOf(u.wagered), esc, total: 0, drops: [] };
    const b = { id: this.battleSeq++, mode: m.mode, cursed: !!m.cursed, cases, cost, seats, state: 'open', round: -1, roundAt: 0, creator: u.id, winners: null, pot: 0 };
    this.battles.set(b.id, b);
    this.pushTable('battles');
    return { id: b.id };
  },
  'battle.join'(sock, m) {
    const u = this.me(sock), b = this.battles.get(Number(m.id));
    if (!b || b.state !== 'open') fail('That battle already started');
    if (b.seats.some(s => s && s.uid === u.id)) fail('You are already in this battle');
    let i = Number.isInteger(m.seat) ? m.seat : b.seats.findIndex(s => !s);
    if (i < 0 || i >= b.seats.length || b.seats[i]) fail('That seat is taken');
    const esc = this.take(u, b.cost, 'Case Battle');
    b.seats[i] = { uid: u.id, name: u.name, bot: false, lvl: levelOf(u.wagered), esc, total: 0, drops: [] };
    this.battleMaybeStart(b);
    this.pushTable('battles');
    return {};
  },
  'battle.bots'(sock, m) {
    const u = this.me(sock), b = this.battles.get(Number(m.id));
    if (!b || b.state !== 'open') fail('That battle already started');
    if (b.creator !== u.id) fail('Only the player who made the battle can call bots');
    const used = new Set(b.seats.filter(Boolean).map(s => s.name));
    const pool = shuffle(BOT_NAMES.filter(n => !used.has(n)));
    b.seats = b.seats.map(s => s || { uid: null, name: pool.pop(), bot: true, lvl: 1 + rint(14), esc: 0, total: 0, drops: [] });
    this.battleMaybeStart(b);
    this.pushTable('battles');
    return {};
  },
  'battle.leave'(sock, m) {
    const u = this.me(sock), b = this.battles.get(Number(m.id));
    if (!b || b.state !== 'open') fail('That battle already started');
    if (b.creator === u.id) {
      for (const s of b.seats) if (s && !s.bot) this.refund(s.uid, b.cost, s.esc);
      this.battles.delete(b.id);
    } else {
      const i = b.seats.findIndex(s => s && s.uid === u.id);
      if (i < 0) fail('You are not in this battle');
      this.refund(u.id, b.cost, b.seats[i].esc);
      b.seats[i] = null;
    }
    this.pushTable('battles');
    return {};
  },

  /* ----- baccarat ----- */
  'bac.play'(sock, m) {
    const u = this.me(sock), bets = {};
    let total = 0;
    for (const k of ['player', 'banker', 'tie']) { const v = Math.floor(Number(m[k]) || 0); if (v < 0) fail('Invalid bet'); if (v) { bets[k] = this.amount(v); total += bets[k]; } }
    if (!total) fail('Put a bet on Player, Banker or Tie');
    this.take(u, total, 'Baccarat', { instant: true });
    const r = bacPlay(drawCard);
    const payout = Math.floor(r.winner === 'tie' ? (bets.tie || 0) * BAC_PAY.tie + (bets.player || 0) + (bets.banker || 0) : (bets[r.winner] || 0) * BAC_PAY[r.winner]);
    this.pay(u.id, 'Baccarat', total, payout, payout / total);
    return { P: r.P, B: r.B, p: r.p, b: r.b, winner: r.winner, payout };
  },

  /* ----- video poker ----- */
  'vp.deal'(sock, m) {
    const u = this.me(sock), s = this.so(u.id);
    if (s.vp) fail('Finish your current hand first');
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Video Poker');
    const deck = shuffle(Array.from({ length: 52 }, (_, i) => ({ r: (i % 13) + 1, s: Math.floor(i / 13) })));
    const cards = deck.splice(0, 5);
    s.vp = { bet: amt, cards, deck, esc };
    return { cards, hand: vpHand(cards) };
  },
  'vp.draw'(sock, m) {
    const u = this.me(sock), s = this.so(u.id), g = s.vp;
    if (!g) fail('Deal a hand first');
    const hold = Array.isArray(m.hold) ? m.hold : [];
    const cards = g.cards.map((c, i) => (hold[i] ? c : g.deck.shift()));
    delete s.vp;
    const hand = vpHand(cards), mult = vpMult(hand), payout = Math.floor(g.bet * mult);
    this.pay(u.id, 'Video Poker', g.bet, payout, mult, g.esc);
    return { cards, hand, mult, payout };
  },

  /* ----- diamonds ----- */
  'diamonds.play'(sock, m) {
    const u = this.me(sock), amt = this.amount(m.amount);
    this.take(u, amt, 'Diamonds', { instant: true });
    const gems = Array.from({ length: 5 }, () => rint(DIAMOND_COLORS));
    const hand = diamondsHand(gems), mult = diamondsMult(hand), payout = Math.floor(amt * mult);
    this.pay(u.id, 'Diamonds', amt, payout, mult);
    return { gems, hand, mult, payout };
  },

  /* ----- pump ----- */
  'pump.start'(sock, m) {
    const u = this.me(sock), s = this.so(u.id);
    if (s.pump) fail('Finish your current balloon first');
    const d = PUMP[m.diff] ? m.diff : fail('Pick a difficulty');
    const amt = this.amount(m.amount);
    const esc = this.take(u, amt, 'Pump');
    s.pump = { bet: amt, diff: d, k: 0, slots: shuffle([...Array(25).keys()].map(i => i < PUMP[d].pops)), esc };
    return {};
  },
  'pump.pump'(sock) {
    const u = this.me(sock), s = this.so(u.id), g = s.pump;
    if (!g) fail('Start a round first');
    if (g.slots[g.k]) { delete s.pump; this.pay(u.id, 'Pump', g.bet, 0, 0, g.esc); return { pop: true, k: g.k }; }
    g.k++;
    const mult = pumpMult(g.diff, g.k);
    if (g.k >= 25 - PUMP[g.diff].pops) {
      delete s.pump;
      const payout = Math.floor(g.bet * mult);
      this.pay(u.id, 'Pump', g.bet, payout, mult, g.esc);
      return { pop: false, done: true, k: g.k, mult, payout };
    }
    return { pop: false, k: g.k, mult, next: pumpMult(g.diff, g.k + 1) };
  },
  'pump.cashout'(sock) {
    const u = this.me(sock), s = this.so(u.id), g = s.pump;
    if (!g || !g.k) fail('Pump at least once first');
    delete s.pump;
    const mult = pumpMult(g.diff, g.k), payout = Math.floor(g.bet * mult);
    this.pay(u.id, 'Pump', g.bet, payout, mult, g.esc);
    return { mult, payout, k: g.k };
  },

  /* ----- upgrader ----- */
  'upgrade.play'(sock, m) {
    const u = this.me(sock), amt = this.amount(m.amount);
    const mult = Math.floor(Number(m.mult) * 100) / 100;
    if (!(mult >= UPG_MIN && mult <= UPG_MAX)) fail(`Pick ${UPG_MIN}× to ${UPG_MAX}×`);
    this.take(u, amt, 'Upgrader', { instant: true });
    const chance = upgChance(mult), roll = rnd(), win = roll < chance;
    const payout = win ? Math.floor(amt * mult) : 0;
    this.pay(u.id, 'Upgrader', amt, payout, win ? mult : 0);
    return { roll, chance, win, mult, payout };
  },

  /* ----- chat + tips ----- */
  'chat.send'(sock, m) {
    const u = this.me(sock), t = Date.now();
    if ((u.mutedUntil || 0) > t) fail(`You're muted for ${Math.ceil((u.mutedUntil - t) / 60000)} more minute(s)`);
    if (!this.cfg.chatOn && !u.admin) fail('Chat is closed right now');
    const raw = String(m.text || '').replace(/\s+/g, ' ').trim();
    if (!raw) fail('Type a message first');
    const tip = raw.match(/^\/tip\s+@?(\S+)\s+([\d.]+)$/i);
    if (tip) return HANDLERS['chat.tip'].call(this, sock, { to: tip[1], amount: Math.round(parseFloat(tip[2]) * CENTS) });
    if (raw[0] === '/') fail('Unknown command. To tip, type /tip name amount');
    if (t - (u.chatAt || 0) < this.cfg.chatSlow * 1000) fail('Slow down a little');
    u.chatAt = t;
    const text = cleanChat(raw);
    if (!text) fail('Type a message first');
    this.addChat({ kind: 'msg', uid: u.id, name: u.name, lvl: levelOf(u.wagered), text, ts: t });
    return {};
  },
  'chat.tip'(sock, m) {
    const u = this.me(sock), t = Date.now();
    if (!this.cfg.tips) fail('Tips are turned off right now');
    if (u.wagered < TIP_MIN_WAGERED * CENTS) fail(`Bet at least ${TIP_MIN_WAGERED} coins in total before you can send tips`);
    if (t - (u.tipAt || 0) < 3000) fail('Wait a few seconds between tips');
    const row = this.q1('SELECT id FROM users WHERE name=? COLLATE NOCASE', String(m.to || '').replace(/^@/, '').trim());
    const r = row && this.getUser(row.id);
    if (!r || r.banned) fail('No player with that name');
    if (r.id === u.id) fail('You cannot tip yourself');
    const amt = this.amount(m.amount);
    if (amt < TIP_MIN_COINS * CENTS) fail(`Tips start at ${TIP_MIN_COINS} coin`);
    if (amt > u.balance) fail(`You only have ${coins(u.balance)} coins`);
    u.tipAt = t;
    u.balance -= amt; r.balance += amt;
    this.save(u); this.save(r); this.pushMe(u.id); this.pushMe(r.id);
    this.toast(r.id, `${u.name} tipped you ${coins(amt)} coins`, 'good', { coins: 30 });
    this.addChat({ kind: 'tip', uid: u.id, name: u.name, lvl: levelOf(u.wagered), toId: r.id, to: r.name, amount: amt, ts: t });
    return { amount: amt, to: r.name };
  },
  'chat.delete'(sock, m) {
    this.adminOf(sock);
    this.removeChat(x => x.id === Number(m.id));
    return {};
  },

  /* ----- admin (the first account is the owner; the owner can make more admins) ----- */
  'admin.overview'(sock) {
    const a = this.adminOf(sock);
    const r = this.q1('SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS coins, COALESCE(SUM(banned), 0) AS banned FROM users') || {};
    return { players: r.n || 0, coins: r.coins || 0, banned: r.banned || 0, online: this.conn.size, rain: this.rain.pot, rainEndsAt: this.rain.endsAt, owner: this.isOwner(a), cfg: this.cfg, announce: this.announce, log: (this.kvGet('adminlog') || []).slice(0, 40) };
  },
  'admin.find'(sock, m) {
    this.adminOf(sock);
    const q = String(m.q || '').toLowerCase(), own = this.ownerId();
    let rows;
    if (m.online) rows = [...this.conn.keys()].map(id => this.getUser(id)).filter(u => u && u.name.toLowerCase().includes(q)).map(u => ({ id: u.id }));
    else rows = this.q('SELECT id FROM users WHERE name LIKE ? ORDER BY last_seen DESC LIMIT 40', '%' + q.replace(/[%_]/g, '') + '%');
    return rows.map(r => this.getUser(r.id)).filter(Boolean).map(u => ({
      id: u.id, name: u.name, balance: u.balance, wagered: u.wagered, won: u.won, bets: u.bets, level: levelOf(u.wagered),
      admin: u.admin, banned: u.banned, owner: u.id === own, online: this.conn.has(u.id), mutedUntil: u.mutedUntil || 0, created: u.created,
    }));
  },
  'admin.grant'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id, true);
    const amt = Math.round(Number(m.amount));
    if (!Number.isFinite(amt) || !amt || Math.abs(amt) > MAX_BET) fail('Invalid amount');
    u.balance = Math.max(0, u.balance + amt); this.save(u); this.pushMe(u.id);
    if (amt > 0) this.toast(u.id, `An admin gave you ${coins(amt)} coins`, 'good', { coins: 40 });
    this.alog(a, `${amt > 0 ? 'Gave' : 'Took'} ${coins(Math.abs(amt))} coins ${amt > 0 ? 'to' : 'from'} ${u.name}`);
    return { balance: u.balance };
  },
  'admin.set'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id, true);
    const v = Math.round(Number(m.balance));
    if (!Number.isFinite(v) || v < 0 || v > MAX_BET * 100) fail('Invalid amount');
    u.balance = v; this.save(u); this.pushMe(u.id);
    this.alog(a, `Set ${u.name}'s coins to ${coins(v)}`);
    return { balance: v };
  },
  'admin.ban'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id);
    u.banned = !!m.banned; this.save(u);
    if (u.banned) { this.kickSocks(u.id, 'This account has been banned'); this.removeChat(x => x.uid === u.id); }
    this.alog(a, `${u.banned ? 'Banned' : 'Unbanned'} ${u.name}`);
    return { banned: u.banned };
  },
  'admin.kick'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id);
    this.kickSocks(u.id, 'An admin logged you out');
    this.alog(a, `Logged out ${u.name}`);
    return {};
  },
  'admin.rename'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id, true);
    const name = checkName(m.name), old = u.name;
    const other = this.q1('SELECT id FROM users WHERE name=? COLLATE NOCASE', name);
    if (other && other.id !== u.id) fail('That name is taken');
    u.name = name; this.save(u); this.pushMe(u.id);
    this.alog(a, `Renamed ${old} to ${name}`);
    return { name };
  },
  'admin.mute'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id);
    const mins = Math.max(0, Math.min(525600, Math.floor(Number(m.minutes) || 0)));
    u.mutedUntil = mins ? Date.now() + mins * 60000 : 0; this.save(u);
    if (mins) this.addChat({ kind: 'sys', text: `${u.name} was muted for ${mins >= 1440 ? Math.round(mins / 1440) + ' day(s)' : mins >= 60 ? Math.round(mins / 60) + ' hour(s)' : mins + ' minutes'}` });
    this.alog(a, mins ? `Muted ${u.name} for ${mins} minutes` : `Unmuted ${u.name}`);
    return { mutedUntil: u.mutedUntil };
  },
  'admin.stats'(sock, m) {
    const a = this.adminOf(sock), u = this.targetOf(a, m.id, true);
    Object.assign(u, { wagered: 0, won: 0, bets: 0, best: 0, bestMult: 0, bestGame: '', rake: 0 });
    this.save(u); this.pushMe(u.id);
    this.alog(a, `Reset ${u.name}'s level and stats`);
    return {};
  },
  'admin.role'(sock, m) {
    const a = this.adminOf(sock);
    if (!this.isOwner(a)) fail('Only the owner (the first account) can add or remove admins');
    const u = this.targetOf(a, m.id);
    u.admin = !!m.admin; this.save(u); this.pushMe(u.id);
    this.toast(u.id, u.admin ? 'You are now an admin. Open the Admin page from the menu' : 'You are no longer an admin', u.admin ? 'good' : '');
    this.alog(a, `${u.admin ? 'Made' : 'Removed'} ${u.name} ${u.admin ? 'an admin' : 'as admin'}`);
    return { admin: u.admin };
  },
  'admin.giveall'(sock, m) {
    const a = this.adminOf(sock), amt = this.amount(m.amount);
    let n = 0;
    if (m.online) {
      for (const uid of this.conn.keys()) { const u = this.getUser(uid); if (u && !u.banned) { u.balance += amt; this.save(u); this.pushMe(uid); n++; } }
    } else {
      this.q('UPDATE users SET balance = balance + ? WHERE banned = 0', amt);
      this.forAllUsers(u => { if (!u.banned) u.balance += amt; });
      n = (this.q1('SELECT COUNT(*) AS n FROM users WHERE banned = 0') || {}).n || 0;
      for (const uid of this.conn.keys()) this.pushMe(uid);
    }
    for (const uid of this.conn.keys()) this.toast(uid, `An admin gave everyone ${coins(amt)} coins!`, 'good', { coins: 60 });
    this.addChat({ kind: 'sys', text: `An admin gave ${m.online ? 'everyone online' : 'everyone'} ${coins(amt)} coins` });
    this.alog(a, `Gave ${coins(amt)} coins to ${n} ${m.online ? 'online ' : ''}players`);
    return { n };
  },
  'admin.reset'(sock, m) {
    const a = this.adminOf(sock);
    if (String(m.confirm || '').trim().toUpperCase() !== 'RESET') fail('Type RESET to confirm');
    const bal = Math.round(Number(m.balance));
    if (!Number.isFinite(bal) || bal < 0 || bal > MAX_BET) fail('Invalid amount');
    const stats = !!m.stats;
    this.q(stats ? "UPDATE users SET balance=?, wagered=0, won=0, bets=0, best=0, best_mult=0, best_game='', rake=0" : 'UPDATE users SET balance=?', bal);
    this.forAllUsers(u => { u.balance = bal; if (stats) Object.assign(u, { wagered: 0, won: 0, bets: 0, best: 0, bestMult: 0, bestGame: '', rake: 0 }); });
    this.q('DELETE FROM escrow'); // open bets still pay out, but are no longer refunded on a restart
    this.rain.pot = this.rainBase(); this.rainDirty = true;
    for (const uid of this.conn.keys()) { this.pushMe(uid); this.toast(uid, `An admin reset everyone's coins to ${coins(bal)}`, '', {}); }
    this.addChat({ kind: 'sys', text: `An admin reset everyone's coins to ${coins(bal)}${stats ? ' and reset all levels' : ''}` });
    this.alog(a, `Reset everyone's coins to ${coins(bal)}${stats ? ' and reset levels and stats' : ''}`);
    return {};
  },
  'admin.rain'(sock, m) {
    const a = this.adminOf(sock), add = Math.floor(Number(m.amount) || 0);
    if (add < 0 || add > MAX_BET) fail('Invalid amount');
    if (!add && !m.now) fail('Add coins or make it rain now');
    if (add) this.rain.pot += add;
    if (m.now) this.rain.endsAt = Date.now();
    this.kvSet('rain', this.rain); this.broadcastRain();
    this.alog(a, [add ? `Added ${coins(add)} coins to the rain` : '', m.now ? 'Made it rain now' : ''].filter(Boolean).join(' and '));
    return { pot: this.rain.pot };
  },
  'admin.announce'(sock, m) {
    const a = this.adminOf(sock), text = cleanChat(m.text);
    this.announce = text ? { text, by: a.name, ts: Date.now() } : null;
    this.kvSet('announce', this.announce);
    this.broadcast({ t: 'announce', a: this.announce });
    if (text) this.addChat({ kind: 'sys', text: 'Announcement: ' + text });
    this.alog(a, text ? `Announced "${text}"` : 'Removed the announcement');
    return { announce: this.announce };
  },
  'admin.clearchat'(sock) {
    const a = this.adminOf(sock);
    this.chat = []; this.chatDirty = true;
    this.broadcast({ t: 'chat', items: [] });
    this.alog(a, 'Cleared the chat');
    return {};
  },
  'admin.settings'(sock, m) {
    const a = this.adminOf(sock);
    if (m.set && typeof m.set === 'object') {
      const before = this.cfg;
      this.cfg = cleanSettings({ ...this.cfg, ...m.set });
      this.kvSet('settings', this.cfg);
      if (this.rain.pot > this.rainCap()) { this.rain.pot = this.rainCap(); this.rainDirty = true; }
      this.broadcast({ t: 'cfg', cfg: this.cfg });
      const changed = Object.keys(this.cfg).filter(k => this.cfg[k] !== before[k]).map(k => `${k} ${before[k]} → ${this.cfg[k]}`);
      if (changed.length) this.alog(a, 'Changed settings: ' + changed.join(', '));
    }
    return this.cfg;
  },
};
