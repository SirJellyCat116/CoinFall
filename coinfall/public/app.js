// Coinfall browser app. Talks to the game server over one WebSocket; the server decides every result.
import * as R from './shared.js';
import { sfx, Sound } from './sound.js';

/* ================= utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TAU = Math.PI * 2;
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const HOUR = 3600e3, DAY = 86400e3;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = c => ((Number(c) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = c => { const x = c / 100; return x >= 1e6 ? +(x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? +(x / 1e3).toFixed(1) + 'K' : String(+x.toFixed(2)); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = n => (String(n || '?').trim()[0] || '?');
const hue = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = () => Math.random();
const mmss = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const secs = ms => Math.max(0, Math.ceil(ms / 1000)) + 's';
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { } } };
const C = {};
function readColors() { const cs = getComputedStyle(document.documentElement); for (const k of ['gold', 'gold-hi', 'gold-deep', 'gold-ink', 'win', 'win-deep', 'lose', 'line', 'dim', 'muted', 'fg', 'bg', 'panel', 'panel-2', 'panel-3', 'peg', 'ball', 'rl-red', 'rl-black', 'rl-green', 'rain', 'chip-3', 'chip-6', 'card']) C[k] = cs.getPropertyValue('--' + k).trim(); }
const hexRgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
function fitCanvas(cv) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}
const lvlTier = l => (l >= 100 ? 5 : l >= 50 ? 4 : l >= 20 ? 3 : l >= 10 ? 2 : l >= 5 ? 1 : 0);
const lvlTag = l => (l ? `<em class="lv t${lvlTier(l)}" title="Level ${l}">${l}</em>` : '');
const avatar = (name, cls = '') => `<span class="ava ${cls}" style="--h:${hue(name)}">${esc(initial(name))}</span>`;
const SUITS = ['♠', '♥', '♦', '♣'];
const cardHtml = (c, cls = '') => c ? `<div class="pc${c.s === 1 || c.s === 2 ? ' red' : ''} ${cls}"><b>${R.RANKS[c.r]}</b><i>${SUITS[c.s]}︎</i></div>` : `<div class="pc back ${cls}"></div>`;

/* ================= state ================= */
const S = { me: null, latest: null, hold: 0, token: ls.get('coinfall.token'), offset: 0, view: 'lobby', tables: {}, rain: null, feed: [], lbTab: 'profit' };
const srvNow = () => Date.now() + S.offset;
const LOCAL = !!(window.CoinfallSocket && window.CoinfallSocket.local); // Claude page build: game server runs in the page

