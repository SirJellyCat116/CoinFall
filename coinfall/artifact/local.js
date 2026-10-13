// Claude page build only: runs the real Coinfall game server inside the page, fills the live
// tables with labeled bots, and saves the player's wallet to the page's shared database
// (or this browser if the page can't save). Expects CasinoCore and SH (shared.js exports) in scope.
const LOCAL_BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'slut', 'whore', 'dick', 'cock', 'pussy', 'rape', 'nazi', 'hitler', 'porn', 'sex', 'kys'];
const LS_KEY2 = 'coinfall.local.v2', LS_KEY1 = 'coinfall.wallet.v1';
const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const BOT_LINES = ['gg', 'anyone want a 1v1 battle?', 'crash is cursed today', 'lets gooo', 'rip my balance', 'who is joining the rain', 'roulette keeps hitting red', 'nice', 'free case gave me like 2 coins lol', 'blackjack table is open', 'jackpot timer going, hop in', 'just hit 5x on plinko', 'finally level 3', 'this rain better be big', 'gl everyone', 'mines is my favorite', 'towers on hard is insane', 'cursed battles are so fun', 'who wants to flip', 'ok one more spin', 'hi', 'wb', 'lol', 'that was close', 'keno never hits for me'];
const BOT_NAMES = ['Kayden_07', 'mila.rose', 'TurboTaco', 'xNova', 'Jaxon22', 'sunnyside', 'LilChris', 'GhostPanda', 'ava_plays', 'Brody88', 'NoScopeNate', 'peachyy', 'Zayn_x', 'coolbeans44', 'Harper_J', 'MrWaffles', 'Lunaaa', 'deku_fan', 'Tyler_W', 'skyy', 'FrostByte', 'emmaaa_', 'Rico99', 'pixelpup', 'Maddox', 'jellyjam', 'Owen.K', 'StormyDays', 'CamCam', 'nightowl3', 'Leo_V', 'Bubbles21', 'Riley_R', 'KingKai', 'zoey.x', 'MangoMike', 'Ethan_P', 'shadowfox', 'Ivy', 'Dash_44'];
const between = (a, b) => a + Math.random() * (b - a);

// v1 of this page stored coins; v2 stores cents.
function fromDoc(d, id) {
  const n = x => (Number.isFinite(+x) ? +x : 0);
  const k = d.v === 2 ? 1 : 100;
  return {
    id, name: String(d.name || 'Player').slice(0, 16),
    balance: Math.round(n(d.balance) * k), wagered: Math.round(n(d.wagered) * k), won: Math.round(n(d.won) * k),
    bets: n(d.bets), best: Math.round(n(d.best) * k), bestMult: n(d.bestMult), bestGame: String(d.bestGame || ''),
    hourlyAt: n(d.hourlyAt) || Date.now(), dailyAt: n(d.dailyAt), created: n(d.created) || Date.now(), admin: false, banned: false,
    rake: d.v === 2 ? n(d.rake) : 0, free: d.v === 2 && d.free && typeof d.free === 'object' ? { ...d.free } : {},
  };
}

class LocalCore extends CasinoCore {
  // Tiny stand-in for the SQL the server uses for escrow and settings; players live in this.users.
  q(query, ...p) {
    const st = this.__st || (this.__st = { kv: new Map(), esc: new Map(), seq: 0 });
    if (query.startsWith('SELECT v FROM kv')) { const v = st.kv.get(p[0]); return v == null ? [] : [{ v }]; }
    if (query.startsWith('INSERT INTO kv')) { st.kv.set(p[0], p[1]); return []; }
    if (query.startsWith('INSERT INTO escrow')) { const id = ++st.seq; st.esc.set(id, { uid: p[0], amount: p[1] }); return [{ id }]; }
    if (query.startsWith('DELETE FROM escrow WHERE id')) { st.esc.delete(p[0]); return []; }
    if (query === 'DELETE FROM escrow') { st.esc.clear(); return []; }
    if (query.startsWith('SELECT id FROM users WHERE name=?')) { const n = String(p[0]).toLowerCase(); for (const u of this.users.values()) if (u.name.toLowerCase() === n) return [{ id: u.id }]; return []; }
    return [];
  }
  openEscrow(uid) { let s = 0; for (const e of (this.__st ? this.__st.esc.values() : [])) if (e.uid === uid) s += e.amount; return s; }
  online() { let n = 0; for (const s of this.socks) if (!s.bot) n++; return n; }
  save(u) { if (this.human && u === this.human) this.persistSoon(); }

