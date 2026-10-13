// New games, admin tools, settings, rain cap and version check. Fresh database, server on :8787 (TIME_SCALE=0.1), then: node test/admin.mjs
import { VERSION, BAC_PAY, bacTotal, vpHand, vpMult, diamondsHand, diamondsMult, pumpMult, upgChance } from '../public/shared.js';
const URL = process.env.WS_URL || 'ws://localhost:8787/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
let failures = 0;
const ok = (c, msg) => { if (c) console.log('  ok  ', msg); else { failures++; console.log('  FAIL', msg); } };
function client() {
  const ws = new WebSocket(URL);
  const c = { ws, me: null, hi: null, cfg: null, rain: null, ann: undefined, chat: [], toasts: [], kicked: null, seq: 1, wait: new Map() };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'res') { const w = c.wait.get(m.rid); if (w) { c.wait.delete(m.rid); m.ok ? w.res(m.d) : w.rej(new Error(m.e)); } }
    else if (m.t === 'hi') { c.hi = m; c.cfg = m.cfg; }
    else if (m.t === 'cfg') c.cfg = m.cfg;
    else if (m.t === 'me') c.me = m.me;
    else if (m.t === 'rain') c.rain = m.s;
    else if (m.t === 'announce') c.ann = m.a;
    else if (m.t === 'chat') c.chat = m.items; else if (m.t === 'chatmsg') c.chat.push(m.m);
    else if (m.t === 'toast') c.toasts.push(m.m);
    else if (m.t === 'kicked') c.kicked = m.m;
  };
  c.call = (t, d = {}) => new Promise((res, rej) => { const rid = c.seq++; c.wait.set(rid, { res, rej }); ws.send(JSON.stringify({ ...d, t, rid })); });
  c.ready = new Promise(r => (ws.onopen = r));
  return c;
}
async function err(p) { try { await p; return null; } catch (e) { return e.message; } }

const A = client(), B = client(), C = client();
await Promise.all([A.ready, B.ready, C.ready]);
const n = Math.floor(Math.random() * 1e5);
await A.call('register', { name: 'own' + n, pass: 'abcd' });
await B.call('register', { name: 'bob' + n, pass: 'abcd' });
await C.call('register', { name: 'cat' + n, pass: 'abcd' });
await sleep(150);

console.log('version + settings');
ok(A.hi.v === VERSION, `server says version ${A.hi.v}`);
ok(A.cfg && A.cfg.hourly === 20 && A.cfg.rainMax === 1000, 'settings arrive with hi');
ok(/does not know that action/.test(await err(A.call('nope.nothing'))), 'unknown action explains itself');

if (!A.me.admin) { console.log('  (A is not the first account; run this on a fresh database)'); process.exit(1); }

console.log('admin: players');
ok(/Admins only/.test(await err(B.call('admin.overview'))), 'players cannot use admin tools');
const ov = await A.call('admin.overview');
ok(ov.owner && ov.players >= 3, `overview: owner, ${ov.players} players, ${ov.online} online`);
const found = await A.call('admin.find', { q: 'bob' + n });
ok(found.length === 1 && found[0].online && found[0].level === 1, 'find shows online and level');
const bid = found[0].id, cid = (await A.call('admin.find', { q: 'cat' + n }))[0].id;
await A.call('admin.set', { id: bid, balance: 123456 });
await sleep(80);
ok(B.me.balance === 123456, 'set coins to an exact amount');
await A.call('admin.grant', { id: bid, amount: -456 });
await sleep(80);
ok(B.me.balance === 123000, 'take coins');
await A.call('admin.role', { id: bid, admin: true });
await sleep(80);
ok(B.me.admin, 'owner made B an admin');
ok(/Only the owner/.test(await err(B.call('admin.ban', { id: A.me.id, banned: true }))), 'admins cannot ban the owner');
ok(/Only the owner/.test(await err(B.call('admin.role', { id: cid, admin: true }))), 'only the owner adds admins');
await B.call('admin.mute', { id: cid, minutes: 60 });
ok(/muted/.test(await err(C.call('chat.send', { text: 'hi' }))), 'B (admin) muted C');
await B.call('admin.mute', { id: cid, minutes: 0 });
await A.call('admin.role', { id: bid, admin: false });
await sleep(80);
ok(!B.me.admin, 'owner removed B as admin');
await A.call('dice.roll', { amount: 1000, target: 50, over: true });
await A.call('admin.stats', { id: A.me.id });
await sleep(80);
ok(A.me.wagered === 0 && A.me.bets === 0, 'reset level and stats');
await A.call('admin.kick', { id: cid });
await sleep(100);
ok(C.kicked && /logged you out/.test(C.kicked), 'kick logs the player out');
ok(/Log in/.test(await err(C.call('daily'))), 'kicked player is logged out');