/* ================= network ================= */
const Net = {
  ws: null, seq: 1, wait: new Map(), up: false, tries: 0,
  connect() {
    let ws;
    try { ws = new (window.CoinfallSocket || WebSocket)((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
    catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.up = true; this.tries = 0; $('#conn').hidden = true; onConnected(); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.up = false;
      for (const w of this.wait.values()) w.rej(new Error('Lost connection to the casino'));
      this.wait.clear();
      sfx.rocket.stop();
      const c = $('#conn'); c.hidden = false; c.textContent = 'Reconnecting to the casino…';
      this.retry();
    };
  },
  retry() { const d = Math.min(8000, 500 * 2 ** this.tries++); setTimeout(() => this.connect(), d); },
  call(t, d = {}) {
    return new Promise((res, rej) => {
      if (!this.up) { rej(new Error('Still connecting. Try again in a moment')); return; }
      const rid = this.seq++;
      this.wait.set(rid, { res, rej });
      this.ws.send(JSON.stringify({ ...d, t, rid }));
      setTimeout(() => { if (this.wait.has(rid)) { this.wait.delete(rid); rej(new Error('The server did not answer. Try again')); } }, 12000);
    });
  },
};
async function act(t, d) {
  if (!S.me) { Auth.open('signup'); return null; }
  try { return await Net.call(t, d); }
  catch (e) { toast(e.message, 'bad'); sfx.error(); return null; }
}
async function onConnected() {
  if (S.token) {
    try { const r = await Net.call('hello', { token: S.token }); onMe(r.me); }
    catch (e) { if (e.message === 'expired') { S.token = null; ls.set('coinfall.token', null); S.me = null; S.latest = null; renderChrome(); } }
  }
  watchCurrent();
  if (S.view === 'leaderboard') loadLB();
  if (S.view === 'lobby') loadLobbyLB();
}
function onMessage(m) {
  switch (m.t) {
    case 'res': { const w = Net.wait.get(m.rid); if (w) { Net.wait.delete(m.rid); m.ok ? w.res(m.d) : w.rej(new Error(m.e)); } break; }
    case 'hi': S.offset = m.now - Date.now(); setOnline(m.online); break;
    case 'online': setOnline(m.n); break;
    case 'me': onMe(m.me); break;
    case 'toast': toast(m.m, m.k); if (m.coins) { coinShower(m.coins); m.k === 'rain' ? sfx.rain() : m.k === 'level' ? sfx.level() : sfx.coin(); } break;
    case 'feed': S.feed = m.items || []; renderFeed(); break;
    case 'win': S.feed.unshift(m.item); S.feed.length = Math.min(S.feed.length, 15); renderFeed(); break;
    case 'rain': S.rain = m.s; renderRain(); break;
    case 'table': onTable(m.game, m.s); break;
    case 'solo': Mines.resume(m.s.mines); Towers.resume(m.s.towers); HiLo.resume(m.s.hilo); break;
    case 'kicked': toast(m.m, 'bad'); logoutLocal(); break;
    case 'chat': Chat.set(m.items || []); break;
    case 'chatmsg': Chat.add(m.m); break;
  }
}
function onTable(game, s) {
  if (!s) return;
  if (s.now) S.offset = s.now - Date.now();
  S.tables[game] = s;
  const g = GAME[game];
  if (g && g.onTable) g.onTable(s);
}
function watchCurrent() {
  if (!Net.up) return;
  const game = LIVE.has(S.view) ? S.view : S.view === 'battles' || S.view === 'battle' ? 'battles' : null;
  Net.call('watch', { game }).then(s => { if (game && s) onTable(game, s); }).catch(() => { });
}
function setOnline(n) { $('#online-n').textContent = String(n); $$('[data-online]').forEach(e => (e.textContent = String(n))); }

/* ================= wallet ================= */
function onMe(me) {
  if (me.now) S.offset = me.now - Date.now();
  const prev = S.me;
  S.latest = me;
  if (!$('#auth-modal').hidden) Auth.close();
  if (S.hold && prev) S.me = { ...me, balance: prev.balance };
  else { S.me = me; renderWallet(prev && me.balance > prev.balance ? 1 : 0); }
  if (!prev) renderChrome();
  renderStats(); renderTimers(); renderRain(); renderLevel();
  $('#me-name').textContent = me.name;
  const a = $('#me-ava'); a.textContent = initial(me.name); a.style.setProperty('--h', hue(me.name));
  $('#admin-link').hidden = !me.admin;
  buildNav();
}
function renderLevel() {
  const me = S.me;
  $('#lvl-chip').hidden = !me;
  const L = me ? me.level || R.levelOf(me.wagered) : 1;
  const lo = R.levelReq(L), hi = R.levelReq(L + 1), w = me ? me.wagered : 0;
  const pct = L >= R.MAX_LEVEL ? 100 : Math.max(0, Math.min(100, ((w - lo) / (hi - lo)) * 100));
  $('#lvl-n').textContent = L;
  $('#lvl-ring').style.setProperty('--p', pct.toFixed(1));
  $('#lvl-pct').textContent = pct < 10 ? pct.toFixed(1) + '%' : Math.floor(pct) + '%';
  $('#lv-num').textContent = L;
  $('#lv-fill').style.width = pct + '%';
  $('#lv-rake-pill').textContent = R.rakePct(L).toFixed(2) + '% rakeback';
  $('#lv-next').textContent = !me ? 'Sign up to start leveling' : L >= R.MAX_LEVEL ? 'Max level. You beat the grind.' : `${fmt(hi - w)} more coins wagered to reach level ${L + 1}`;
  const nextUnlock = R.FREE_CASES.find(c => c.level > L);
  $('#lv-sub').textContent = `${fmt(w)} of ${fmt(hi)} wagered` + (nextUnlock ? ` · the ${nextUnlock.name} unlocks at level ${nextUnlock.level}` : '');
  $('#rake-amt').textContent = fmt(me ? me.rake || 0 : 0);
  $('#rake-btn').disabled = !me || (me.rake || 0) < 1;
  $('#rake-sub').textContent = `You get ${R.rakePct(L).toFixed(2)}% of every bet back` + (L < R.MAX_LEVEL ? `. Level ${L + 1} raises it to ${R.rakePct(L + 1).toFixed(2)}%.` : '.');
  const ready = me ? R.FREE_CASES.filter((c, i) => L >= c.level && srvNow() - ((me.free || {})[i] || 0) >= R.FREE_COOLDOWN).length : 0;
  $('#free-ready-pill').textContent = `${ready} ready`;
  const nb = $('[data-nav="free"] .nb'); if (nb) { nb.textContent = ready; nb.hidden = !ready; }
  const marks = [1, 2, 3, 5, 8, 10, 12, 16, 20, 30, 40, 50, 75, 100];
  $('#road-body').innerHTML = marks.map(m => {
    const un = R.FREE_CASES.filter(c => c.level === m).map(c => c.name);
    const cls = m <= L ? 'reached' : marks.find(x => x > L) === m ? 'next' : '';
    return `<tr class="${cls}"><td>${lvlTag(m)}</td><td class="num">${fmt(R.levelReq(m))}</td><td class="num">${R.rakePct(m).toFixed(2)}%</td><td>${un.length ? un.join(', ') : '—'}</td></tr>`;
  }).join('');
}
function hold(bet) { S.hold++; if (S.me) { S.me = { ...S.me, balance: S.me.balance - bet }; renderWallet(0); } }
function release(payout = 0) {
  S.hold = Math.max(0, S.hold - 1);
  if (S.hold && S.me) { S.me = { ...S.me, balance: S.me.balance + payout }; renderWallet(payout > 0 ? 1 : 0); return; }
  if (S.latest) { const up = S.me && S.latest.balance > S.me.balance; S.me = S.latest; renderWallet(up || payout > 0 ? 1 : 0); renderStats(); }
}
function renderWallet(dir) {
  const t = S.me ? fmt(S.me.balance) : '—';
  $$('[data-bal]').forEach(e => (e.textContent = t));
  if (dir > 0) { const w = $('#wallet'); w.classList.remove('up'); void w.offsetWidth; w.classList.add('up'); }
}
function renderChrome() {
  const on = !!S.me;
  $('#wallet').hidden = !on; $('#me-wrap').hidden = !on; $('#auth-btns').hidden = on;
  $('#hero-cta').innerHTML = on
    ? '<a class="btn-go sm" href="#roulette">Join live roulette</a><a class="btn-ghost" href="#rewards">See rewards</a>'
    : '<button class="btn-go sm" type="button" data-act="signup">Sign up free</button><a class="btn-ghost" href="#roulette">Watch live roulette</a>';
  if (!on) { $('#admin-link').hidden = true; renderWallet(0); }
  buildNav();
  Object.values(GAME).forEach(g => g.onAuth && g.onAuth());
}
function renderStats() {
  const p = S.me;
  if (!p) return;
  const set = (k, v) => { const e = $(`[data-stat="${k}"]`); if (e) e.textContent = v; };
  const net = p.won - p.wagered;
  set('balance', fmt(p.balance)); set('wagered', fmt(p.wagered)); set('won', fmt(p.won)); set('bets', p.bets.toLocaleString('en-US'));
  set('profit', (net > 0 ? '+' : '') + fmt(net));
  set('best', p.best > 0 ? `+${fmt(p.best)} · ${p.bestGame}` : '—');
}
function readBet(g) { const v = parseFloat($('#' + g + '-bet').value); return Number.isFinite(v) ? Math.round(v * 100) : 0; }
function lockBet(g, on) { const i = $('#' + g + '-bet'); if (i) i.disabled = on; $$(`[data-for="${g}-bet"]`).forEach(b => (b.disabled = on)); }
const betBox = g => `<div class="fld"><label class="lbl" for="${g}-bet">Bet amount</label><div class="amt"><span class="coin sm"></span><input id="${g}-bet" type="number" inputmode="decimal" min="0.01" step="0.01" value="5"><button type="button" data-amt="half" data-for="${g}-bet">½</button><button type="button" data-amt="double" data-for="${g}-bet">2×</button><button type="button" data-amt="max" data-for="${g}-bet">Max</button></div></div>`;

/* ================= timers, rain, feed, boards ================= */
function renderTimers() {
  const now = srvNow();
  let left = HOUR, frac = 0;
  if (S.me) { left = Math.max(0, S.me.hourlyAt + HOUR - now); frac = 1 - left / HOUR; }
  const txt = S.me ? mmss(left) : '--:--';
  $$('[data-drop]').forEach(e => (e.textContent = txt));
  $('#drop-bar').style.width = (frac * 100).toFixed(2) + '%';
  $('#hourly-ring').setAttribute('stroke-dashoffset', (326.73 * (1 - frac)).toFixed(2));
  const db = $('#daily-btn');
  if (!S.me) { db.disabled = false; db.textContent = 'Sign up to claim 100 coins'; }
  else { const dl = S.me.dailyAt + DAY - now; db.disabled = dl > 0; db.textContent = dl > 0 ? `Back in ${mmss(dl)}` : 'Claim 100 coins'; }
  if (S.rain) $$('[data-r="time"]').forEach(e => (e.textContent = mmss(S.rain.endsAt - now)));
}
function buildRainCards() {
  $$('[data-rain]').forEach((el, i) => {
    el.innerHTML = `<div class="rain">
      <div class="rain-head"><span class="cloud">${ICON.cloud}</span><div><h3 class="card-h">Rain</h3><span class="rain-time">Drops in <b class="num" data-r="time">--:--</b></span></div></div>
      <div class="rain-pot"><span class="coin lg"></span><span class="num" data-r="pot">—</span></div>
      <p class="rain-meta"><b data-r="n">0</b> <span data-r="nlabel">players</span> in<span data-r="each"></span></p>
      <button class="btn-rain" type="button" data-act="rain-join" data-r="join">Join the rain</button>
      <div class="amt"><span class="coin sm"></span><input id="rain-tip-${i}" type="number" inputmode="decimal" min="1" step="1" placeholder="Tip the rain" data-r="tipin" aria-label="Tip amount"><button type="button" data-act="rain-tip">Tip</button></div>
      <p class="rain-last" data-r="last">No rain has dropped yet.</p>
    </div>`;
  });
}
function renderRain() {
  const r = S.rain;
  if (!r) return;
  const each = r.n ? r.pot / r.n : 0;
  let last = 'No rain has dropped yet.';
  if (r.last) last = r.last.n ? `Last rain: ${fmt(r.last.pot)} coins split between ${r.last.n} ${r.last.n === 1 ? 'player' : 'players'}, ${fmt(r.last.share)} each.` : `Last rain: nobody joined, so ${fmt(r.last.pot)} coins rolled over.`;
  $$('[data-rain]').forEach(box => {
    const q = k => box.querySelector(`[data-r="${k}"]`);
    q('pot').textContent = fmt(r.pot);
    q('n').textContent = String(r.n);
    q('nlabel').textContent = r.n === 1 ? 'player' : 'players';
    q('each').textContent = r.n ? ` · about ${fmt(each)} each` : '';
    const jb = q('join');
    jb.textContent = r.joined ? "You're in the rain" : S.me ? 'Join the rain' : 'Sign up to join';
    jb.classList.toggle('in', !!r.joined);
    jb.disabled = !!r.joined;
    q('last').textContent = last;
  });
  renderTimers();
}
function renderFeed() {
  const html = S.feed.length ? S.feed.slice(0, 12).map(f => f.level ? `<li>${avatar(f.name, 'sm')}<span class="li-name"><b>${esc(f.name)}${lvlTag(f.lvl)}</b><span>Reached level ${f.level}</span></span><span class="num" style="color:var(--gold-hi)">Lv ${f.level}</span></li>` : `<li>${avatar(f.name, 'sm')}<span class="li-name"><b>${esc(f.name)}${lvlTag(f.lvl)}</b><span>${esc(f.game)}${f.free ? ' · free' : ' · ' + Number(f.mult).toFixed(2) + '×'}</span></span><span class="num pos">+${fmt(f.payout - f.bet)}</span></li>`).join('') : '<li class="empty">Wins of 2× or more show up here.</li>';
  $$('[data-feed]').forEach(el => (el.innerHTML = html));
}
const LB = {
  profit: { label: 'Most won', head: 'Net winnings', val: p => p.won - p.wagered, fmt: v => (v > 0 ? '+' : '') + fmt(v), cls: v => (v > 0 ? 'pos' : v < 0 ? 'neg' : ''), sub: p => `${p.bets.toLocaleString('en-US')} bets · ${fmt(p.wagered)} wagered` },
  balance: { label: 'Richest', head: 'Balance', val: p => p.balance, fmt: v => fmt(v), cls: () => '', sub: p => `${p.bets.toLocaleString('en-US')} bets` },
  best: { label: 'Biggest hit', head: 'Single-bet profit', val: p => p.best, fmt: v => '+' + fmt(v), cls: v => (v > 0 ? 'pos' : ''), sub: p => (p.bestGame ? `${p.bestGame} at ${Number(p.bestMult).toFixed(2)}×` : 'No wins yet') },
  level: { label: 'Highest level', head: 'Level', val: p => p.wagered, fmt: v => 'Lv ' + R.levelOf(v), cls: () => '', sub: p => `${fmt(p.wagered)} wagered` },
  wagered: { label: 'Most wagered', head: 'Total wagered', val: p => p.wagered, fmt: v => fmt(v), cls: () => '', sub: p => `${p.bets.toLocaleString('en-US')} bets` },
};
async function loadLB() {
  const tab = LB[S.lbTab];
  $('#lb-head').textContent = tab.head;
  $$('#lb-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === S.lbTab)));
  let rows;
  try { rows = await Net.call('lb', { tab: S.lbTab }); } catch { return; }
  $('#lb-body').innerHTML = rows.length ? rows.map((p, i) => {
    const v = tab.val(p), me = S.me && p.id === S.me.id;
    return `<tr class="${me ? 'me' : ''}"><td class="rk"><span class="rank r${i + 1}">${i + 1}</span></td><td><div class="who">${avatar(p.name)}<span class="li-name"><b>${esc(p.name)}${lvlTag(R.levelOf(p.wagered))}${me ? '<em class="you">you</em>' : ''}</b><span>${esc(tab.sub(p))}</span></span></div></td><td class="v ${tab.cls(v)}">${tab.fmt(v)}</td></tr>`;
  }).join('') : '<tr><td colspan="3" class="empty">No players yet. Sign up and place a bet to get on the board.</td></tr>';
}
async function loadLobbyLB() {
  let rows;
  try { rows = await Net.call('lb', { tab: 'profit' }); } catch { return; }
  const t = LB.profit;
  $('#lobby-lb').innerHTML = rows.length ? rows.slice(0, 5).map((p, i) => { const v = t.val(p), me = S.me && p.id === S.me.id; return `<li><span class="rank r${i + 1}">${i + 1}</span>${avatar(p.name, 'sm')}<span class="li-name"><b>${esc(p.name)}${lvlTag(R.levelOf(p.wagered))}${me ? '<em class="you">you</em>' : ''}</b><span>${p.bets.toLocaleString('en-US')} bets</span></span><span class="num ${t.cls(v)}">${t.fmt(v)}</span></li>`; }).join('') : '<li class="empty">Nobody has played yet.</li>';
}

/* ================= toasts + effects ================= */
function toast(msg, kind = '') {
  const box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), 3600);
}
function pop(stage, big, small) {
  const el = document.createElement('div');
  el.className = 'pop'; el.innerHTML = `<b>${esc(big)}</b><span>${esc(small)}</span>`;
  stage.appendChild(el);
  setTimeout(() => el.remove(), 1750);
}
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function pushHist(el, text, cls, max = 14) { const c = document.createElement('span'); c.className = 'hchip ' + cls; c.textContent = text; el.prepend(c); while (el.children.length > max) el.lastChild.remove(); }
function resultSound(bet, payout) { if (payout > bet) { sfx.win(payout >= bet * 5); if (payout >= bet * 10) coinShower(50); } else if (payout === 0) sfx.lose(); }
const shower = $('#shower'), sctx = shower.getContext('2d');
let parts = [], sraf = 0;
function coinShower(n) {
  if (reduced) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  shower.width = innerWidth * dpr; shower.height = innerHeight * dpr; sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < n; i++) parts.push({ x: rnd() * innerWidth, y: -20 - rnd() * innerHeight * 0.5, vy: 1.5 + rnd() * 3, vx: (rnd() - 0.5) * 1.4, r: 6 + rnd() * 7, ph: rnd() * TAU, vph: 0.08 + rnd() * 0.16 });
  if (!sraf) sraf = requestAnimationFrame(stepShower);
}
function stepShower() {
  sctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of parts) {
    p.vy += 0.12; p.y += p.vy; p.x += p.vx; p.ph += p.vph;
    const rx = Math.max(1.2, p.r * Math.abs(Math.cos(p.ph)));
    sctx.beginPath(); sctx.ellipse(p.x, p.y, rx, p.r, 0, 0, TAU); sctx.fillStyle = C.gold; sctx.fill();
    sctx.lineWidth = 1.5; sctx.strokeStyle = C['gold-deep']; sctx.stroke();
    sctx.beginPath(); sctx.ellipse(p.x - rx * 0.25, p.y - p.r * 0.3, rx * 0.3, p.r * 0.25, 0, 0, TAU); sctx.fillStyle = C['gold-hi']; sctx.fill();
  }
  parts = parts.filter(p => p.y < innerHeight + 30);
  if (parts.length) sraf = requestAnimationFrame(stepShower); else { sraf = 0; sctx.clearRect(0, 0, innerWidth, innerHeight); }
}