  persistSoon() { clearTimeout(this.pt); this.pt = setTimeout(() => this.persist(), 800); }
  async persist() {
    clearTimeout(this.pt);
    const u = this.human;
    if (!u) return;
    const doc = { v: 2, name: u.name, balance: u.balance + this.openEscrow(u.id), wagered: u.wagered, won: u.won, bets: u.bets, best: u.best, bestMult: u.bestMult, bestGame: u.bestGame, hourlyAt: u.hourlyAt, dailyAt: u.dailyAt, created: u.created, rake: u.rake || 0, free: u.free || {}, updatedAt: Date.now() };
    if (this.store === 'shared') {
      if (this.saving) { this.persistSoon(); return; }
      this.saving = true;
      try { await this.db.doc('players/' + u.id).set(doc); }
      catch (e) {
        if (!(e && (e.code === 'unavailable' || e.code === 'resource_exhausted'))) { this.store = 'browser'; lsSet(LS_KEY2, doc); this.toast(u.id, 'Your coins are now saved in this browser only.', 'bad'); }
        else this.persistSoon();
      }
      this.saving = false;
    } else lsSet(LS_KEY2, doc);
  }

  async message(sock, raw) {
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    const h = m && LOCAL_HANDLERS[m.t];
    if (!h) return super.message(sock, raw);
    try { this.reply(sock, m, await h.call(this, sock, m)); }
    catch (e) { this.reply(sock, m, null, e.message || 'Something went wrong'); }
  }

