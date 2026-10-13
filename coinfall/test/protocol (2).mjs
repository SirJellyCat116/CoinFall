// End-to-end protocol test. Start the server first:
//   TIME_SCALE=0.15 DB_FILE=/tmp/cf-test.db node dev/server.mjs
// then run: node test/protocol.mjs
const URL = process.env.WS_URL || 'ws://localhost:8787/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ', msg); else { failures++; console.log('  FAIL', msg); } };

function client(label) {
  const ws = new WebSocket(URL);
  const c = { ws, label, me: null, tables: {}, toasts: [], wins: [], rain: null, seq: 1, wait: new Map() };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'res') { const w = c.wait.get(m.rid); if (w) { c.wait.delete(m.rid); if (w.game && m.ok && m.d) c.tables[w.game] = m.d; m.ok ? w.res(m.d) : w.rej(new Error(m.e)); } }
    else if (m.t === 'me') c.me = m.me;
    else if (m.t === 'table') c.tables[m.game] = m.s;
    else if (m.t === 'toast') c.toasts.push(m.m);
    else if (m.t === 'win') c.wins.push(m.item);
    else if (m.t === 'rain') c.rain = m.s;
  };
  c.call = (t, d = {}) => new Promise((res, rej) => { const rid = c.seq++; c.wait.set(rid, { res, rej, game: t === 'watch' ? d.game : null }); ws.send(JSON.stringify({ ...d, t, rid })); });
  c.ready = new Promise(r => { ws.onopen = r; });
  return c;
}
async function expectErr(p, msg) { try { await p; ok(false, msg + ' (expected an error)'); } catch (e) { ok(true, msg + ' → "' + e.message + '"'); } }
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(50); } return false; }

const A = client('A'), B = client('B');
await Promise.all([A.ready, B.ready]);
const suffix = Math.floor(Math.random() * 1e5);
const nameA = 'alice' + suffix, nameB = 'bob' + suffix;

console.log('accounts');
const ra = await A.call('register', { name: nameA, pass: 'secret1' });
ok(ra.token && ra.me.balance === 10000, 'register gives 100 coins');
await expectErr(B.call('register', { name: nameA.toUpperCase(), pass: 'x1234' }), 'duplicate name (case-insensitive) rejected');
await expectErr(B.call('register', { name: 'fuckface', pass: 'x1234' }), 'rude name rejected');
const rb = await B.call('register', { name: nameB, pass: 'secret2' });
ok(rb.me.name === nameB, 'second account');
await expectErr(B.call('login', { name: nameA, pass: 'wrong' }), 'wrong password rejected');
const C = client('C'); await C.ready;
const hc = await C.call('hello', { token: ra.token });
ok(hc.me.name === nameA, 'session token logs back in');
C.ws.close();

console.log('rewards');
const d = await A.call('daily');
ok(d.amount === 10000 && A.me.balance === 20000, 'daily +100');
await expectErr(A.call('daily'), 'daily twice rejected');
await A.call('rain.join');
ok(A.rain && A.rain.joined, 'joined rain');
await A.call('rain.tip', { amount: 500 });
ok(A.me.balance === 19500, 'tip deducted');

console.log('solo games');
let r = await A.call('dice.roll', { amount: 100, target: 50, over: true });
ok(typeof r.roll === 'number' && (r.win ? r.payout === 198 : r.payout === 0), `dice ${r.roll} win=${r.win} payout=${r.payout}`);
await expectErr(A.call('dice.roll', { amount: 100, target: 99, over: true }), 'dice bad target');
await expectErr(A.call('dice.roll', { amount: 10e9, target: 50, over: true }), 'bet above balance');
r = await A.call('limbo.play', { amount: 100, target: 2 });
ok(r.result >= 1 && (r.win === (r.result >= 2)), `limbo result ${r.result}`);
r = await A.call('plinko.drop', { amount: 100, rows: 16, risk: 'high' });
ok(r.bits.length === 16 && r.idx === r.bits.reduce((a, b) => a + b, 0), `plinko idx ${r.idx} mult ${r.mult}`);
r = await A.call('keno.play', { amount: 100, picks: [1, 2, 3, 4, 5] });
ok(r.drawn.length === 10 && new Set(r.drawn).size === 10, `keno hits ${r.hits} mult ${r.mult}`);
r = await A.call('wheel.spin', { amount: 100, risk: 'low' });
ok(r.idx >= 0 && r.idx < 30, `wheel idx ${r.idx} mult ${r.mult}`);
r = await A.call('slots.spin', { amount: 100 });
ok(r.reels.length === 3, `slots ${r.reels} mult ${r.mult}`);
r = await A.call('cf.house', { amount: 100, side: 'heads' });
ok(['heads', 'tails'].includes(r.result), `house flip ${r.result} win=${r.win}`);