/* ================= icons + nav ================= */
const sv = (inner, extra = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') => `<svg viewBox="0 0 24 24" ${extra}>${inner}</svg>`;
const ICON = {
  lobby: sv('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  rewards: sv('<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6 4 6 6.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/>'),
  leaderboard: sv('<path d="M4 21v-8h4v8M10 21V5h4v16M16 21v-5h4v5M3 21h18"/>'),
  admin: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  roulette: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>'),
  blackjack: sv('<rect x="2.5" y="6" width="11" height="15" rx="2" transform="rotate(-10 8 13.5)"/><rect x="10.5" y="3.5" width="11" height="15" rx="2" transform="rotate(8 16 11)"/>'),
  crash: sv('<path d="M3 20c7 0 12-4 15-14"/><path d="M13 5h6v6"/>'),
  jackpot: sv('<path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M9 8a3 3 0 0 1 6 0M4 8h16"/>'),
  coinflip: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/>'),
  mines: sv('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 18 3-18"/>'),
  towers: sv('<rect x="4" y="15.5" width="16" height="5" rx="1.2"/><rect x="6" y="9.5" width="12" height="5" rx="1.2"/><rect x="8" y="3.5" width="8" height="5" rx="1.2"/>'),
  plinko: sv('<circle cx="12" cy="4.5" r="1.7"/><circle cx="8.5" cy="9.5" r="1.7"/><circle cx="15.5" cy="9.5" r="1.7"/><circle cx="5" cy="14.5" r="1.7"/><circle cx="12" cy="14.5" r="1.7"/><circle cx="19" cy="14.5" r="1.7"/><rect x="3" y="19" width="18" height="2.2" rx="1.1"/>', 'fill="currentColor"'),
  dice: sv('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/>'),
  limbo: sv('<path d="M4 20h16M7 20V10M12 20V4M17 20v-7"/><path d="M9 7l3-3 3 3"/>'),
  keno: sv('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="16" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="16" r="1.4" fill="currentColor"/><circle cx="16" cy="16" r="1.4" fill="currentColor"/><circle cx="12" cy="8" r="1.4"/><circle cx="12" cy="16" r="1.4"/>'),
  hilo: sv('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>'),
  wheel: sv('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/><path d="M10 1.5h4L12 4z" fill="currentColor"/>'),
  slots: sv('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M8.7 5v14M15.3 5v14"/><path d="M4 12h2.5M11 12h2M17.5 12H20"/>'),
  cases: sv('<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'),
  battles: sv('<path d="M4 20L14 10M14 10l2-6 4 0 0 4-6 2M20 20L10 10M10 10L8 4H4v4l6 2"/>'),
  free: sv('<path d="M3 9l9-4 9 4v8l-9 4-9-4z"/><path d="M12 13v8M8 11l8-4"/><circle cx="18.5" cy="5.5" r="3" fill="currentColor" stroke="none"/>'),
  cloud: sv('<path d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 .5 7.5H7z"/><path d="M8 18.5l-1 2M12 18.5l-1 2M16 18.5l-1 2"/>'),
  chat: sv('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
  soundOn: sv('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: sv('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
};
const LIVE_GAMES = [
  { id: 'roulette', name: 'Roulette', tag: 'One wheel, everyone bets. Spins every 30 seconds', rtp: '97.3% RTP', c: '--t-roulette' },
  { id: 'blackjack', name: 'Blackjack', tag: 'Six seats, one dealer. Beat the house to 21', rtp: '~99.5% RTP', c: '--t-blackjack' },
  { id: 'crash', name: 'Crash', tag: 'Everyone rides the same rocket. Bail before it pops', rtp: '99% RTP', c: '--t-crash' },
  { id: 'jackpot', name: 'Jackpot', tag: 'Throw coins in the pot. One player takes it all', rtp: '98% RTP', c: '--t-jackpot' },
  { id: 'coinflip', name: 'Coinflip', tag: 'Challenge another player, or flip the house', rtp: '98% RTP', c: '--t-coinflip' },
];
const SOLO_GAMES = [
  { id: 'mines', name: 'Mines', tag: 'Find gems, dodge bombs, cash out anytime', rtp: '99% RTP', c: '--t-mines' },
  { id: 'towers', name: 'Towers', tag: 'Climb eight floors without hitting a bomb', rtp: '98% RTP', c: '--t-towers' },
  { id: 'plinko', name: 'Plinko', tag: 'Drop the ball and hope for the edges', rtp: '99% RTP', c: '--t-plinko' },
  { id: 'dice', name: 'Dice', tag: 'Pick your own odds, roll over or under', rtp: '99% RTP', c: '--t-dice' },
  { id: 'limbo', name: 'Limbo', tag: 'Set a target. Win if the result beats it', rtp: '99% RTP', c: '--t-limbo' },
  { id: 'keno', name: 'Keno', tag: 'Pick up to ten numbers and watch the draw', rtp: '99% RTP', c: '--t-keno' },
  { id: 'hilo', name: 'Hi-Lo', tag: 'Higher or lower? Stack the streak', rtp: '99% RTP', c: '--t-hilo' },
  { id: 'wheel', name: 'Wheel', tag: 'Thirty slices, one spin', rtp: '98% RTP', c: '--t-wheel' },
  { id: 'slots', name: 'Slots', tag: 'Three reels. Line up the diamonds', rtp: '~97% RTP', c: '--t-slots' },
];
const CASE_GAMES = [
  { id: 'cases', name: 'Cases', tag: '120 cases from 0.25 to 1,000,000 coins', rtp: '~95% RTP', c: '--t-slots' },
  { id: 'battles', name: 'Case battles', tag: '1v1, 2v2, up to four players. Cursed mode too', rtp: 'Live', c: '--t-jackpot' },
  { id: 'free', name: 'Free cases', tag: 'Open a free case every hour. Level up for bigger ones', rtp: 'Free', c: '--t-mines' },
];
const LIVE = new Set(LIVE_GAMES.map(g => g.id));
const VIEWS = new Set(['lobby', 'rewards', 'leaderboard', 'admin', 'cases', 'case', 'free', 'battles', 'battle', ...LIVE_GAMES.map(g => g.id), ...SOLO_GAMES.map(g => g.id)]);
function buildNav() {
  let h = '';
  for (const id of ['lobby', 'rewards', 'leaderboard']) h += `<a href="#${id}" data-nav="${id}">${ICON[id]}<span>${id[0].toUpperCase() + id.slice(1)}</span></a>`;
  if (S.me && S.me.admin) h += `<a href="#admin" data-nav="admin">${ICON.admin}<span>Admin</span></a>`;
  h += '<span class="sep">Cases</span>';
  h += `<a href="#cases" data-nav="cases">${ICON.cases}<span>Cases</span></a><a href="#battles" data-nav="battles">${ICON.battles}<span>Case battles</span></a><a href="#free" data-nav="free">${ICON.free}<span>Free cases</span><b class="nb" hidden>0</b></a>`;
  h += '<span class="sep"><i class="dot"></i>Live tables</span>';
  for (const g of LIVE_GAMES) h += `<a href="#${g.id}" data-nav="${g.id}">${ICON[g.id]}<span>${g.name}</span></a>`;
  h += '<span class="sep">Solo games</span>';
  for (const g of SOLO_GAMES) h += `<a href="#${g.id}" data-nav="${g.id}">${ICON[g.id]}<span>${g.name}</span></a>`;
  const side = $('#side');
  if (side.dataset.sig === h) return;
  side.dataset.sig = h; side.innerHTML = h;
  markNav();
}
function markNav() { const v = S.view === 'case' ? 'cases' : S.view === 'battle' ? 'battles' : S.view; $$('[data-nav]').forEach(a => (a.dataset.nav === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))); renderLevel(); }
const tile = (g, live) => `<a class="gtile" href="#${g.id}" style="--tc:var(${g.c})"><span class="gt-art" aria-hidden="true">${ICON[g.id]}</span><span class="gt-name">${g.name}</span><span class="gt-tag">${g.tag}</span><span class="gt-rtp">${live ? '<i class="dot"></i>Live · ' : ''}${g.rtp}</span></a>`;

/* ================= auth ================= */
const Auth = {
  mode: 'signup',
  open(mode) {
    this.mode = mode;
    $$('#auth-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    const su = mode === 'signup';
    $('#auth-title').textContent = su ? 'Make a free account' : 'Welcome back';
    $('#auth-sub').textContent = su ? 'You start with 100 free coins. Pick a name other players will see.' : 'Log in with your player name and password.';
    $('#auth-go').textContent = su ? 'Start playing' : 'Log in';
    $('#auth-pass').setAttribute('autocomplete', su ? 'new-password' : 'current-password');
    $('#auth-err').hidden = true;
    if (LOCAL) {
      $('#auth-tabs').hidden = true; $('#auth-pass').closest('.fld').hidden = true; $('.modal-card .fine').hidden = true;
      $('#auth-title').textContent = 'Pick a player name';
      $('#auth-sub').textContent = 'This is how you show up on the leaderboard. You start with 100 free coins.';
      $('#auth-go').textContent = 'Start playing';
    }
    $('#auth-modal').hidden = false;
    setTimeout(() => $('#auth-name').focus(), 30);
  },
  close() { $('#auth-modal').hidden = true; },
  async submit() {
    const name = $('#auth-name').value.trim(), pass = $('#auth-pass').value;
    const err = $('#auth-err'), btn = $('#auth-go');
    err.hidden = true; btn.disabled = true;
    try {
      const r = await Net.call(this.mode === 'signup' ? 'register' : 'login', { name, pass });
      S.token = r.token; ls.set('coinfall.token', r.token);
      onMe(r.me); renderChrome();
      this.close(); $('#auth-pass').value = '';
      if (r.welcome) { toast(`Welcome, ${r.me.name}! 100 coins are in your wallet.`, 'good'); coinShower(60); sfx.coin(); }
      else toast(`Welcome back, ${r.me.name}`, 'good');
      watchCurrent();
      if (S.view === 'lobby') loadLobbyLB();
    } catch (e) { err.textContent = e.message; err.hidden = false; sfx.error(); }
    btn.disabled = false;
  },
};
function logoutLocal() {
  S.token = null; ls.set('coinfall.token', null);
  S.me = null; S.latest = null; S.hold = 0;
  renderChrome(); renderRain();
  if (S.view === 'admin') location.hash = '#lobby';
}

/* ================= global clicks ================= */
const ACT = {
  signup: () => Auth.open('signup'),
  login: () => Auth.open('login'),
  logout: async () => { $('#me-menu').hidden = true; try { await Net.call('logout', { token: S.token }); } catch { } logoutLocal(); toast('Logged out'); },
  rake: async () => { const r = await act('rake.claim'); if (r) { toast(`+${fmt(r.amount)} coins rakeback`, 'good'); coinShower(30); sfx.coin(); } },
  daily: async () => { const r = await act('daily'); if (r) { toast('+100 coins daily bonus', 'good'); coinShower(50); sfx.coin(); } },
  'rain-join': async () => { const r = await act('rain.join'); if (r) { S.rain = { ...S.rain, ...r }; renderRain(); toast(`You're in. The rain drops in ${mmss(r.endsAt - srvNow())}`, 'rain'); sfx.rain(); } },
  'rain-tip': async b => {
    const inp = b.closest('[data-rain]').querySelector('[data-r="tipin"]');
    const amt = Math.round(parseFloat(inp.value) * 100);
    if (!(amt >= 100)) { toast('Tips start at 1 coin', 'bad'); return; }
    if (await act('rain.tip', { amount: amt })) { inp.value = ''; toast(`You added ${fmt(amt)} coins to the rain`, 'rain'); sfx.coin(); }
  },
  'lb-tab': b => { S.lbTab = b.dataset.tab; loadLB(); },
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-amt]');
  if (a) {
    const inp = $('#' + a.dataset.for);
    let v = parseFloat(inp.value) || 0;
    const bal = S.me ? S.me.balance / 100 : 0;
    if (a.dataset.amt === 'half') v = Math.max(0.01, v / 2);
    else if (a.dataset.amt === 'double') v = Math.min(bal, Math.max(v, 0.01) * 2);
    else v = Math.floor(bal * 100) / 100;
    inp.value = String(+v.toFixed(2));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    sfx.click();
    return;
  }
  const t = e.target.closest('[data-act]');
  if (t && ACT[t.dataset.act]) { ACT[t.dataset.act](t, e); return; }
  if (!e.target.closest('#me-wrap')) $('#me-menu').hidden = true;
});

/* ================= CHAT + TIPS ================= */
const Chat = (() => {
  let items = [], unread = 0, menuFor = null;
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(ls.get('coinfall.hidden') || '[]')); } catch { }
  const isOpen = () => !$('#chat').hidden;
  function li(m) {
    const me = S.me && m.uid === S.me.id, t = new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (m.kind === 'tip') return `<li class="tip" data-id="${m.id}" title="${t}">${esc(m.name)} tipped ${esc(m.to)} ${fmt(m.amount)} coins</li>`;
    if (m.kind === 'rain') return `<li class="rain" data-id="${m.id}" title="${t}">${esc(m.text)}</li>`;
    if (m.kind === 'sys') return `<li class="sys" data-id="${m.id}" title="${t}">${esc(m.text)}</li>`;
    return `<li class="${me ? 'me' : ''}" data-id="${m.id}" title="${t}">${avatar(m.name, 'sm')}<span class="cm-body"><button type="button" class="cm-name" data-name="${esc(m.name)}" data-uid="${m.uid}" data-mid="${m.id}">${esc(m.name)}</button>${lvlTag(m.lvl)} <span class="cm-text">${esc(m.text)}</span></span></li>`;
  }
  const visible = () => items.filter(m => !(m.kind === 'msg' && hidden.has(String(m.uid))));
  function render() {
    const list = $('#chat-list'), atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    const v = visible();
    list.innerHTML = v.length ? v.map(li).join('') : '<li class="chat-empty">No messages yet. Say hi!</li>';
    if (atBottom || !list.dataset.scrolled) { list.scrollTop = list.scrollHeight; list.dataset.scrolled = '1'; }
  }
  function badge() { const b = $('#chat-unread'); if (b) { b.textContent = unread > 99 ? '99+' : unread; b.hidden = !unread; } }
  function set(arr) { items = arr; render(); }
  function add(m) {
    items.push(m); if (items.length > 120) items.shift();
    if (m.kind === 'msg' && hidden.has(String(m.uid))) return;
    render();
    if (!isOpen() && !(S.me && m.uid === S.me.id)) { unread++; badge(); }
  }
  function open(v) {
    $('#chat').hidden = !v; $('#chat-btn').setAttribute('aria-expanded', String(!!v)); document.body.classList.toggle('chat-open', !!v); ls.set('coinfall.chat', v ? '1' : '0');
    if (v) { unread = 0; badge(); render(); setTimeout(() => $('#chat-input').focus(), 50); }
  }
  function tipTo(name) { $('#chat-tip').hidden = false; $('#tip-to').value = name || ''; setTimeout(() => (name ? $('#tip-amt') : $('#tip-to')).focus(), 30); }
  function closeMenu() { $('#name-menu').hidden = true; menuFor = null; }
  function showMenu(btn) {
    const name = btn.dataset.name, uid = btn.dataset.uid, mid = +btn.dataset.mid, me = S.me && String(S.me.id) === uid;
    menuFor = { name, uid, mid };
    const m = $('#name-menu');
    m.innerHTML = `<b>${esc(name)}</b>${me ? '' : `<button type="button" data-nm="tip">Tip ${esc(name)}</button><button type="button" data-nm="hide">${hidden.has(uid) ? 'Show their messages' : 'Hide their messages'}</button>`}${S.me && S.me.admin ? `<button type="button" class="danger" data-nm="del">Delete message</button>${me ? '' : '<button type="button" class="danger" data-nm="mute">Mute for 10 minutes</button><button type="button" data-nm="unmute">Unmute</button>'}` : ''}`;
    m.hidden = false;
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
    m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px';
  }
  async function send(e) {
    e.preventDefault();
    const inp = $('#chat-input'), text = inp.value.trim();
    if (!text) return;
    const r = await act('chat.send', { text });
    if (r) { inp.value = ''; if (r.to) { toast(`You tipped ${r.to} ${fmt(r.amount)} coins`, 'good'); sfx.coin(); } }
  }
  async function tip() {
    const to = $('#tip-to').value.trim(), amt = Math.round(parseFloat($('#tip-amt').value) * 100);
    if (!to) { toast('Type who to tip', 'bad'); return; }
    if (!(amt >= 100)) { toast('Tips start at 1 coin', 'bad'); return; }
    const r = await act('chat.tip', { to, amount: amt });
    if (r) { $('#tip-amt').value = ''; toast(`You tipped ${r.to} ${fmt(r.amount)} coins`, 'good'); sfx.coin(); }
  }
  function init() {
    $('#chat-btn').innerHTML = ICON.chat + '<b class="nb" id="chat-unread" hidden>0</b>';
    $('#chat-btn').addEventListener('click', () => open(!isOpen()));
    $('#chat-close').addEventListener('click', () => open(false));
    $('#chat-form').addEventListener('submit', send);
    $('#tip-toggle').addEventListener('click', () => { const t = $('#chat-tip'); t.hidden = !t.hidden; if (!t.hidden) $('#tip-to').focus(); });
    $('#tip-send').addEventListener('click', tip);
    $('#tip-amt').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tip(); } });
    $('#chat-list').addEventListener('click', e => { const b = e.target.closest('.cm-name'); if (b) { e.stopPropagation(); showMenu(b); } });
    $('#name-menu').addEventListener('click', async e => {
      const b = e.target.closest('[data-nm]'); if (!b || !menuFor) return;
      const f = menuFor; closeMenu();
      if (b.dataset.nm === 'tip') tipTo(f.name);
      else if (b.dataset.nm === 'hide') { hidden.has(f.uid) ? hidden.delete(f.uid) : hidden.add(f.uid); ls.set('coinfall.hidden', JSON.stringify([...hidden])); render(); }
      else if (b.dataset.nm === 'del') act('chat.delete', { id: f.mid });
      else if (b.dataset.nm === 'mute') { if (await act('admin.mute', { id: +f.uid, minutes: 10 })) toast(`${f.name} is muted for 10 minutes`, 'good'); }
      else if (b.dataset.nm === 'unmute') { if (await act('admin.mute', { id: +f.uid, minutes: 0 })) toast(`${f.name} can chat again`, 'good'); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('#name-menu')) closeMenu(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); if (isOpen()) open(false); } });
    if (ls.get('coinfall.chat') === '1' && innerWidth > 1180) open(true);
  }
  return { init, set, add, open };
})();