  /* ---------- bots ---------- */
  setupBots() {
    const pool = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    this.bots = pool.slice(0, 5).map((nm, i) => {
      const u = { id: 'bot' + i, name: nm, balance: 5e6, wagered: 0, won: 0, bets: 0, best: 0, bestMult: 0, bestGame: '', hourlyAt: Date.now(), dailyAt: 0, created: Date.now(), admin: false, banned: false };
      this.users.set(u.id, u);
      const sock = { bot: true, send() { } };
      this.open(sock); this.attach(sock, u.id);
      return { u, sock, mem: {} };
    });
    this.botAt = 0; this.botFlipAt = 0;
  }
  act(bot, t, d = {}) { return super.message(bot.sock, JSON.stringify({ ...d, t })); }
  tick() { super.tick(); const t = Date.now(); if (this.bots && t - this.botAt > 500) { this.botAt = t; try { this.botTick(t); } catch (e) { this.log(e); } } }
  isBot(uid) { return typeof uid === 'string' && uid.startsWith('bot'); }
  addChat(msg) {
    const out = super.addChat(msg);
    if (msg.kind === 'tip' && this.isBot(msg.toId) && this.bots) {
      const b = this.bots.find(x => x.u.id === msg.toId);
      if (b) setTimeout(() => this.act(b, 'chat.send', { text: pickOne(['ty ' + msg.name + '!', 'thanks!!', 'tysm', 'omg thank you', 'appreciate it']) }), 1500 + Math.random() * 2500);
    }
    return out;
  }
  botTick(t) {
    for (const b of this.bots) if (b.u.balance < 100000) b.u.balance = 5e6;
    if (t > (this.botChatAt || 0)) { if (this.botChatAt) this.act(pickOne(this.bots), 'chat.send', { text: pickOne(BOT_LINES) }); this.botChatAt = t + between(25000, 75000); }
    const human = this.human && this.conn.has(this.human.id) ? this.human : null;
    // Roulette: some bots bet every spin
    const r = this.rl;
    if (r.phase === 'betting' && r.endsAt - t > 2500) {
      for (const b of this.bots) {
        if (b.mem.rl === r.spin || Math.random() > 0.2) continue;
        b.mem.rl = r.spin;
        if (Math.random() < 0.55) {
          const spots = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3', 'n' + Math.floor(Math.random() * 37)];
          const bets = [[pickOne(spots), pickOne([100, 500, 1000, 2500])]];
          if (Math.random() < 0.4) bets.push(['n' + Math.floor(Math.random() * 37), pickOne([100, 500])]);
          this.act(b, 'rl.bet', { bets });
        }
      }
    }
    // Crash: most bots ride most rounds
    const c = this.cr;
    if (c.phase === 'betting' && c.endsAt - t > 1200) {
      for (const b of this.bots) {
        if (b.mem.cr === c.endsAt || Math.random() > 0.3) continue;
        b.mem.cr = c.endsAt;
        if (Math.random() < 0.65) this.act(b, 'cr.bet', { amount: pickOne([500, 1000, 2500, 5000]), auto: Math.random() < 0.15 ? between(5, 20) : between(1.2, 3.5) });
      }
    }
    // Blackjack: two bots keep seats and play along once a person bets
    const bj = this.bj;
    for (const [i, b] of [[4, this.bots[0]], [5, this.bots[1]]]) {
      if (!bj.seats.some(s => s && s.uid === b.u.id) && !bj.seats[i] && (bj.phase === 'idle' || bj.phase === 'betting')) this.act(b, 'bj.sit', { seat: i });
    }
    if (bj.phase === 'betting') {
      for (const b of this.bots.slice(0, 2)) {
        const seat = bj.seats.find(s => s && s.uid === b.u.id);
        if (!seat || seat.bet) continue;
        if (!b.mem.bjAt) b.mem.bjAt = t + between(800, 2500);
        if (t >= b.mem.bjAt) { b.mem.bjAt = 0; this.act(b, 'bj.bet', { amount: pickOne([500, 1000, 2500]) }); }
      }
    }
    if (bj.phase === 'playing' && bj.turn) {
      const seat = bj.seats[bj.turn.s];
      if (seat && this.isBot(seat.uid)) {
        const hand = seat.hands[bj.turn.h], key = `${bj.turn.s}-${bj.turn.h}-${hand.cards.length}`;
        if (this.bjKey !== key) { this.bjKey = key; this.bjKeyAt = t; }
        else if (t - this.bjKeyAt > 1000) {
          const v = SH.bjValue(hand.cards);
          const b = this.bots.find(x => x.u.id === seat.uid);
          this.act(b, 'bj.act', { a: v.t < 17 || (v.soft && v.t === 17) ? 'hit' : 'stand' });
          this.bjKey = '';
        }
      }
    }
    // Jackpot: a bot answers when a person is alone in the pot, sometimes a second one joins
    const j = this.jp;
    if (j.phase === 'open' && human) {
      const alone = j.entries.length === 1 && j.entries[0].uid === human.id;
      if (alone) {
        if (!this.jpAt) this.jpAt = t + between(2000, 5000);
        if (t >= this.jpAt) {
          this.jpAt = 0;
          const amt = Math.max(100, Math.round(j.entries[0].amount * between(0.4, 1.6)));
          this.act(pickOne(this.bots), 'jp.deposit', { amount: amt });
        }
      } else this.jpAt = 0;
      if (j.endsAt && j.entries.length === 2 && j.entries.some(e => e.uid === human.id) && !this.jp2[j.round]) {
        this.jp2[j.round] = true;
        if (Math.random() < 0.4) {
          const free = this.bots.filter(b => !j.entries.some(e => e.uid === b.u.id));
          const total = j.entries.reduce((a, e) => a + e.amount, 0);
          setTimeout(() => { if (this.jp.phase === 'open' && this.jp.round === j.round) this.act(pickOne(free), 'jp.deposit', { amount: Math.max(100, Math.round(total * between(0.2, 0.7))) }); }, between(5000, 15000));
        }
      }
    }
    // Coinflip: bots take the other side of a person's flip, and keep a couple of flips open to join
    for (const f of this.flips.values()) {
      if (f.state !== 'open' || this.isBot(f.uid)) continue;
      if (!f.botAt) f.botAt = t + between(3000, 7000);
      if (t >= f.botAt) this.act(pickOne(this.bots), 'cf.join', { id: f.id });
    }
    // Case battles: keep one open bot battle to join, and fill the rest with bots once a person joins
    const openBattles = [...this.battles.values()].filter(x => x.state === 'open');
    for (const x of openBattles) {
      if (!this.isBot(x.creator)) continue;
      const hasHuman = x.seats.some(st => st && !st.bot && !this.isBot(st.uid));
      if (hasHuman) { if (!x.fillAt) x.fillAt = t + 2500; if (t >= x.fillAt) this.act(this.bots.find(q => q.u.id === x.creator), 'battle.bots', { id: x.id }); }
      else if (t - (x.made || (x.made = t)) > 240000) this.act(this.bots.find(q => q.u.id === x.creator), 'battle.leave', { id: x.id });
    }
    if (!openBattles.some(x => this.isBot(x.creator)) && t > (this.botBattleAt || 0)) {
      this.botBattleAt = t + between(15000, 40000);
      const long = Math.random() < 0.2; // sometimes a long battle of tiny cases
      const cheap = SH.CASES.filter(c => c.price <= (long ? 300 : 2000));
      const n = long ? 10 + Math.floor(Math.random() * 11) : 1 + Math.floor(Math.random() * 4);
      this.act(pickOne(this.bots), 'battle.create', { mode: pickOne(['1v1', '1v1', '1v1v1', '2v2', '1v1v1v1']), cursed: Math.random() < 0.25, cases: Array.from({ length: n }, () => pickOne(cheap).id) });
    }
    const botOpen = [...this.flips.values()].filter(f => f.state === 'open' && this.isBot(f.uid));
    for (const f of botOpen) if (t - (f.made || (f.made = t)) > 180000) this.act(this.bots.find(b => b.u.id === f.uid), 'cf.cancel', { id: f.id });
    if (botOpen.length < 2 && t > this.botFlipAt) {
      this.botFlipAt = t + between(8000, 20000);
      const b = pickOne(this.bots.filter(x => !botOpen.some(f => f.uid === x.u.id)));
      if (b) this.act(b, 'cf.create', { amount: pickOne([500, 1000, 2500, 5000]), side: Math.random() < 0.5 ? 'heads' : 'tails' });
    }
  }
}