await A.call('mines.start', { amount: 100, mines: 3 });
await expectErr(A.call('mines.start', { amount: 100, mines: 3 }), 'second mines round blocked');
let picked = 0, minesDone = false;
for (let i = 0; i < 25 && !minesDone; i++) {
  r = await A.call('mines.pick', { i });
  if (r.mine) { minesDone = true; ok(r.mines.length === 3, 'hit a mine, mines revealed'); }
  else { picked++; if (picked === 2) { const co = await A.call('mines.cashout'); ok(co.payout > 0, `mines cashout ${co.mult}x`); minesDone = true; } }
}

await A.call('towers.start', { amount: 100, diff: 'easy' });
r = await A.call('towers.pick', { c: 0 });
if (r.safe) { const co = await A.call('towers.cashout'); ok(co.payout === Math.floor(100 * co.mult), `towers cashout ${co.mult}x`); }
else ok(r.bomb, 'towers bomb');

r = await A.call('hilo.start', { amount: 100 });
ok(r.card && r.card.r >= 1, 'hilo start');
const dir = r.card.r === 1 ? 'lo' : r.card.r === 13 ? 'hi' : r.card.r <= 7 ? 'hi' : 'lo';
r = await A.call('hilo.guess', { dir });
if (r.win) { const co = await A.call('hilo.cashout'); ok(co.payout >= 100, `hilo cashout ${co.mult}x`); } else ok(r.win === false, 'hilo lost');

console.log('roulette (shared)');
await A.call('watch', { game: 'roulette' }); await B.call('watch', { game: 'roulette' });
await until(() => A.tables.roulette && A.tables.roulette.phase === 'betting' && A.tables.roulette.endsAt - Date.now() > 1000);
const balA0 = A.me.balance;
await A.call('rl.bet', { bets: [['red', 200], ['n17', 100]] });
await B.call('rl.bet', { bets: [['black', 300]] });
ok(await until(() => B.tables.roulette.players.length === 2, 3000), 'B sees both players at the table');
ok(A.me.balance === balA0 - 300, 'A charged 3 coins');
const spinOK = await until(() => A.tables.roulette.phase === 'result', 20000);
const res = A.tables.roulette.result.n;
const pa = A.tables.roulette.players.find(p => p.name === nameA);
const exp = (res !== 0 && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(res) ? 400 : 0) + (res === 17 ? 3600 : 0);
ok(spinOK && pa.payout === exp, `roulette landed ${res}, A paid ${pa && pa.payout} (expected ${exp})`);

console.log('crash (shared)');
await A.call('watch', { game: 'crash' }); await B.call('watch', { game: 'crash' });
await until(() => A.tables.crash && A.tables.crash.phase === 'betting', 20000);
await A.call('cr.bet', { amount: 100, auto: 1.01 });
await B.call('cr.bet', { amount: 100 });
await until(() => A.tables.crash.phase === 'running' || A.tables.crash.phase === 'crashed', 10000);
let bco = null;
try { bco = await B.call('cr.cashout'); } catch (e) { bco = { err: e.message }; }
await until(() => A.tables.crash.phase === 'crashed', 60000);
const cs = A.tables.crash;
const pA = cs.players.find(p => p.name === nameA);
ok(cs.cp != null, `crashed at ${cs.cp}x`);
ok(cs.cp >= 1.01 ? pA.cashed === 1.01 && pA.payout === 101 : pA.payout === 0, `A auto-cashout handled (cashed ${pA.cashed})`);
ok(bco.err ? cs.cp < 1.5 : bco.payout >= 100, `B manual cashout ${JSON.stringify(bco)}`);