console.log('admin: site tools');
const before = B.me.balance;
const g = await A.call('admin.giveall', { amount: 500, online: true });
await sleep(80);
ok(g.n >= 2 && B.me.balance === before + 500, `gave 5 coins to ${g.n} online players`);
await A.call('admin.announce', { text: 'Double rain at 8pm' });
await sleep(80);
ok(B.ann && B.ann.text === 'Double rain at 8pm', 'announcement reached players');
await A.call('admin.announce', { text: '' });
await sleep(80);
ok(B.ann === null, 'announcement removed');
await A.call('admin.settings', { set: { hourly: 35, rainMax: 50, tips: false, chatSlow: 0 } });
await sleep(80);
ok(B.cfg.hourly === 35 && B.cfg.rainMax === 50 && B.cfg.tips === false, 'settings pushed to everyone');
ok(/turned off/.test(await err(B.call('chat.tip', { to: 'own' + n, amount: 100 }))), 'tips can be turned off');
await A.call('admin.set', { id: A.me.id, balance: 10000000 });
await A.call('dice.roll', { amount: 1000000, target: 50, over: true });
await A.call('dice.roll', { amount: 1000000, target: 50, over: true });
await sleep(2300);
ok(B.rain.pot <= 5000, `rain stays under its limit: ${B.rain.pot / 100} coins (limit 50)`);
await A.call('admin.rain', { amount: 10000 });
await sleep(80);
ok(B.rain.pot >= 10000, 'admin can add past the limit');
await A.call('admin.settings', { set: { hourly: 20, rainMax: 1000, tips: true, chatSlow: 1.5 } });
await A.call('admin.clearchat');
await sleep(80);
ok(B.chat.length === 0, 'chat cleared');
ok(/Type RESET/.test(await err(A.call('admin.reset', { balance: 10000, confirm: 'no' }))), 'reset needs RESET typed');
await A.call('admin.reset', { balance: 10000, stats: true, confirm: 'reset' });
await sleep(100);
ok(A.me.balance === 10000 && B.me.balance === 10000 && B.me.wagered === 0, "reset everyone's coins and levels");
const log = (await A.call('admin.overview')).log;
ok(log.length >= 10 && log.some(l => /Reset everyone/.test(l.text)), `admin log has ${log.length} entries`);

console.log('new games');
await A.call('admin.set', { id: A.me.id, balance: 10000000 });
let bacOk = true;
for (let i = 0; i < 30; i++) {
  await sleep(30);
  const r = await A.call('bac.play', { player: 100, banker: 200, tie: 50 });
  const exp = Math.floor(r.winner === 'tie' ? 50 * BAC_PAY.tie + 300 : r.winner === 'player' ? 100 * BAC_PAY.player : 200 * BAC_PAY.banker);
  if (r.payout !== exp || bacTotal(r.P) !== r.p || bacTotal(r.B) !== r.b) bacOk = false;
}
ok(bacOk, 'baccarat pays Player 2×, Banker 1.95×, Tie 9× (bets back on a tie)');
const d1 = await A.call('vp.deal', { amount: 1000 });
ok(d1.cards.length === 5 && new Set(d1.cards.map(c => c.r + '-' + c.s)).size === 5, 'video poker deals 5 different cards');
ok(/Finish/.test(await err(A.call('vp.deal', { amount: 1000 }))), 'one hand at a time');
const d2 = await A.call('vp.draw', { hold: [true, true, false, false, false] });
ok(d2.cards[0].r === d1.cards[0].r && d2.cards[1].s === d1.cards[1].s && d2.payout === Math.floor(1000 * vpMult(vpHand(d2.cards))), `kept 2 cards, drew 3: ${d2.hand || 'nothing'} pays ${d2.payout / 100}`);
let dmOk = true;
for (let i = 0; i < 20; i++) { await sleep(30); const r = await A.call('diamonds.play', { amount: 1000 }); if (r.gems.length !== 5 || r.payout !== Math.floor(1000 * diamondsMult(diamondsHand(r.gems)))) dmOk = false; }
ok(dmOk, 'diamonds pays by its table');
await A.call('pump.start', { amount: 1000, diff: 'easy' });
const p1 = await A.call('pump.pump');
if (!p1.pop) {
  ok(p1.k === 1 && p1.mult === pumpMult('easy', 1), 'pump once on easy: ' + p1.mult + '×');
  const c1 = await A.call('pump.cashout');
  ok(c1.payout === Math.floor(1000 * pumpMult('easy', 1)), 'pump cash out pays');
} else ok(true, 'balloon popped on the first pump (1 in 25)');
ok(/Pick 1.1/.test(await err(A.call('upgrade.play', { amount: 1000, mult: 500 }))), 'upgrader limits the target');
let wins = 0;
for (let i = 0; i < 40; i++) { await sleep(30); const r = await A.call('upgrade.play', { amount: 100, mult: 2 }); if (r.win !== r.roll < upgChance(2) || r.payout !== (r.win ? 200 : 0)) wins = -999; else wins += r.win; }
ok(wins >= 0, `upgrader at 2×: won ${wins} of 40`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