const LOCAL_HANDLERS = {
  hello(sock) { if (!this.human) throw new Error('expired'); this.attach(sock, this.human.id); return { me: this.pub(this.human, true) }; },
  login(sock, m) { return LOCAL_HANDLERS.register.call(this, sock, m); },
  register(sock, m) {
    if (!this.human) {
      const name = String(m.name || '').trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Names are 3–16 letters, numbers or underscores');
      if (LOCAL_BAD.some(w => name.toLowerCase().includes(w))) throw new Error('Please pick a different name');
      if (this.bots.some(b => b.u.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is taken');
      const now = Date.now();
      this.human = { id: this.uid, name, balance: SH.WELCOME_COINS * SH.CENTS, wagered: 0, won: 0, bets: 0, best: 0, bestMult: 0, bestGame: '', hourlyAt: now, dailyAt: 0, created: now, admin: false, banned: false, rake: 0, free: {} };
      this.users.set(this.human.id, this.human);
      this.persist();
      this.attach(sock, this.human.id);
      return { token: 'local', me: this.pub(this.human, true), welcome: true };
    }
    this.attach(sock, this.human.id);
    return { token: 'local', me: this.pub(this.human, true) };
  },
  logout() { return {}; },
  lb(sock, m) {
    const rows = new Map();
    for (const [id, d] of this.board || []) rows.set(id, d);
    if (this.human) rows.set(this.human.id, this.pub(this.human));
    const key = { profit: p => p.won - p.wagered, balance: p => p.balance, best: p => p.best, wagered: p => p.wagered }[m.tab] || (p => p.won - p.wagered);
    return [...rows.values()].sort((a, b) => key(b) - key(a)).slice(0, 50);
  },
  'admin.find'() { throw new Error('Admins only'); },
};

// The page's "server": loads the player, then hands out fake sockets that talk to it.
const LocalServer = { core: null };
LocalServer.ready = (async () => {
  let db = null, user = null, uid = null, canW = null, saved = null, store = 'browser';
  if (window.claude && typeof window.claude.use === 'function') {
    try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch { }
    try { uid = user ? await user.id() : null; } catch { }
    try { canW = user ? await user.can('data.write') : null; } catch { }
  }
  if (db && uid && canW !== false) {
    try { const s = await db.doc('players/' + uid).get(); if (s.exists) saved = s.data(); store = 'shared'; } catch { }
  }
  if (store !== 'shared') saved = lsGet(LS_KEY2) || lsGet(LS_KEY1);
  const core = new LocalCore(null, { log: e => console.error(e) });
  core.uid = uid || 'me'; core.db = db; core.store = store; core.jp2 = {};
  if (saved && saved.name) { core.human = fromDoc(saved, core.uid); core.users.set(core.human.id, core.human); }
  if (db) {
    try {
      db.collection('players').onSnapshot(snap => {
        core.board = new Map();
        for (const d of snap.docs) { const v = d.data(); if (v && v.name) { const p = fromDoc(v, d.id); core.board.set(d.id, { id: d.id, name: p.name, balance: p.balance, wagered: p.wagered, won: p.won, bets: p.bets, best: p.best, bestMult: p.bestMult, bestGame: p.bestGame }); } }
      }, () => { });
    } catch { }
  }
  core.setupBots();
  addEventListener('pagehide', () => core.persist());
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') core.persist(); });
  LocalServer.core = core;
})();

class LocalSocket {
  constructor() {
    this.onopen = this.onmessage = this.onclose = null;
    LocalServer.ready.then(() => {
      const core = LocalServer.core;
      this.sock = { send: s => queueMicrotask(() => this.onmessage && this.onmessage({ data: s })) };
      core.open(this.sock);
      if (core.human) core.attach(this.sock, core.human.id);
      if (this.onopen) this.onopen();
    });
  }
  send(str) { LocalServer.core.message(this.sock, str); }
  close() { }
}
LocalSocket.local = true;
window.CoinfallSocket = LocalSocket;
