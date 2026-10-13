// Coinfall cases, free cases and case battles. Results come from the server; this file shows them.
import { srvNow, lvlTag, $, $$, S, R, sfx, act, hold, release, fmt, fmtShort, esc, toast, pop, coinShower, reduced, sleep, avatar } from './app.js';

const ICONS = [
  '<path d="M4 20l3-3M7 17L17 7l3-3-1 4L9 18z"/><path d="M5 15l4 4"/>',
  '<path d="M3 8h15v4h-7l-1 6H6l1-6H3z"/><path d="M18 9h3"/>',
  '<path d="M2 10h15l3-2h2v4h-5l-2 2h-4l-1 3H7l1-3H2z"/>',
  '<path d="M7 21v-6l-2-4V6a1 1 0 0 1 2 0v4M9 10V4a1 1 0 0 1 2 0v6M11 10V3a1 1 0 0 1 2 0v7M13 10V4a1 1 0 0 1 2 0v8l2-2a1.5 1.5 0 0 1 2 2l-4 5v4"/>',
  '<path d="M4 15a8 8 0 0 1 16 0v3H4z"/><path d="M12 7v8M4 15h16"/>',
  '<path d="M6 4h12l4 5-10 11L2 9z"/><path d="M2 9h20M9 4l3 16 3-16"/>',
  '<path d="M3 18l2-11 5 5 2-7 2 7 5-5 2 11z"/>',
  '<circle cx="12" cy="12" r="8"/><path d="M8 10a4 4 0 0 1 4-3"/>',
  '<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><circle cx="10" cy="12" r="2"/>',
  '<circle cx="12" cy="15" r="5"/><path d="M12 10V4M9 4h6"/>',
  '<path d="M6 3c8 3 8 15 0 18"/><path d="M6 3v18M4 12h16M17 9l3 3-3 3"/>',
  '<path d="M5 6h10v5H5z"/><path d="M15 8h4M10 11v10"/>',
];
const icon = t => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[t % ICONS.length]}</svg>`;
const itemTile = (it, cls = '', extra = '') => `<div class="itm ${cls}" style="--rc:${R.RARITIES[it.rarity].color}">${extra}<span class="itm-ic">${icon(it.type)}</span><b class="itm-v num">${fmt(it.value)}</b><span class="itm-n">${esc(it.name)}</span></div>`;
const crate = (c, cls = '') => `<div class="crate ${cls}" style="--h:${c.hue}"><i></i></div>`;
// Reels show rare items a bit more often than they really drop, so spins look exciting. Odds are listed on each case.
const visualPick = c => { const w = c.items.map(it => Math.sqrt(it.w)); let x = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { if (x < w[i]) return c.items[i]; x -= w[i]; } return c.items[0]; };
const rarityOf = (c, idx) => c.items[idx].rarity;

/* ---------- horizontal reel (case opening, free cases) ---------- */
function makeReel(el) {
  const W = 120;
  function idle(c) {
    el.innerHTML = `<div class="reel-strip">${Array.from({ length: 14 }, () => itemTile(visualPick(c))).join('')}</div><i class="reel-pin"></i>`;
    const strip = el.firstChild;
    strip.style.transform = `translateX(${-(7 * W + W / 2 - el.clientWidth / 2)}px)`;
  }
  async function spin(c, idx, fast) {
    const N = 58, target = 50;
    const tiles = Array.from({ length: N }, (_, i) => (i === target ? c.items[idx] : visualPick(c)));
    el.innerHTML = `<div class="reel-strip">${tiles.map(it => itemTile(it)).join('')}</div><i class="reel-pin"></i>`;
    const strip = el.firstChild, boxW = el.clientWidth;
    const end = target * W + W / 2 - boxW / 2 + (Math.random() - 0.5) * W * 0.7;
    const D = reduced ? 300 : fast ? 1300 : 5200;
    strip.style.transform = 'translateX(0)';
    void strip.offsetWidth;
    strip.style.transition = `transform ${D}ms cubic-bezier(.1,.72,.12,1)`;
    strip.style.transform = `translateX(${-end}px)`;
    let last = -1;
    const t0 = performance.now();
    await new Promise(res => {
      const f = now => {
        const x = -new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
        const pos = Math.floor((x + boxW / 2) / W);
        if (pos !== last) { last = pos; sfx.tick(1.15); }
        if (now - t0 < D) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    strip.children[target].classList.add('won');
    sfx.drop(c.items[idx].rarity);
    return c.items[idx];
  }
  return { idle, spin };
}

/* ================= CASES (browse) ================= */
const Cases = (() => {
  let range = 'all', sort = 'asc', q = '';
  function init() {
    $('#case-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
    $('#case-range').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; range = b.dataset.r; $$('#case-range button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); });
    $('#case-sort').addEventListener('change', e => { sort = e.target.value; render(); });
    render();
  }
  function render() {
    let list = R.CASES.filter(c => !q || c.name.toLowerCase().includes(q));
    if (range !== 'all') { const [lo, hi] = range.split('-').map(Number); list = list.filter(c => c.price / 100 > lo - 1e-9 && c.price / 100 <= hi); }
    list.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'desc' ? (a, b) => b.price - a.price : (a, b) => a.price - b.price);
    $('#case-grid').innerHTML = list.length ? list.map(c => `<a class="case-card" href="#case-${c.id}">${crate(c)}<b>${esc(c.name)}</b><span class="num"><span class="coin sm"></span>${fmt(c.price)}</span></a>`).join('') : '<p class="empty">No cases match.</p>';
  }
  return { init };
})();

/* ================= CASE (open one) ================= */
const CaseView = (() => {
  let cur = null, busy = false, reel;
  function init() {
    reel = makeReel($('#case-reel'));
    $('#case-open').addEventListener('click', open);
  }
  function onRoute(id) {
    cur = R.CASES[id];
    if (!cur) { location.hash = '#cases'; return; }
    const best = cur.items[0];
    $('#case-head').innerHTML = `${crate(cur)}<div><h1>${esc(cur.name)}</h1><span class="hint">Price ${fmt(cur.price)} coins · best drop ${fmt(best.value)} (${(best.w / 1000).toFixed(2)}%) · returns about ${Math.round((cur.items.reduce((a, it) => a + (it.w / 100000) * it.value, 0) / cur.price) * 100)}% on average</span></div>`;
    $('#case-open').textContent = `Open for ${fmt(cur.price)}`;
    $('#case-result').textContent = '';
    $('#case-items').innerHTML = cur.items.map(it => itemTile(it, '', `<span class="itm-p">${(it.w / 1000).toFixed(it.w < 1000 ? 2 : 1)}%</span>`)).join('');
    requestAnimationFrame(() => reel.idle(cur));
  }
  async function open() {
    if (busy || !cur) return;
    if (!S.me) { act('noop'); return; }
    busy = true; $('#case-open').disabled = true; $('#case-result').textContent = '';
    hold(cur.price);
    const r = await act('case.open', { id: cur.id });
    if (!r) { release(); busy = false; $('#case-open').disabled = false; return; }
    const it = await reel.spin(cur, r.idx, $('#case-fast').checked);
    release(r.value);
    const res = $('#case-result');
    res.innerHTML = `<span style="color:${R.RARITIES[it.rarity].color}">${esc(it.name)}</span> · ${fmt(r.value)} coins <span class="${r.value >= cur.price ? 'pos' : 'neg'}">(${r.value >= cur.price ? '+' : '−'}${fmt(Math.abs(r.value - cur.price))})</span>`;
    if (it.rarity >= 3) coinShower(it.rarity === 4 ? 90 : 45);
    busy = false; $('#case-open').disabled = false;
  }
  return { init, onRoute };
})();

/* ================= FREE CASES ================= */
const Free = (() => {
  let busy = false, reel;
  function init() { reel = makeReel($('#free-reel')); $('#free-grid').addEventListener('click', e => { const b = e.target.closest('[data-free]'); if (b) open(+b.dataset.free); }); }
  function render() {
    const me = S.me, L = me ? me.level || R.levelOf(me.wagered) : 1, now = srvNow();
    $('#free-grid').innerHTML = R.FREE_CASES.map((c, i) => {
      const locked = !me || L < c.level;
      const left = me ? R.FREE_COOLDOWN - (now - ((me.free || {})[i] || 0)) : 0;
      const ready = !locked && left <= 0;
      const btn = !me ? '<button class="btn-ghost" type="button" data-act="signup">Sign up to open</button>' : locked ? `<button class="btn-ghost" type="button" disabled>Unlocks at level ${c.level}</button>` : ready ? `<button class="btn-go" type="button" data-free="${i}">Open free</button>` : `<button class="btn-ghost num" type="button" disabled>${mm(left)}</button>`;
      return `<div class="free-card ${locked ? 'locked' : ready ? 'ready' : ''}">${crate(c)}<b>${esc(c.name)}${lvlTag(c.level)}</b><span class="hint"><span>Pays ~${fmtShort(c.price)}</span><span>Best ${fmtShort(c.items[0].value)}</span></span>${btn}</div>`;
    }).join('');
  }
  const mm = ms => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return `Ready in ${m}:${String(s % 60).padStart(2, '0')}`; };
  async function open(i) {
    if (busy) return;
    const c = R.FREE_CASES[i];
    busy = true;
    const box = $('#free-reel-box'); box.hidden = false; $('#free-result').textContent = '';
    box.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    hold(0);
    const r = await act('free.open', { i });
    if (!r) { release(); busy = false; return; }
    const it = await reel.spin(c, r.idx, false);
    release(r.value);
    $('#free-result').innerHTML = `<span style="color:${R.RARITIES[it.rarity].color}">${esc(it.name)}</span> · +${fmt(r.value)} coins`;
    if (it.rarity >= 2) coinShower(40 + it.rarity * 15);
    busy = false; render();
  }
  return { init, onShow: render, tick1: () => { if (!busy) render(); } };
})();

/* ================= CASE BATTLES (lobby + maker) ================= */
const Battles = (() => {
  let mode = '1v1', picks = [], pq = '';
  const cost = () => picks.reduce((a, id) => a + R.CASES[id].price, 0);
  function init() {
    $('#bm-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; mode = b.dataset.mode; $$('#bm-mode button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); sfx.click(); });
    $('#bm-add').addEventListener('click', () => { $('#picker').hidden = false; renderPicker(); setTimeout(() => $('#picker-q').focus(), 30); });
    $('#bm-clear').addEventListener('click', () => { picks = []; renderMaker(); });
    $('#picker-done').addEventListener('click', () => { $('#picker').hidden = true; });
    $('#picker').addEventListener('click', e => { if (e.target.id === 'picker') $('#picker').hidden = true; });
    $('#picker-q').addEventListener('input', e => { pq = e.target.value.trim().toLowerCase(); renderPicker(); });
    $('#picker-grid').addEventListener('click', e => {
      const b = e.target.closest('[data-pk]'); if (!b) return;
      const id = +b.dataset.pk, d = +b.dataset.d;
      if (d > 0) { if (picks.length >= R.BATTLE_MAX_ROUNDS) { toast(`Battles hold up to ${R.BATTLE_MAX_ROUNDS} cases`, 'bad'); return; } picks.push(id); sfx.chip(); }
      else { const k = picks.lastIndexOf(id); if (k >= 0) picks.splice(k, 1); }
      renderPicker(); renderMaker();
    });
    $('#bm-cases').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; const id = +b.dataset.rm, k = picks.lastIndexOf(id); if (k >= 0) picks.splice(k, 1); renderMaker(); });
    $('#bm-create').addEventListener('click', async () => {
      const r = await act('battle.create', { mode, cursed: $('#bm-cursed').checked, cases: picks });
      if (r) { sfx.chip(); location.hash = '#battle-' + r.id; }
    });
    $('#battle-list').addEventListener('click', async e => {
      const a = e.target.closest('[data-bact]');
      if (a) { e.stopPropagation(); await battleAction(a.dataset.bact, +a.dataset.id); return; }
      const card = e.target.closest('[data-bid]');
      if (card) location.hash = '#battle-' + card.dataset.bid;
    });
    picks = [0, 1, 2];
    renderMaker();
  }
  function renderMaker() {
    const counts = new Map();
    for (const id of picks) counts.set(id, (counts.get(id) || 0) + 1);
    $('#bm-cases').innerHTML = picks.length ? [...counts].map(([id, n]) => { const c = R.CASES[id]; return `<span class="bm-chip">${crate(c, 'xs')}${esc(c.name)} ×${n} · ${fmt(c.price * n)}<button type="button" data-rm="${id}" aria-label="Remove one ${esc(c.name)}">−</button></span>`; }).join('') : '<span class="hint">Add up to 25 cases. Everyone opens the same cases, one round each.</span>';
    $('#bm-count').textContent = `${picks.length} / ${R.BATTLE_MAX_ROUNDS}`;
    $('#bm-cost').textContent = fmt(cost());
    $('#bm-create').disabled = !picks.length;
    $('#picker-sum').textContent = `${picks.length} cases · ${fmt(cost())} per player`;
  }
  function renderPicker() {
    const list = R.CASES.filter(c => !pq || c.name.toLowerCase().includes(pq));
    $('#picker-grid').innerHTML = list.map(c => { const n = picks.filter(x => x === c.id).length; return `<div class="pk ${n ? 'on' : ''}">${crate(c)}<b>${esc(c.name)}</b><span class="num">${fmt(c.price)}</span><div class="pk-ctl"><button type="button" data-pk="${c.id}" data-d="-1" aria-label="Remove">−</button><span>${n}</span><button type="button" data-pk="${c.id}" data-d="1" aria-label="Add">+</button></div></div>`; }).join('');
  }
  function onTable(st) {
    S.tables.battles = st;
    renderList(st);
    BattleView.onTable(st);
  }
  function seatsHtml(b) {
    const m = R.BATTLE_MODES[b.mode];
    return b.seats.map((s, i) => (m.teams && i === 2 ? '<span class="vs">VS</span>' : !m.teams && i > 0 ? '<span class="vs">·</span>' : '') + (s ? avatar(s.name, 'sm') : '<span class="bseat-empty"></span>')).join('');
  }
  function renderList(st) {
    const me = S.me && S.me.id;
    $('#battle-list').innerHTML = st.battles.length ? st.battles.map(b => {
      const mine = b.seats.some(s => s && s.id === me), creator = b.creator === me;
      let actions = '';
      if (b.state === 'open') {
        if (creator) actions = `<button class="btn-go sm" type="button" data-bact="bots" data-id="${b.id}">Call bots</button><button class="btn-ghost sm" type="button" data-bact="leave" data-id="${b.id}">Cancel</button>`;
        else if (mine) actions = `<button class="btn-ghost sm" type="button" data-bact="leave" data-id="${b.id}">Leave</button>`;
        else actions = `<button class="btn-go sm" type="button" data-bact="join" data-id="${b.id}">Join · ${fmt(b.cost)}</button>`;
      } else actions = `<span class="tag ${b.state === 'running' ? 'live' : ''}">${b.state === 'running' ? `Round ${b.round + 1}/${b.cases.length}` : 'Finished'}</span>`;
      const cs = b.cases.slice(0, 8).map(id => crate(R.CASES[id], 'sm')).join('') + (b.cases.length > 8 ? `<span class="more">+${b.cases.length - 8}</span>` : '');
      return `<div class="bcard ${b.state === 'done' ? 'done' : ''}" data-bid="${b.id}"><div class="bmode"><b>${R.BATTLE_MODES[b.mode].label}</b>${b.cursed ? '<span class="tag cursed">Cursed</span>' : '<span class="tag">Highest wins</span>'}</div><div class="bcases">${cs}</div><div class="bseats">${seatsHtml(b)}</div><div class="bcost"><span class="num">${fmt(b.cost)}</span>${actions}</div></div>`;
    }).join('') : '<p class="empty">No battles right now. Make one above, then call bots if nobody joins.</p>';
  }
  async function battleAction(a, id) {
    if (a === 'join') { if (await act('battle.join', { id })) { sfx.chip(); location.hash = '#battle-' + id; } }
    else if (a === 'bots') { if (await act('battle.bots', { id })) { sfx.chip(); if (S.view !== 'battle') location.hash = '#battle-' + id; } }
    else if (a === 'leave') { if (await act('battle.leave', { id })) sfx.click(); }
    else if (a === 'again') {
      const b = S.tables.battles && S.tables.battles.battles.find(x => x.id === id);
      if (b) { const r = await act('battle.create', { mode: b.mode, cursed: b.cursed, cases: b.cases }); if (r) location.hash = '#battle-' + r.id; }
    }
  }
  return { init, onTable, action: battleAction };
})();

/* ================= ONE BATTLE ================= */
const BattleView = (() => {
  let id = null, b = null, shown = -1, animating = false, sig = '';
  const view = () => $('#battle-view');
  function onRoute(bid) { id = bid; shown = -1; sig = ''; b = null; animating = false; view().innerHTML = '<p class="empty">Loading battle…</p>'; if (S.tables.battles) onTable(S.tables.battles); }
  function onTable(st) {
    if (S.view !== 'battle' || id == null) return;
    const nb = st.battles.find(x => x.id === id);
    if (!nb) { if (!b) view().innerHTML = '<p class="empty">This battle is over or was cancelled. <a class="link" href="#battles">See all battles</a></p>'; return; }
    b = nb;
    const s2 = (b.state === 'open' ? 'open' : 'run') + '|' + b.seats.map(s => (s ? s.name : '-')).join(',');
    if (s2 !== sig) { sig = s2; skeleton(); }
    else header();
    pump();
  }
  const total = (s, upto) => { let t = 0; for (let k = 0; k <= upto && k < s.drops.length; k++) t += R.CASES[b.cases[k]].items[s.drops[k]].value; return t; };
  function header() {
    const me = S.me && S.me.id, mine = b.seats.some(s => s && s.id === me), creator = b.creator === me;
    let actions = '', status = '';
    if (b.state === 'open') {
      status = `Waiting for players · ${b.seats.filter(Boolean).length}/${b.seats.length}`;
      if (creator) actions = `<button class="btn-go sm" type="button" data-bact="bots">Call bots to fill</button><button class="btn-ghost sm" type="button" data-bact="leave">Cancel battle</button>`;
      else if (mine) actions = `<button class="btn-ghost sm" type="button" data-bact="leave">Leave</button>`;
    } else if (b.state === 'running') status = shown < 0 ? 'Starting…' : `Round ${Math.min(shown + 1, b.cases.length)} of ${b.cases.length}`;
    else { status = 'Finished'; actions = `<button class="btn-go sm" type="button" data-bact="again">Make the same battle</button>`; }
    const h = view().querySelector('.bv-head');
    if (h) h.innerHTML = `<div class="bmode"><b>${R.BATTLE_MODES[b.mode].label}</b>${b.cursed ? '<span class="tag cursed">Cursed · lowest wins</span>' : '<span class="tag">Highest total wins</span>'}</div><span class="grow hint">${status}</span><span class="bcost"><span class="hint">Cost per player</span><span class="num">${fmt(b.cost)}</span></span>${actions}`;
    const rs = view().querySelector('.bv-rounds');
    if (rs) [...rs.children].forEach((el, k) => { el.classList.toggle('cur', k === shown || (shown < 0 && k === 0)); el.classList.toggle('past', k < shown); });
  }
  function col(s, i) {
    const isMe = !!(S.me && s && s.id === S.me.id);
    if (!s) {
      const can = S.me && b.state === 'open' && !b.seats.some(x => x && x.id === S.me.id);
      return `<div class="bcol" data-col="${i}"><div class="bcol-head"><span class="bseat-empty"></span><span class="li-name"><b>Open seat</b><span>Waiting for a player</span></span></div><div class="vreel"><div class="wait">${can ? `<button class="btn-go sm" type="button" data-bact="join" data-seat="${i}">Join · ${fmt(b.cost)}</button>` : 'Empty seat'}</div></div></div>`;
    }
    return `<div class="bcol" data-col="${i}"><div class="bcol-head">${avatar(s.name)}<span class="li-name"><b>${esc(s.name)}${lvlTag(s.lvl)}${isMe ? '<em class="you">you</em>' : ''}</b><span data-tot-sub>0 drops</span></span></div><div class="bcol-total num" data-tot>0.00</div><div class="vreel"><div class="vstrip"></div></div><div class="bcol-pay" data-pay></div><div class="bdrops" data-drops></div></div>`;
  }
  function skeleton() {
    const m = R.BATTLE_MODES[b.mode];
    const cols = b.seats.map(col);
    const body = m.teams ? `<div class="bv-cols teams" style="grid-template-columns:1fr auto 1fr"><div class="bv-team">${cols[0]}${cols[1]}</div><div class="bv-vs">VS</div><div class="bv-team">${cols[2]}${cols[3]}</div></div>` : `<div class="bv-cols n${b.seats.length}" style="grid-template-columns:repeat(${b.seats.length},minmax(0,1fr))">${cols.join('')}</div>`;
    view().innerHTML = `<div class="bv-head"></div><div class="bv-rounds">${b.cases.map((cid, k) => `<div class="bv-round">${crate(R.CASES[cid], 'sm')}<span>${k + 1}</span></div>`).join('')}</div><div class="bv-banner" data-banner hidden></div>${body}`;
    if (!view().dataset.wired) { view().dataset.wired = '1'; view().addEventListener('click', onAct); }
    b.seats.forEach((s, i) => { if (s) for (let k = 0; k <= shown && k < s.drops.length; k++) addDrop(i, k); });
    if (shown >= 0) b.seats.forEach((s, i) => showLast(i));
    updateTotals();
    header();
    if (b.state === 'done' && shown >= b.cases.length - 1) finish();
  }
  async function onAct(e) {
    const a = e.target.closest('[data-bact]');
    if (!a || !b) return;
    e.stopPropagation();
    if (a.dataset.bact === 'join') { if (await act('battle.join', { id: b.id, seat: +a.dataset.seat })) sfx.chip(); }
    else Battles.action(a.dataset.bact, b.id);
  }
  const colEl = i => view().querySelector(`[data-col="${i}"]`);
  function addDrop(i, k) {
    const s = b.seats[i], el = colEl(i);
    if (!s || !el || k >= s.drops.length) return;
    const it = R.CASES[b.cases[k]].items[s.drops[k]];
    el.querySelector('[data-drops]').insertAdjacentHTML('afterbegin', itemTile(it, 'mini'));
  }
  function updateTotals() {
    b.seats.forEach((s, i) => {
      const el = colEl(i); if (!s || !el) return;
      el.querySelector('[data-tot]').textContent = fmt(total(s, shown));
      el.querySelector('[data-tot-sub]').textContent = `${Math.max(0, shown + 1)} of ${b.cases.length} opened`;
    });
  }
  async function pump() {
    if (animating || !b) return;
    if (b.round > shown) {
      while (b.round - shown > 1) { shown++; b.seats.forEach((_, i) => addDrop(i, shown)); }
      animating = true;
      const r = shown + 1, c = R.CASES[b.cases[r]];
      const D = Math.max(900, Math.min(3600, b.roundAt - srvNow() - 900));
      header();
      await Promise.all(b.seats.map((s, i) => spinCol(i, c, s.drops[r], D)));
      shown = r;
      b.seats.forEach((_, i) => addDrop(i, r));
      updateTotals();
      const best = Math.max(...b.seats.map(s => rarityOf(c, s.drops[r])));
      sfx.drop(best);
      animating = false;
      header();
      if (S.view === 'battle') pump();
      return;
    }
    if (b.state === 'done' && shown >= b.cases.length - 1) finish();
  }
  function showLast(i) {
    const s = b.seats[i], el = colEl(i);
    if (!s || !el || shown < 0 || shown >= s.drops.length) return;
    const strip = el.querySelector('.vstrip'), reel = el.querySelector('.vreel');
    strip.innerHTML = itemTile(R.CASES[b.cases[shown]].items[s.drops[shown]], 'won');
    strip.style.transition = 'none';
    strip.style.transform = `translateY(${(reel.clientHeight - strip.firstChild.offsetHeight) / 2}px)`;
  }
  function spinCol(i, c, idx, D) {
    const el = colEl(i);
    if (!el) return Promise.resolve();
    const strip = el.querySelector('.vstrip'), reel = el.querySelector('.vreel');
    const N = 26, target = 22;
    const tiles = Array.from({ length: N }, (_, k) => (k === target ? c.items[idx] : visualPick(c)));
    strip.innerHTML = tiles.map(it => itemTile(it)).join('');
    const H = strip.children[1].offsetTop - strip.children[0].offsetTop, half = strip.children[0].offsetHeight / 2;
    const end = target * H + half - reel.clientHeight / 2;
    strip.style.transition = 'none'; strip.style.transform = 'translateY(0)'; void strip.offsetWidth;
    if (reduced) D = 200;
    strip.style.transition = `transform ${D}ms cubic-bezier(.12,.75,.15,1)`;
    strip.style.transform = `translateY(${-end}px)`;
    if (i === 0) { let n = 0; const iv = setInterval(() => { sfx.tick(1 + n / 30); if (++n > 22) clearInterval(iv); }, D / 26); }
    return sleep(D + 40).then(() => strip.children[target] && strip.children[target].classList.add('won'));
  }
  function finish() {
    if (!b || b.state !== 'done') return;
    const ban = view().querySelector('[data-banner]');
    if (!ban || !ban.hidden) return;
    const meIdx = S.me ? b.seats.findIndex(s => s && s.id === S.me.id) : -1;
    b.seats.forEach((s, i) => {
      const el = colEl(i); if (!el) return;
      const won = b.winners.includes(i);
      el.classList.add(won ? 'win' : 'lose');
      el.querySelector('[data-pay]').innerHTML = won ? `<span class="pos">+${fmt(s.payout)}</span>` : '<span class="neg">No payout</span>';
    });
    const names = b.winners.map(i => b.seats[i].name).join(' & ');
    const meWon = meIdx >= 0 && b.winners.includes(meIdx);
    ban.hidden = false;
    ban.className = 'bv-banner' + (meWon ? ' win' : '');
    ban.textContent = meWon ? `You won ${fmt(b.seats[meIdx].payout)} coins!` : `${names} ${b.winners.length > 1 ? 'win' : 'wins'} ${fmt(b.pot)} coins`;
    header();
    if (meIdx >= 0) { if (meWon) { sfx.win(true); coinShower(80); } else sfx.lose(); }
  }
  return { onRoute, onTable };
})();

export const CASEMODS = {
  cases: Cases, case: CaseView, free: Free, battles: Battles,
  battle: { onRoute: id => BattleView.onRoute(id), onTable: st => Battles.onTable(st) },
};
export function initCases() { Cases.init(); CaseView.init(); Free.init(); Battles.init(); }
