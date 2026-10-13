// Chat + tips test. Fresh database, server on :8787, then: node test/chat.mjs
const URL = process.env.WS_URL || 'ws://localhost:8787/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { if (c) console.log('  ok  ', msg); else { failures++; console.log('  FAIL', msg); } };
function client() {
  const ws = new WebSocket(URL);
  const c = { ws, me: null, chat: [], toasts: [], seq: 1, wait: new Map() };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'res') { const w = c.wait.get(m.rid); if (w) { c.wait.delete(m.rid); m.ok ? w.res(m.d) : w.rej(new Error(m.e)); } }
    else if (m.t === 'me') c.me = m.me; else if (m.t === 'chat') c.chat = m.items; else if (m.t === 'chatmsg') c.chat.push(m.m); else if (m.t === 'toast') c.toasts.push(m.m);
  };
  c.call = (t, d = {}) => new Promise((res, rej) => { const rid = c.seq++; c.wait.set(rid, { res, rej }); ws.send(JSON.stringify({ ...d, t, rid })); });
  c.ready = new Promise(r => (ws.onopen = r));
  return c;
}
async function err(p) { try { await p; return null; } catch (e) { return e.message; } }
const A = client(), B = client();
await Promise.all([A.ready, B.ready]);
const n = Math.floor(Math.random() * 1e5);
await A.call('register', { name: 'chatA' + n, pass: 'abcd' });
await B.call('register', { name: 'chatB' + n, pass: 'abcd' });
await sleep(100);

console.log('chat');
await A.call('chat.send', { text: 'hello   world' });
await sleep(100);
ok(B.chat.some(m => m.text === 'hello world' && m.name === 'chatA' + n), 'B sees A\'s message');
ok(/Slow down/.test(await err(A.call('chat.send', { text: 'again' }))), 'slow mode blocks spam');
await sleep(1600);
await A.call('chat.send', { text: 'go to www.scam-site.com or http://x.io now, shit' });
await sleep(100);
const last = B.chat[B.chat.length - 1].text;
ok(!/scam|http|x\.io/.test(last) && last.includes('[link removed]') && last.includes('****'), `links removed and swear masked: "${last}"`);
ok(/Unknown command/.test(await err(B.call('chat.send', { text: '/give me coins' }))), 'unknown command rejected');

console.log('tips');
ok(/Bet at least 100/.test(await err(A.call('chat.tip', { to: 'chatB' + n, amount: 500 }))), 'tips need 100 coins of bets first');
await A.call('dice.roll', { amount: 10000, target: 50, over: true });
await sleep(100);
if (A.me.balance < 500) await A.call('daily');
await sleep(100);
ok(/yourself/.test(await err(A.call('chat.tip', { to: 'chatA' + n, amount: 500 }))), 'cannot tip yourself');
ok(/No player/.test(await err(A.call('chat.tip', { to: 'nobody_here_' + n, amount: 500 }))), 'unknown player');
const a0 = A.me.balance, b0 = B.me.balance;
const r = await A.call('chat.tip', { to: 'CHATB' + n, amount: 500 });
await sleep(150);
ok(r.to === 'chatB' + n && A.me.balance === a0 - 500 && B.me.balance === b0 + 500, 'tip moved 5 coins (name is not case-sensitive)');
ok(B.toasts.some(t => /tipped you 5.00/.test(t)), 'B got a toast');
ok(B.chat.some(m => m.kind === 'tip' && m.amount === 500), 'tip shows in chat');
await sleep(3100);
const r2 = await A.call('chat.send', { text: '/tip chatB' + n + ' 2' });
await sleep(150);
ok(r2.amount === 200 && B.me.balance === b0 + 700, '/tip command works');

console.log('moderation (A is admin if this is a fresh database)');
if (A.me.admin) {
  await sleep(1600);
  await B.call('chat.send', { text: 'rude message' });
  await sleep(100);
  const msg = A.chat.find(m => m.text === 'rude message');
  await A.call('chat.delete', { id: msg.id });
  await sleep(100);
  ok(!B.chat.some(m => m.text === 'rude message'), 'admin deleted the message');
  await A.call('admin.mute', { id: B.me.id, minutes: 10 });
  ok(/muted/.test(await err(B.call('chat.send', { text: 'hi' }))), 'muted player cannot chat');
  await A.call('admin.mute', { id: B.me.id, minutes: 0 });
  await sleep(1600);
  await B.call('chat.send', { text: 'back' });
  ok(true, 'unmuted player can chat again');
  ok(/Admins only/.test(await err(B.call('chat.delete', { id: 1 }))), 'non-admin cannot delete');
} else console.log('  (skipped: A is not the first account)');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