/* ================= ROULETTE (live) ================= */
const RL_TIMES = { betting: 18000, spinning: 7000, result: 4500 };
const Roulette = (() => {
  const CHIPS = [100, 500, 1000, 2500, 10000, 50000];
  let chip = 500, rot = 0, ballRel = -Math.PI / 2, ballR = 0.9, seenSpin = -1, animating = false, lastBets = null, myBets = {}, s = null;
  let cv, ctx, board;
  const tier = v => (v < 500 ? 1 : v < 1000 ? 2 : v < 2500 ? 3 : v < 10000 ? 4 : v < 50000 ? 5 : 6);
  function init() {
    cv = $('#rl-wheel'); ctx = cv.getContext('2d'); board = $('#rl-board');
    $('#rl-chips').innerHTML = CHIPS.map(v => `<button type="button" class="chip k${tier(v)}" data-chip="${v}" aria-pressed="${v === chip}" aria-label="${v / 100} coin chip">${fmtShort(v)}</button>`).join('');
    $('#rl-chips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (!b) return; chip = +b.dataset.chip; $$('#rl-chips .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); sfx.chip(); });
    const sp = (k, label, cls, style) => `<button type="button" class="sp ${cls}" data-bet="${k}" style="${style}"><span>${label}</span><span class="chipslot"></span><span class="others"></span></button>`;
    let h = sp('n0', '0', 'green', 'grid-column:1;grid-row:1 / span 3');
    for (let n = 1; n <= 36; n++) h += sp('n' + n, n, R.rouletteColor(n), `grid-column:${Math.ceil(n / 3) + 1};grid-row:${3 - ((n - 1) % 3)}`);
    h += sp('c3', '2:1', 'out', 'grid-column:14;grid-row:1') + sp('c2', '2:1', 'out', 'grid-column:14;grid-row:2') + sp('c1', '2:1', 'out', 'grid-column:14;grid-row:3');
    h += sp('d1', '1st 12', 'out', 'grid-column:2 / span 4;grid-row:4') + sp('d2', '2nd 12', 'out', 'grid-column:6 / span 4;grid-row:4') + sp('d3', '3rd 12', 'out', 'grid-column:10 / span 4;grid-row:4');
    h += sp('low', '1–18', 'out', 'grid-column:2 / span 2;grid-row:5') + sp('even', 'Even', 'out', 'grid-column:4 / span 2;grid-row:5') + sp('red', 'Red', 'red', 'grid-column:6 / span 2;grid-row:5') + sp('black', 'Black', 'black', 'grid-column:8 / span 2;grid-row:5') + sp('odd', 'Odd', 'out', 'grid-column:10 / span 2;grid-row:5') + sp('high', '19–36', 'out', 'grid-column:12 / span 2;grid-row:5');
    board.innerHTML = h;
    board.addEventListener('click', e => { const b = e.target.closest('[data-bet]'); if (b) bet([[b.dataset.bet, chip]]); });
    $('#rl-clear').addEventListener('click', async () => { if (await act('rl.clear')) sfx.click(); });
    $('#rl-repeat').addEventListener('click', () => { if (!lastBets) { toast('No bets from last spin to repeat', 'bad'); return; } bet(Object.entries(lastBets)); });
    $('#rl-double').addEventListener('click', () => { const e = Object.entries(myBets); if (!e.length) { toast('Place a chip first', 'bad'); return; } bet(e); });
  }
  async function bet(list) {
    if (!s || s.phase !== 'betting') { toast('Bets are closed. Wait for the next spin', 'bad'); return; }
    if (await act('rl.bet', { bets: list })) sfx.chip();
  }
  function onTable(st) {
    const prevPhase = s && s.phase;
    s = st;
    const mine = S.me && s.players.find(p => p.id === S.me.id);
    myBets = mine ? mine.bets : {};
    if (s.phase === 'result' && mine) lastBets = { ...mine.bets };
    const others = {};
    for (const p of s.players) if (!S.me || p.id !== S.me.id) for (const [k, v] of Object.entries(p.bets)) others[k] = (others[k] || 0) + v;
    $$('[data-bet]', board).forEach(b => {
      const k = b.dataset.bet, v = myBets[k];
      b.querySelector('.chipslot').innerHTML = v ? `<i class="chip k${tier(v)}">${fmtShort(v)}</i>` : '';
      b.querySelector('.others').textContent = others[k] ? fmtShort(others[k]) : '';
      b.disabled = s.phase !== 'betting';
      if (s.phase === 'betting') b.classList.remove('hit');
    });
    $('#rl-mine').textContent = fmt(mine ? mine.total : 0);
    const showPay = s.phase === 'result';
    $('#rl-players').innerHTML = s.players.length ? s.players.map(p => {
      const me = S.me && p.id === S.me.id;
      const cls = showPay ? (p.payout > 0 ? 'won' : 'lost') : '';
      const spots = Object.keys(p.bets).map(R.SPOT_LABEL).slice(0, 4).join(', ') + (Object.keys(p.bets).length > 4 ? '…' : '');
      return `<span class="player ${me ? 'me' : ''} ${cls}" title="${esc(spots)}">${avatar(p.name, 'sm')}<b>${esc(p.name)}</b>${lvlTag(p.lvl)}<span class="num">${showPay ? (p.payout > 0 ? '+' + fmt(p.payout) : '−' + fmt(p.total)) : fmt(p.total)}</span></span>`;
    }).join('') : '<span class="empty">No bets yet this spin. Be the first.</span>';
    const histEl = $('#rl-hist');
    histEl.innerHTML = s.history.slice(0, 10).map(n => `<span class="hchip ${R.rouletteColor(n)}">${n}</span>`).join('');
    if (s.phase === 'spinning' && s.spin !== seenSpin) {
      seenSpin = s.spin;
      spinTo(s.result.idx, Math.max(600, s.endsAt - s.now - 200));
    } else if (s.phase === 'result' && s.spin !== seenSpin) {
      seenSpin = s.spin; snapTo(s.result.idx); showResult();
    } else if (s.phase === 'result' && prevPhase === 'spinning' && !animating) showResult();
    if (!animating) draw();
    tick();
  }
  function showResult() {
    const n = s.result.n, col = R.rouletteColor(n);
    const num = $('#rl-num'); num.textContent = n; num.className = 'rl-num ' + col;
    const hit = board.querySelector(`[data-bet="n${n}"]`); if (hit) hit.classList.add('hit');
    const mine = S.me && s.players.find(p => p.id === S.me.id);
    const out = $('#rl-out');
    if (mine) {
      out.textContent = mine.payout > 0 ? `${n} ${col} · you won ${fmt(mine.payout)}` : `${n} ${col} · no win this time`;
      out.className = 'rl-out ' + (mine.payout > mine.total ? 'pos' : mine.payout ? '' : 'neg');
      resultSound(mine.total, mine.payout);
      if (mine.payout > mine.total) pop($('#rl-stage'), (mine.payout / mine.total).toFixed(2) + '×', '+' + fmt(mine.payout - mine.total));
    } else { out.textContent = `${n} ${col}`; out.className = 'rl-out'; }
  }
  function tick() {
    if (!s || S.view !== 'roulette') return;
    const left = s.endsAt - srvNow();
    const label = s.phase === 'betting' ? `Place your bets · ${secs(left)}` : s.phase === 'spinning' ? 'No more bets · spinning' : 'Next spin soon';
    $('#rl-phase').textContent = label;
    $('#rl-timer').style.width = (Math.max(0, Math.min(1, left / RL_TIMES[s.phase])) * 100) + '%';
  }
  function draw() {
    if (!fitCanvas(cv)) return;
    const W = cv.clientWidth, cx = W / 2, cy = W / 2, Rr = W / 2 - 2, seg = TAU / 37;
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, TAU); ctx.fillStyle = C['panel-3']; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C['gold-deep']; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.95, 0, TAU); ctx.fillStyle = C['panel-2']; ctx.fill();
    const rO = Rr * 0.86, rI = Rr * 0.58;
    for (let i = 0; i < 37; i++) {
      const a0 = rot + i * seg - Math.PI / 2 - seg / 2, a1 = a0 + seg, n = R.WHEEL_ORDER[i];
      ctx.beginPath(); ctx.arc(cx, cy, rO, a0, a1); ctx.arc(cx, cy, rI, a1, a0, true); ctx.closePath();
      ctx.fillStyle = n === 0 ? C['rl-green'] : R.rouletteColor(n) === 'red' ? C['rl-red'] : C['rl-black']; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = C['gold-deep']; ctx.stroke();
      const am = a0 + seg / 2;
      ctx.save(); ctx.translate(cx + Math.cos(am) * Rr * 0.79, cy + Math.sin(am) * Rr * 0.79); ctx.rotate(am + Math.PI / 2);
      ctx.fillStyle = C.fg; ctx.font = `700 ${Math.max(8, Rr * 0.075)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), 0, 0); ctx.restore();
    }
    const grd = ctx.createRadialGradient(cx, cy, Rr * 0.05, cx, cy, rI); grd.addColorStop(0, C['panel-3']); grd.addColorStop(1, C.bg);
    ctx.beginPath(); ctx.arc(cx, cy, rI, 0, TAU); ctx.fillStyle = grd; ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Rr * 0.3, 0); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.08, 0, TAU); ctx.fillStyle = C['gold-hi']; ctx.fill();
    const ba = rot + ballRel, br = Rr * ballR;
    ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, Math.max(4, Rr * 0.045), 0, TAU); ctx.fillStyle = C.ball; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 7, 1); ctx.lineTo(cx + 7, 1); ctx.lineTo(cx, 12); ctx.closePath(); ctx.fillStyle = C.gold; ctx.fill();
  }
  function snapTo(idx) { const seg = TAU / 37; rot = (((-idx * seg) % TAU) + TAU) % TAU; ballRel = idx * seg - Math.PI / 2; ballR = 0.68; draw(); }
  function spinTo(idx, D) {
    if (reduced) D = 400;
    animating = true;
    const seg = TAU / 37, r0 = rot, tgt = (((-idx * seg) % TAU) + TAU) % TAU;
    let r1 = r0 + TAU * 4; r1 += (((tgt - r1) % TAU) + TAU) % TAU;
    const b0 = ballRel, relEnd = idx * seg - Math.PI / 2, x = b0 - TAU * 6, b1 = x - ((((x - relEnd) % TAU) + TAU) % TAU);
    const t0 = performance.now();
    let lastPocket = -1, lastTick = 0;
    sfx.spin();
    const f = now => {
      const k = Math.min(1, (now - t0) / D);
      rot = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 3));
      const kb = Math.min(1, k / 0.82);
      ballRel = b0 + (b1 - b0) * (1 - Math.pow(1 - kb, 3));
      ballR = k < 0.5 ? 0.9 : k < 0.82 ? 0.9 - 0.22 * ((k - 0.5) / 0.32) : 0.68;
      const pocket = Math.floor(((ballRel % TAU) + TAU) % TAU / seg);
      if (pocket !== lastPocket && kb < 1 && now - lastTick > 45) { lastPocket = pocket; lastTick = now; sfx.tick(0.8 + kb * 0.4); }
      if (S.view === 'roulette') draw();
      if (k < 1) requestAnimationFrame(f);
      else { rot = ((rot % TAU) + TAU) % TAU; ballRel = relEnd; animating = false; draw(); showResult(); }
    };
    requestAnimationFrame(f);
  }
  return { init, onTable, tick, onShow: draw };
})();

/* ================= CRASH (live) ================= */
const Crash = (() => {
  let s = null, raf = 0, cv, ctx, lastBoom = 0;
  function init() {
    cv = $('#crash-cv'); ctx = cv.getContext('2d');
    $('#crash-go').addEventListener('click', go);
  }
  const mine = () => S.me && s && s.players.find(p => p.id === S.me.id);
  async function go() {
    if (!s) return;
    const b = mine();
    if (s.phase === 'betting') {
      if (b) { if (await act('cr.cancel')) sfx.click(); return; }
      if (await act('cr.bet', { amount: readBet('crash'), auto: parseFloat($('#crash-auto').value) || 0 })) sfx.chip();
    } else if (s.phase === 'running' && b && !b.cashed) {
      const r = await act('cr.cashout');
      if (r) { sfx.cashout(); pop($('#crash-stage'), r.mult.toFixed(2) + '×', '+' + fmt(r.payout)); }
    }
  }
  function onTable(st) {
    const was = s;
    s = st;
    if (s.phase === 'running') { if (!raf) { raf = requestAnimationFrame(loop); if (S.view === 'crash') sfx.rocket.start(); } }
    if (s.phase === 'crashed' && s.startAt !== lastBoom) {
      lastBoom = s.startAt;
      sfx.rocket.stop();
      if (S.view === 'crash') {
        sfx.boom();
        const b = mine();
        if (b && !b.cashed) { shake($('.crash-wrap')); setTimeout(() => sfx.lose(), 300); }
      }
    }
    if (was && was.phase === 'running' && s.phase === 'running' && S.view === 'crash') {
      for (const p of s.players) { const o = was.players.find(x => x.id === p.id); if (p.cashed && o && !o.cashed && (!S.me || p.id !== S.me.id)) sfx.tick(1.4); }
    }
    $('#crash-hist').innerHTML = s.history.slice(0, 14).map(cp => `<span class="hchip ${cp >= 10 ? 'big' : cp >= 2 ? 'win' : 'lose'}">${cp.toFixed(2)}×</span>`).join('');
    const ps = [...s.players].sort((a, b) => (b.cashed ? 1 : 0) - (a.cashed ? 1 : 0) || b.bet - a.bet);
    $('#crash-players').innerHTML = ps.length ? ps.map(p => {
      const me = S.me && p.id === S.me.id, lost = s.phase === 'crashed' && !p.cashed;
      return `<span class="player ${me ? 'me' : ''} ${p.cashed ? 'won' : lost ? 'lost' : ''}">${avatar(p.name, 'sm')}<b>${esc(p.name)}</b>${lvlTag(p.lvl)}<span class="num">${p.cashed ? `${p.cashed.toFixed(2)}× +${fmt(p.payout)}` : lost ? '−' + fmt(p.bet) : fmt(p.bet)}</span></span>`;
    }).join('') : '<span class="empty">No bets this round yet.</span>';
    ui();
    if (s.phase !== 'running') draw();
  }
  function loop() {
    if (!s || s.phase !== 'running') { raf = 0; sfx.rocket.stop(); return; }
    if (S.view === 'crash') { draw(); ui(); }
    raf = requestAnimationFrame(loop);
  }
  const curMult = () => Math.exp((s.k || R.CRASH_K) * Math.max(0, srvNow() - s.startAt) / 1000);
  function ui() {
    if (!s || S.view !== 'crash') return;
    const label = $('#crash-mult'), sub = $('#crash-sub'), btn = $('#crash-go'), b = mine();
    label.className = 'crash-mult';
    btn.classList.remove('cash', 'stop');
    if (s.phase === 'betting') {
      label.classList.add('idle'); label.textContent = `Launch in ${(Math.max(0, s.endsAt - srvNow()) / 1000).toFixed(1)}s`;
      sub.textContent = b ? `You're in with ${fmt(b.bet)}` : 'Place your bet now';
      btn.disabled = false; btn.textContent = b ? 'Cancel bet' : 'Place bet';
      if (b) btn.classList.add('stop');
    } else if (s.phase === 'running') {
      const m = curMult();
      label.textContent = m.toFixed(2) + '×';
      sfx.rocket.set(m);
      if (b && b.cashed) { label.classList.add('cashed'); sub.textContent = `You cashed out at ${b.cashed.toFixed(2)}× · +${fmt(b.payout)}`; btn.disabled = true; btn.textContent = 'Cashed out'; }
      else if (b) { sub.textContent = `Your bet ${fmt(b.bet)}`; btn.disabled = false; btn.classList.add('cash'); btn.textContent = `Cash out ${fmt(Math.floor(b.bet * Math.floor(m * 100) / 100))}`; }
      else { sub.textContent = 'Bet on the next round'; btn.disabled = true; btn.textContent = 'Round in progress'; }
    } else {
      label.classList.add('crashed'); label.textContent = `Crashed at ${s.cp.toFixed(2)}×`;
      sub.textContent = b ? (b.cashed ? `You won ${fmt(b.payout)}` : `You lost ${fmt(b.bet)}`) : 'Next round starts in a moment';
      btn.disabled = true; btn.textContent = 'Next round soon';
    }
  }
  function nice(range, n) { const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function draw() {
    if (!fitCanvas(cv)) return;
    const W = cv.clientWidth, H = cv.clientHeight;
    ctx.clearRect(0, 0, W, H);
    const k = (s && s.k) || R.CRASH_K;
    let t = 0, m = 1;
    if (s && s.phase === 'running') { t = Math.max(0, srvNow() - s.startAt) / 1000; m = Math.exp(k * t); }
    else if (s && s.phase === 'crashed') { m = s.cp; t = Math.log(s.cp) / k; }
    const L = 48, B = 28, T = 16, Rm = 18;
    const tMax = Math.max(8, t * 1.15), mMax = Math.max(2, m * 1.18);
    const X = x => L + (x / tMax) * (W - L - Rm), Y = v => H - B - ((v - 1) / (mMax - 1)) * (H - T - B);
    ctx.font = `11px ${MONO}`; ctx.lineWidth = 1;
    const ys = nice(mMax - 1, 4);
    for (let v = 1; v <= mMax + 1e-9; v += ys) {
      const y = Y(v);
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - Rm, y); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText((v < 10 ? v.toFixed(ys < 1 ? 2 : 1) : v.toFixed(0)) + '×', L - 8, y);
    }
    const xs = nice(tMax, 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = 0; x <= tMax + 1e-9; x += xs) ctx.fillText(Math.round(x) + 's', X(x), H - B + 8);
    if (!s || s.phase === 'betting') return;
    const b = mine();
    const col = s.phase === 'crashed' ? C.lose : b && b.cashed ? C.win : C.gold;
    const N = 90;
    const path = () => { ctx.beginPath(); ctx.moveTo(X(0), Y(1)); for (let i = 1; i <= N; i++) { const x = (t * i) / N; ctx.lineTo(X(x), Y(Math.min(Math.exp(k * x), m))); } };
    path(); ctx.lineTo(X(t), Y(1)); ctx.closePath();
    const g = ctx.createLinearGradient(0, Y(m), 0, Y(1)); g.addColorStop(0, mix(col, C.bg, 0.55)); g.addColorStop(1, C['panel-2']);
    ctx.fillStyle = g; ctx.fill();
    path(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(X(t), Y(m), 7, 0, TAU); ctx.fillStyle = col; ctx.fill();
  }
  return { init, onTable, tick: ui, onShow() { draw(); ui(); if (s && s.phase === 'running') sfx.rocket.start(); } };
})();

