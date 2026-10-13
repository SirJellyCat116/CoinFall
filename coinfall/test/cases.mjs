// Tests levels, rakeback, free cases, case opening and case battles.
// Start the server with TIME_SCALE=0.1 first, then: node test/cases.mjs
import { CASES, FREE_CASES, levelOf } from '../public/shared.js';
const URL = process.env.WS_URL || 'ws://localhost:8787/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { if (c) console.log('  ok  ', msg); else { failures++; console.log('  FAIL', msg); } };
function client() {
  const ws = new WebSocket(URL);
  const c = { ws, me: null, tables: {}, toasts: [], seq: 1, wait: new Map() };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'res') { const w = c.wait.get(m.rid); if (w) { c.wait.delete(m.rid); if (w.game && m.ok && m.d) c.tables[w.game] = m.d; m.ok ? w.res(m.d) : w.rej(new Error(m.e)); } }
    else if (m.t === 'me') c.me = m.me; else if (m.t === 'table') c.tables[m.game] = m.s; else if (m.t === 'toast') c.toasts.push(m);
  };
  c.call = (t, d = {}) => new Promise((res, rej) => { const rid = c.seq++; c.wait.set(rid, { res, rej, game: t === 'watch' ? d.game : null }); ws.send(JSON.stringify({ ...d, t, rid })); });
  c.ready = new Promise(r => (ws.onopen = r));
  return c;
}
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(50); } return false; }
async function err(p) { try { await p; return null; } catch (e) { return e.message; } }

const A = client(), B = client();
await Promise.all([A.ready, B.ready]);
const n = Math.floor(Math.random() * 1e5);
await A.call('register', { name: 'cA' + n, pass: 'abcd' });
await B.call('register', { name: 'cB' + n, pass: 'abcd' });
await sleep(100);

console.log('levels + rakeback');
ok(A.me.level === 1, 'new player is level 1');
await A.call('dice.roll', { amount: 5000, target: 50, over: true });
await sleep(100);
ok(A.me.rake === 12, `rakeback after a 50-coin bet at 0.25%: ${A.me.rake} cents`);
const rc = await A.call('rake.claim');
ok(rc.amount === 12, 'claimed rakeback');
ok(await err(A.call('rake.claim')), 'nothing left to claim');

console.log('free cases');
const f0 = await A.call('free.open', { i: 0 });
ok(f0.value === FREE_CASES[0].items[f0.idx].value, `Starter Case gave ${f0.value / 100} coins (${FREE_CASES[0].items[f0.idx].name})`);
ok(/not ready/.test(await err(A.call('free.open', { i: 0 }))), 'Starter Case is on cooldown');
ok(/level 2/.test(await err(A.call('free.open', { i: 1 }))), 'Bronze Case locked until level 2');

console.log('case opening');
const bal0 = A.me.balance;
const co = await A.call('case.open', { id: 3 });
await sleep(100);
ok(A.me.balance === bal0 - CASES[3].price + co.value, `opened ${CASES[3].name} for ${CASES[3].price / 100}, got ${co.value / 100}`);

console.log('case battle 1v1 with a bot');
await A.call('watch', { game: 'battles' }); await B.call('watch', { game: 'battles' });
const cases = [0, 1, 2];
const cost = cases.reduce((a, id) => a + CASES[id].price, 0);
const b1 = await A.call('battle.create', { mode: '1v1', cases });
ok(await until(() => B.tables.battles && B.tables.battles.battles.some(x => x.id === b1.id && x.state === 'open')), 'B sees the open battle');
ok(/Only the player/.test(await err(B.call('battle.bots', { id: b1.id }))), 'only creator can call bots');
const a1 = A.me.balance;
await A.call('battle.bots', { id: b1.id });
ok(await until(() => { const x = A.tables.battles.battles.find(y => y.id === b1.id); return x && x.state === 'done'; }, 30000), 'battle finished');
const done = A.tables.battles.battles.find(y => y.id === b1.id);
const exp = done.seats.reduce((a, s) => a + s.total, 0);
ok(done.pot === exp && done.seats.every(s => s.drops.length === 3), `pot ${exp / 100}, 3 rounds each`);
await sleep(150);
const won = done.winners.includes(0);
ok(A.me.balance === a1 + (won ? Math.floor(exp / done.winners.length) : 0), `A ${won ? 'won' : 'lost'}: balance correct`);

console.log('2v2 cursed: B joins, bots fill the rest');
const b2 = await A.call('battle.create', { mode: '2v2', cursed: true, cases: [5] });
await B.call('battle.join', { id: b2.id });
ok(/already/.test(await err(B.call('battle.join', { id: b2.id }))), 'cannot join twice');
const aB = A.me.balance, bB = B.me.balance;
await A.call('battle.bots', { id: b2.id });
ok(await until(() => { const x = A.tables.battles.battles.find(y => y.id === b2.id); return x && x.state === 'done'; }, 30000), '2v2 finished');
const d2 = A.tables.battles.battles.find(y => y.id === b2.id);
const tA = d2.seats[0].total + d2.seats[1].total, tB = d2.seats[2].total + d2.seats[3].total;
ok(d2.winners.length >= 2 && (tA === tB || (tA < tB ? d2.winners.includes(0) : d2.winners.includes(2))), `cursed: lower team wins (team totals ${tA / 100} vs ${tB / 100}, winners ${d2.winners})`);
await sleep(150);
const share = Math.floor(d2.pot / d2.winners.length);
ok(A.me.balance - aB === (d2.winners.includes(0) ? share : 0) && B.me.balance - bB === (d2.winners.includes(1) ? share : 0), 'A and B (same team) paid correctly');

console.log('cancel refunds');
const b3 = await A.call('battle.create', { mode: '1v1v1v1', cases: [10, 11] });
const a3 = A.me.balance;
await A.call('battle.leave', { id: b3.id });
await sleep(100);
ok(A.me.balance === a3 + CASES[10].price + CASES[11].price, 'creator cancel refunds');
ok(A.me.level === levelOf(A.me.wagered), `level ${A.me.level} matches wagered ${A.me.wagered / 100}`);

console.log('high roller cases + 50-case battles');
ok(CASES.length === 120 && CASES[99].price === 2500000 && CASES[119].price === 1e8, '120 cases, old ones unchanged, top case costs 1,000,000 coins');
ok(CASES.slice(100).every(c => c.tier === 3 && c.price > 2500000), 'cases 100-119 are high roller');
ok(/only have/.test(await err(A.call('case.open', { id: 119 }))), 'cannot open the Millionaire Vault without the coins');
ok(/1 to 50/.test(await err(A.call('battle.create', { mode: '1v1', cases: Array(51).fill(0) }))), '51 cases is too many');
const a4 = A.me.balance;
const b4 = await A.call('battle.create', { mode: '1v1', cases: Array(50).fill(0) });
await sleep(100);
ok(A.me.balance === a4 - 50 * CASES[0].price, `50-case battle costs ${50 * CASES[0].price / 100} coins`);
await A.call('battle.bots', { id: b4.id });
ok(await until(() => { const x = A.tables.battles.battles.find(y => y.id === b4.id); return x && x.state === 'done'; }, 60000), '50-case battle finished');
const d4 = A.tables.battles.battles.find(y => y.id === b4.id);
ok(d4.seats.every(s => s.drops.length === 50), 'every player opened 50 cases');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