console.log('blackjack (shared)');
await A.call('watch', { game: 'blackjack' }); await B.call('watch', { game: 'blackjack' });
await A.call('bj.sit', { seat: 0 }); await B.call('bj.sit', { seat: 1 });
await expectErr(B.call('bj.sit', { seat: 0 }), 'taken seat rejected');
await A.call('bj.bet', { amount: 100 }); await B.call('bj.bet', { amount: 100 });
await until(() => ['playing', 'dealer', 'result'].includes(A.tables.blackjack.phase), 8000);
for (let k = 0; k < 20; k++) {
  const s = A.tables.blackjack;
  if (s.phase !== 'playing' || !s.turn) break;
  const seat = s.seats[s.turn.s];
  const who = seat.name === nameA ? A : B;
  const v = seat.hands[s.turn.h].value.t;
  try { await who.call('bj.act', { a: v < 15 ? 'hit' : 'stand' }); } catch (e) { console.log('    (act)', e.message); }
  await sleep(80);
}
const bjDone = await until(() => A.tables.blackjack.phase === 'result', 15000);
const bs = A.tables.blackjack;
ok(bjDone && bs.seats[0].hands[0].res && bs.seats[1].hands[0].res, `blackjack results: A ${bs.seats[0].hands[0].res}, B ${bs.seats[1].hands[0].res}, dealer ${bs.dealerValue && bs.dealerValue.t}`);

console.log('jackpot (shared)');
await A.call('watch', { game: 'jackpot' }); await B.call('watch', { game: 'jackpot' });
await until(() => A.tables.jackpot && A.tables.jackpot.phase === 'open', 15000);
const tA = A.me.balance + 0, tB = B.me.balance + 0;
await A.call('jp.deposit', { amount: 300 });
await B.call('jp.deposit', { amount: 100 });
ok(await until(() => A.tables.jackpot.total === 400 && A.tables.jackpot.endsAt > 0, 3000), 'pot 4 coins, countdown started');
await until(() => A.tables.jackpot.phase === 'done', 20000);
const w = A.tables.jackpot.winner;
await sleep(200);
ok(w && w.payout === 392, `jackpot winner ${w && w.name} gets 3.92`);
ok((w.name === nameA ? A.me.balance - tA : B.me.balance - tB) === 392 - (w.name === nameA ? 300 : 100), 'winner balance correct');

console.log('coinflip (PvP)');
await A.call('watch', { game: 'coinflip' }); await B.call('watch', { game: 'coinflip' });
const f = await A.call('cf.create', { amount: 500, side: 'heads' });
ok(await until(() => B.tables.coinflip && B.tables.coinflip.flips.some(x => x.id === f.id && x.state === 'open'), 3000), 'B sees the open flip');
await expectErr(A.call('cf.join', { id: f.id }), 'cannot join own flip');
const a0 = A.me.balance, b0 = B.me.balance;
const j = await B.call('cf.join', { id: f.id });
await sleep(150);
const winA = j.result === 'heads';
ok(winA ? A.me.balance - a0 === 980 && B.me.balance - b0 === -500 : B.me.balance - b0 === 480 && A.me.balance === a0, `flip ${j.result}: payouts correct`);
const f2 = await A.call('cf.create', { amount: 100, side: 'tails' });
const a1 = A.me.balance;
await A.call('cf.cancel', { id: f2.id });
await sleep(100);
ok(A.me.balance === a1 + 100, 'cancel refunds');

console.log('leaderboard + admin');
const lb = await A.call('lb', { tab: 'balance' });
ok(lb.length >= 2 && lb[0].balance >= lb[1].balance, 'leaderboard sorted');
const isAdmin = !!A.me.admin;
if (isAdmin) {
  const found = await A.call('admin.find', { q: nameB });
  ok(found.length === 1, 'admin finds B');
  const before = B.me.balance;
  await A.call('admin.grant', { id: found[0].id, amount: 1000 });
  await sleep(100);
  ok(B.me.balance === before + 1000, 'admin grant');
} else {
  await expectErr(A.call('admin.find', { q: 'x' }), 'non-admin blocked (not the first account on this database)');
}
ok(A.wins.length >= 0, `live wins feed received ${A.wins.length} items`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