/* ================= BLACKJACK (live) ================= */
const Blackjack = (() => {
  let s = null, shown = new Set(), lastPhase = '';
  const TURN = 20000;
  function init() {
    $('#bj-bet').addEventListener('click', async () => { if (await act('bj.bet', { amount: readBet('blackjack') })) sfx.chip(); });
    $$('[data-bj]').forEach(b => b.addEventListener('click', async () => { if (await act('bj.act', { a: b.dataset.bj })) sfx.click(); }));
    $('#bj-leave').addEventListener('click', async () => { if (await act('bj.leave')) sfx.click(); });
    $('#bj-seats').addEventListener('click', async e => { const b = e.target.closest('[data-seat]'); if (b && (await act('bj.sit', { seat: +b.dataset.seat }))) sfx.chip(); });
  }
  const mySeat = () => (S.me && s ? s.seats.findIndex(x => x && x.id === S.me.id) : -1);
  function onTable(st) {
    s = st;
    if (s.phase === 'idle' || (s.phase === 'betting' && lastPhase !== 'betting')) shown = new Set();
    let fresh = 0;
    const cardsOf = (key, cards) => cards.map((c, i) => { const k = key + i + (c ? 'f' : 'h'); const isNew = !shown.has(k); if (isNew) { shown.add(k); fresh++; } return cardHtml(c, isNew ? 'deal' : ''); }).join('');
    $('#bj-dealer').innerHTML = cardsOf('d', s.dealer);
    $('#bj-dealer-meta').innerHTML = s.dealerValue ? `<span class="bj-val">${s.dealer.includes(null) ? s.dealerValue.t + ' + ?' : (s.dealerValue.soft && s.dealerValue.t < 21 ? 'Soft ' : '') + s.dealerValue.t}</span>` : '';
    const me = mySeat();
    $('#bj-seats').innerHTML = s.seats.map((seat, i) => {
      if (!seat) return `<div class="seat">${me < 0 ? `<button class="seat-sit" type="button" data-seat="${i}">Sit here</button>` : '<span class="hint">Empty</span>'}</div>`;
      const turn = s.turn && s.turn.s === i;
      const hands = seat.hands.map((h, hi) => `<div class="hand ${turn && s.turn.h === hi ? 'active' : ''}"><div class="cards">${cardsOf(`s${i}h${hi}`, h.cards)}</div><div class="bj-meta"><span class="bj-val">${(h.value.soft && h.value.t < 21 ? 'Soft ' : '') + h.value.t}</span>${h.res ? `<span class="bj-res ${h.res}">${h.res === 'blackjack' ? 'Blackjack' : h.res}</span>` : ''}</div></div>`).join('');
      return `<div class="seat taken ${i === me ? 'me' : ''} ${turn ? 'turn' : ''}">${turn ? '<div class="turnbar"><i data-turnbar></i></div>' : ''}<div class="hands">${hands}</div><span class="seat-name">${esc(seat.name)}${lvlTag(seat.lvl)}${seat.away ? ' (away)' : ''}</span><span class="bj-val num">${seat.bet ? fmt(seat.hands.reduce((a, h) => a + h.bet, 0) || seat.bet) : 'No bet'}</span></div>`;
    }).join('');
    if (fresh && S.view === 'blackjack') { sfx.card(); if (fresh > 1) setTimeout(() => sfx.card(), 120); }
    if (s.phase === 'result' && lastPhase !== 'result' && me >= 0 && S.view === 'blackjack') {
      const seat = s.seats[me];
      if (seat && seat.hands.length) {
        const bet = seat.hands.reduce((a, h) => a + h.bet, 0), pay = seat.hands.reduce((a, h) => a + (h.payout || 0), 0);
        resultSound(bet, pay);
        if (pay > bet) pop($('#bj-stage'), (pay / bet).toFixed(2) + '×', '+' + fmt(pay - bet));
      }
    }
    if (s.phase === 'playing' && s.turn && lastPhase === 'playing' && me >= 0 && s.turn.s === me) { /* your turn */ }
    lastPhase = s.phase;
    controls(); tick();
  }
  function controls() {
    const me = mySeat(), seat = me >= 0 ? s.seats[me] : null;
    const myTurn = s.phase === 'playing' && s.turn && s.turn.s === me;
    const hand = myTurn ? seat.hands[s.turn.h] : null;
    $('#bj-bet').disabled = !(seat && !seat.bet && (s.phase === 'idle' || s.phase === 'betting'));
    $('#bj-bet').textContent = !S.me ? 'Sign up to play' : !seat ? 'Take a seat first' : seat.bet && (s.phase === 'idle' || s.phase === 'betting') ? 'Bet placed' : 'Place bet';
    if (!S.me) $('#bj-bet').disabled = false;
    lockBet('blackjack', !!(seat && seat.bet));
    const set = (a, on) => { $(`[data-bj="${a}"]`).disabled = !on; };
    set('hit', myTurn); set('stand', myTurn);
    set('double', myTurn && hand.cards.length === 2);
    set('split', myTurn && seat.hands.length === 1 && hand.cards.length === 2 && R.cardVal(hand.cards[0]) === R.cardVal(hand.cards[1]));
    $('#bj-leave').hidden = !seat;
  }
  function tick() {
    if (!s || S.view !== 'blackjack') return;
    const left = s.endsAt - srvNow(), me = mySeat();
    let label = '', frac = 0;
    if (s.phase === 'idle') label = me >= 0 ? 'Place a bet to start the hand' : 'Take a seat to play';
    else if (s.phase === 'betting') { label = `Dealing in ${secs(left)}`; frac = left / 12000; }
    else if (s.phase === 'playing' && s.turn) { const seat = s.seats[s.turn.s]; label = s.turn.s === me ? `Your turn · ${secs(left)}` : `${seat ? seat.name : 'Player'}'s turn · ${secs(left)}`; frac = left / TURN; }
    else if (s.phase === 'dealer') label = "Dealer's turn";
    else label = 'Results';
    $('#bj-phase').textContent = label;
    $('#bj-phase').parentElement.classList.toggle('hot', s.phase === 'playing' && s.turn && s.turn.s === me);
    $('#bj-timer').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    const tb = $('[data-turnbar]'); if (tb) tb.style.width = Math.max(0, Math.min(1, left / TURN)) * 100 + '%';
  }
  return { init, onTable, tick, onAuth() { if (s) onTable(s); } };
})();

/* ================= JACKPOT (live) ================= */
const Jackpot = (() => {
  let s = null, rolledRound = -1, lastDone = -1;
  const color = name => `hsl(${hue(name)} 55% 45%)`;
  function init() {
    $('#jp-go').addEventListener('click', async () => { if (await act('jp.deposit', { amount: readBet('jackpot') })) sfx.chip(); });
    $('#jp-back').addEventListener('click', async () => { if (await act('jp.withdraw')) sfx.click(); });
  }
  function onTable(st) {
    s = st;
    $('#jp-total').textContent = fmt(s.total);
    const ents = [...s.entries].sort((a, b) => b.amount - a.amount);
    $('#jp-bar').innerHTML = s.total ? s.entries.map(e => `<i style="width:${(e.amount / s.total) * 100}%;background:${color(e.name)}" title="${esc(e.name)}"></i>`).join('') : '';
    $('#jp-entries').innerHTML = ents.length ? ents.map(e => { const me = S.me && e.id === S.me.id; return `<span class="player ${me ? 'me' : ''}">${avatar(e.name, 'sm')}<b>${esc(e.name)}</b>${lvlTag(e.lvl)}<span class="num">${fmt(e.amount)} · ${((e.amount / s.total) * 100).toFixed(1)}%</span></span>`; }).join('') : '<span class="empty">The pot is empty. Put some coins in to start.</span>';
    $('#jp-hist').innerHTML = s.history.slice(0, 8).map(h => `<span class="hchip win">${esc(h.name)} +${fmtShort(h.payout)} (${h.chance}%)</span>`).join('');
    const mine = S.me && s.entries.find(e => e.id === S.me.id);
    $('#jp-go').disabled = s.phase !== 'open';
    $('#jp-back').hidden = !(s.phase === 'open' && s.entries.length === 1 && mine);
    const msg = $('#jp-msg');
    msg.className = 'jp-msg';
    if (s.phase === 'open') { msg.textContent = s.entries.length < 2 ? 'Waiting for a second player to start the timer' : mine ? `You have a ${((mine.amount / s.total) * 100).toFixed(1)}% chance` : 'Add coins to get a chance at the pot'; if (rolledRound !== s.round) resetReel(); }
    if (s.phase === 'rolling' && rolledRound !== s.round) { rolledRound = s.round; roll(Math.max(800, s.endsAt - s.now - 300)); msg.textContent = 'Drawing the winner…'; }
    if (s.phase === 'done' && s.winner) {
      const w = s.winner, meWon = S.me && w.id === S.me.id;
      msg.textContent = meWon ? `You won ${fmt(w.payout)} with a ${w.chance}% chance!` : `${w.name} won ${fmt(w.payout)} with a ${w.chance}% chance`;
      if (meWon) msg.classList.add('win');
      if (lastDone !== s.round) { lastDone = s.round; if (rolledRound !== s.round) { rolledRound = s.round; buildStrip(true); } if (meWon && S.view === 'jackpot') { sfx.win(true); coinShower(70); } else if (mine && S.view === 'jackpot') sfx.lose(); }
    }
    tick();
  }
  function resetReel() { $('#jp-strip').style.transition = 'none'; $('#jp-strip').style.transform = 'translateX(0)'; $('#jp-strip').innerHTML = ''; }
  function buildStrip(snap) {
    const strip = $('#jp-strip'), ents = s.entries, total = s.total;
    const pick = () => { let r = rnd() * total; for (const e of ents) { if (r < e.amount) return e; r -= e.amount; } return ents[0]; };
    const tiles = Array.from({ length: 70 }, pick);
    const wi = 60;
    tiles[wi] = ents.find(e => e.id === s.winner.id) || tiles[wi];
    strip.innerHTML = tiles.map(e => `<span class="jp-tile" style="background:${color(e.name)}">${esc(initial(e.name))}</span>`).join('');
    const reelW = $('#jp-reel').clientWidth, step = 72;
    const target = -(wi * step + 32 - reelW / 2) + (rnd() - 0.5) * 30;
    if (snap) { strip.style.transition = 'none'; strip.style.transform = `translateX(${target}px)`; }
    return target;
  }
  function roll(D) {
    if (!s.winner) return;
    const strip = $('#jp-strip');
    const target = buildStrip(false);
    strip.style.transition = 'none'; strip.style.transform = 'translateX(0)';
    void strip.offsetWidth;
    if (reduced) D = 300;
    strip.style.transition = `transform ${D}ms cubic-bezier(.12,.8,.18,1)`;
    strip.style.transform = `translateX(${target}px)`;
    if (S.view === 'jackpot') { let n = 0; const iv = setInterval(() => { sfx.tick(1 + n / 40); if (++n > 34) clearInterval(iv); }, D / 40); }
  }
  function tick() {
    if (!s || S.view !== 'jackpot') return;
    $('#jp-time').textContent = s.phase === 'open' && s.endsAt ? secs(s.endsAt - srvNow()) : s.phase === 'open' ? '—' : 'Now';
  }
  return { init, onTable, tick };
})();

/* ================= COINFLIP (live + house) ================= */
const Coinflip = (() => {
  let side = 'heads', flipping = false, angle = 0, s = null;
  const seen = new Set();
  function init() {
    $('#cf-pick').addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (!b) return; side = b.dataset.side; $$('#cf-pick button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); sfx.click(); });
    $('#cf-create').addEventListener('click', async () => { if (await act('cf.create', { amount: readBet('coinflip'), side })) { sfx.chip(); toast('Flip created. Waiting for someone to join', 'good'); } });
    $('#cf-house').addEventListener('click', houseFlip);
    $('#cf-list').addEventListener('click', async e => {
      const j = e.target.closest('[data-join]'), c = e.target.closest('[data-cancel]');
      if (j) {
        const f = s && s.flips.find(x => x.id === +j.dataset.join);
        if (!f) return;
        hold(f.bet);
        const r = await act('cf.join', { id: f.id });
        if (!r) { release(); return; }
        seen.add(f.id);
        await animate(r.result);
        show(r.win, r.result, r.payout, f.bet);
        release(r.payout);
      }
      if (c && (await act('cf.cancel', { id: +c.dataset.cancel }))) sfx.click();
    });
  }
  async function animate(result) {
    flipping = true;
    const coin = $('#cf-coin');
    angle = Math.ceil(angle / 360) * 360 + 360 * 5 + (result === 'tails' ? 180 : 0);
    coin.style.transform = `rotateY(${angle}deg)`;
    $('#cf-msg').className = 'cf-msg'; $('#cf-msg').textContent = 'Flipping…';
    sfx.flip();
    await sleep(reduced ? 80 : 1650);
    flipping = false;
  }
  function show(win, result, payout, bet) {
    const m = $('#cf-msg'), name = result === 'heads' ? 'Heads' : 'Tails';
    m.className = 'cf-msg ' + (win ? 'win' : 'lose');
    m.textContent = win ? `${name}! You won ${fmt(payout)}` : `${name}. You lost ${fmt(bet)}`;
    resultSound(bet, win ? payout : 0);
  }
  async function houseFlip() {
    if (flipping) return;
    const bet = readBet('coinflip');
    if (!S.me) { Auth.open('signup'); return; }
    hold(bet);
    const r = await act('cf.house', { amount: bet, side });
    if (!r) { release(); return; }
    await animate(r.result);
    show(r.win, r.result, r.payout, bet);
    release(r.payout);
  }
  function onTable(st) {
    s = st;
    for (const f of s.flips) {
      if (f.state === 'done' && !seen.has(f.id)) {
        seen.add(f.id);
        if (S.me && f.uid === S.me.id && S.view === 'coinflip' && !flipping) {
          const win = f.winner === S.me.id;
          animate(f.result).then(() => show(win, f.result, Math.floor(f.bet * 2 * 0.98), f.bet));
        }
      }
    }
    $('#cf-list').innerHTML = s.flips.length ? s.flips.map(f => {
      const me = S.me && f.uid === S.me.id, other = f.side === 'heads' ? 'tails' : 'heads';
      let foot = '';
      if (f.state === 'open') foot = me ? `<button class="btn-ghost sm" type="button" data-cancel="${f.id}">Cancel</button>` : `<button class="btn-go sm" type="button" data-join="${f.id}">Join as ${other}</button>`;
      else { const wName = f.winner === f.uid ? f.name : f.joiner ? f.joiner.name : ''; foot = `<span class="res ${S.me && f.winner === S.me.id ? 'pos' : ''}">${f.result === 'heads' ? 'Heads' : 'Tails'} · ${esc(wName)} won</span>`; }
      return `<div class="flip ${me ? 'mine' : ''} ${f.state === 'done' ? 'done' : ''}"><div class="flip-top">${avatar(f.name)}<span class="li-name"><b>${esc(f.name)}${lvlTag(f.lvl)}</b><span>${f.state === 'done' && f.joiner ? 'vs ' + esc(f.joiner.name) : 'picked ' + f.side}</span></span><span class="mini-coin ${f.side === 'tails' ? 't' : ''}"></span></div><div class="flip-amt"><span class="coin sm"></span>${fmt(f.bet)}</div>${foot}</div>`;
    }).join('') : '<p class="empty">No open flips. Create one and someone can take the other side.</p>';
  }
  return { init, onTable };
})();

/* ================= routing ================= */
const GAME = { roulette: Roulette, crash: Crash, blackjack: Blackjack, jackpot: Jackpot, coinflip: Coinflip };
function route() {
  let v = (location.hash || '').slice(1), param = null;
  const pm = v.match(/^(case|battle)-(\d+)$/);
  if (pm) { v = pm[1]; param = +pm[2]; }
  if (!VIEWS.has(v) || (v === 'admin' && !(S.me && S.me.admin)) || ((v === 'case' || v === 'battle') && param == null)) v = 'lobby';
  const changed = v !== S.view;
  S.view = v;
  $$('[data-view]').forEach(sec => (sec.hidden = sec.dataset.view !== v));
  markNav();
  if (v !== 'crash') sfx.rocket.stop();
  watchCurrent();
  const g = GAME[v];
  if (g && g.onRoute) g.onRoute(param);
  if (g && g.onShow) g.onShow();
  if (v === 'leaderboard') loadLB();
  if (v === 'lobby') loadLobbyLB();
  if (changed) scrollTo(0, 0);
}
export { srvNow, lvlTag, $, $$, S, R, sfx, act, hold, release, readBet, lockBet, fmt, fmtShort, esc, toast, pop, shake, pushHist, resultSound, coinShower, fitCanvas, C, MONO, TAU, reduced, sleep, mix, cardHtml, avatar, GAME, betBox, Auth };

/* ================= boot ================= */
Promise.all([import('./solo.js'), import('./cases.js')]).then(([mod, cmod]) => {
  readColors();
  if (LOCAL) { document.body.classList.add('local'); $('#local-note').hidden = false; }
  $$('[data-betbox]').forEach(el => { el.outerHTML = betBox(el.dataset.betbox); });
  $('#grid-live').innerHTML = LIVE_GAMES.map(g => tile(g, true)).join('');
  $('#grid-solo').innerHTML = SOLO_GAMES.map(g => tile(g, false)).join('');
  $('#grid-cases').innerHTML = CASE_GAMES.map(g => tile(g, false)).join('');
  $('#lb-tabs').innerHTML = Object.entries(LB).map(([k, v]) => `<button type="button" role="tab" data-act="lb-tab" data-tab="${k}" aria-selected="${k === S.lbTab}">${v.label}</button>`).join('');
  buildRainCards(); buildNav();
  const sb = $('#sound-btn');
  const paintSound = () => { sb.innerHTML = Sound.muted ? ICON.soundOff : ICON.soundOn; sb.setAttribute('aria-label', Sound.muted ? 'Sound off' : 'Sound on'); };
  paintSound();
  sb.addEventListener('click', () => { Sound.toggle(); paintSound(); });
  $('#me-chip').addEventListener('click', () => { const m = $('#me-menu'); m.hidden = !m.hidden; $('#me-chip').setAttribute('aria-expanded', String(!m.hidden)); });
  $('#auth-tabs').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) Auth.open(b.dataset.mode); });
  $('#auth-form').addEventListener('submit', e => { e.preventDefault(); Auth.submit(); });
  $('#auth-cancel').addEventListener('click', () => Auth.close());
  Chat.init();
  Roulette.init(); Crash.init(); Blackjack.init(); Jackpot.init(); Coinflip.init();
  mod.initSolo();
  Object.assign(GAME, mod.SOLO);
  cmod.initCases();
  Object.assign(GAME, cmod.CASEMODS);
  renderChrome(); renderFeed(); renderTimers();
  route();
  addEventListener('hashchange', route);
  let rsz = 0;
  addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { const g = GAME[S.view]; if (g && g.onShow) g.onShow(); }, 120); });
  setInterval(() => { Roulette.tick(); Blackjack.tick(); Jackpot.tick(); if (S.view === 'crash' && !(S.tables.crash && S.tables.crash.phase === 'running')) Crash.tick(); }, 250);
  let secs1 = 0;
  setInterval(() => { renderTimers(); const g = GAME[S.view]; if (g && g.tick1) g.tick1(); if (secs1 % 5 === 0) renderLevel(); if (++secs1 % 30 === 0 && S.view === 'lobby' && Net.up) loadLobbyLB(); }, 1000);
  setInterval(() => { if (S.view === 'leaderboard' && Net.up) loadLB(); }, 20000);
  if (!S.token) setTimeout(() => { if (!S.me && $('#auth-modal').hidden) Auth.open('signup'); }, 1200);
  Net.connect();
});
const Mines = { resume: g => GAME.mines && GAME.mines.resume(g) };
const Towers = { resume: g => GAME.towers && GAME.towers.resume(g) };
const HiLo = { resume: g => GAME.hilo && GAME.hilo.resume(g) };
