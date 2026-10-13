// Coinfall solo games. Every result comes from the server; this file only shows it.
import { $, $$, S, R, sfx, act, hold, release, readBet, lockBet, fmt, fmtShort, esc, toast, pop, shake, pushHist, resultSound, fitCanvas, C, MONO, TAU, reduced, sleep, mix, cardHtml, avatar, lvlTag } from './app.js';

const rnd = () => Math.random();
const kv = rows => rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');

/* ================= MINES ================= */
const Mines = (() => {
  let st = { on: false, bet: 0, m: 3, rev: [] }, busy = false, grid, go, cnt, info, rndBtn, stage;
  function init() {
    grid = $('#mines-grid'); go = $('#mines-go'); cnt = $('#mines-count'); info = $('#mines-info'); rndBtn = $('#mines-rand'); stage = $('#mines-stage');
    for (let i = 0; i < 25; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tile'; b.disabled = true; b.dataset.i = i; b.setAttribute('aria-label', 'Tile ' + (i + 1)); grid.appendChild(b); }
    for (let m = 1; m <= 24; m++) cnt.add(new Option(m + (m === 1 ? ' mine' : ' mines'), m));
    cnt.value = '3';
    grid.addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) pick(+t.dataset.i); });
    go.addEventListener('click', () => (st.on ? cashout() : start()));
    rndBtn.addEventListener('click', () => { if (!st.on) return; const free = [...Array(25).keys()].filter(i => !st.rev.includes(i)); pick(free[Math.floor(rnd() * free.length)]); });
    cnt.addEventListener('change', renderInfo);
    $('#mines-bet').addEventListener('input', renderInfo);
    renderInfo();
  }
  function renderInfo() {
    const m = st.on ? st.m : +cnt.value, k = st.on ? st.rev.length : 0, bet = st.on ? st.bet : readBet('mines');
    const cur = k ? R.minesMult(m, k) : 0, next = k < 25 - m ? R.minesMult(m, k + 1) : 0;
    info.innerHTML = kv([['Gems left', 25 - m - k], ['Cash out now', k ? `${cur.toFixed(2)}× · ${fmt(bet * cur)}` : '—'], ['Next gem pays', next ? next.toFixed(2) + '×' : '—']]);
  }
  function setGo() {
    if (st.on) { const k = st.rev.length; go.classList.add('cash'); go.disabled = !k; go.textContent = k ? `Cash out ${fmt(Math.floor(st.bet * R.minesMult(st.m, k)))}` : 'Pick a tile'; }
    else { go.classList.remove('cash'); go.disabled = false; go.textContent = 'Bet'; }
  }
  function lock(on) { lockBet('mines', on); cnt.disabled = on; rndBtn.disabled = !on; }
  function liveTiles() { [...grid.children].forEach((t, i) => { const g = st.rev.includes(i); t.className = 'tile' + (g ? ' gem' : ' live'); t.disabled = g; }); }
  async function start() {
    if (busy) return;
    const bet = readBet('mines'), m = +cnt.value;
    busy = true; const r = await act('mines.start', { amount: bet, mines: m }); busy = false;
    if (!r) return;
    st = { on: true, bet, m, rev: [] };
    liveTiles(); lock(true); setGo(); renderInfo(); sfx.chip();
  }
  async function pick(i) {
    if (!st.on || busy || st.rev.includes(i)) return;
    busy = true; const r = await act('mines.pick', { i }); busy = false;
    if (!r) return;
    const t = grid.children[i];
    if (r.mine) { t.classList.add('mine', 'hit'); sfx.bomb(); end(false, r.mines); return; }
    st.rev.push(i); t.classList.remove('live'); t.classList.add('gem', 'pop-in'); t.disabled = true; sfx.gem();
    if (r.done) { end(true, r.mines, r.mult, r.payout); return; }
    setGo(); renderInfo();
  }
  async function cashout() {
    if (!st.on || busy || !st.rev.length) return;
    busy = true; const r = await act('mines.cashout'); busy = false;
    if (r) end(true, r.mines, r.mult, r.payout);
  }
  function end(win, mines, mult, payout) {
    st.on = false;
    [...grid.children].forEach((t, i) => { t.classList.remove('live'); t.disabled = true; if (!st.rev.includes(i) && !t.classList.contains('hit')) t.classList.add(mines.includes(i) ? 'mine' : 'gem', 'dim'); });
    if (win) { pop(stage, mult.toFixed(2) + '×', '+' + fmt(payout)); sfx.cashout(); resultSound(st.bet, payout); }
    else { shake(grid); setTimeout(() => sfx.lose(), 250); }
    lock(false); setGo(); renderInfo();
  }
  function resume(g) {
    if (!g) { if (st.on) { st.on = false; liveTiles(); [...grid.children].forEach(t => { t.disabled = true; t.classList.remove('live'); }); lock(false); setGo(); renderInfo(); } return; }
    st = { on: true, bet: g.bet, m: g.m, rev: [...g.rev] };
    cnt.value = String(g.m); $('#mines-bet').value = String(g.bet / 100);
    liveTiles(); lock(true); setGo(); renderInfo();
  }
  return { init, resume };
})();

/* ================= TOWERS ================= */
const Towers = (() => {
  const LV = R.TOWER_LEVELS;
  let st = { on: false, lvl: 0, d: 'medium', bet: 0, picks: [] }, busy = false, tower, go, sel, info, stage;
  function init() {
    tower = $('#tower'); go = $('#towers-go'); sel = $('#towers-diff'); info = $('#towers-info'); stage = $('#towers-stage');
    for (const [k, v] of Object.entries(R.TOWERS)) sel.add(new Option(v.label, k));
    sel.value = 'medium';
    sel.addEventListener('change', () => { if (!st.on) { st.d = sel.value; build(); renderInfo(); } });
    go.addEventListener('click', () => (st.on ? cashout() : start()));
    tower.addEventListener('click', e => { const t = e.target.closest('.ttile'); if (t) pick(+t.dataset.l, +t.dataset.c); });
    $('#towers-bet').addEventListener('input', renderInfo);
    build(); renderInfo();
  }
  function build() {
    const d = R.TOWERS[st.d]; let h = '';
    for (let l = LV - 1; l >= 0; l--) {
      h += `<div class="trow" data-l="${l}" style="--cols:${d.cols}">`;
      for (let c = 0; c < d.cols; c++) h += `<button type="button" class="ttile" data-l="${l}" data-c="${c}" aria-label="Floor ${l + 1}, tile ${c + 1}" disabled></button>`;
      h += `<span class="tm">${R.towersMult(st.d, l + 1).toFixed(2)}×</span></div>`;
    }
    tower.innerHTML = h;
  }
  const rowEl = l => tower.querySelector(`.trow[data-l="${l}"]`);
  function mark() { $$('.trow', tower).forEach(r => { const l = +r.dataset.l, cur = st.on && l === st.lvl; r.classList.toggle('cur', cur); $$('.ttile', r).forEach(t => (t.disabled = !cur)); }); }
  function renderInfo() {
    const bet = st.on ? st.bet : readBet('towers'), k = st.on ? st.lvl : 0, cur = R.towersMult(st.d, k), next = k < LV ? R.towersMult(st.d, k + 1) : 0;
    info.innerHTML = kv([['Floor', `${k} / ${LV}`], ['Cash out now', k ? `${cur.toFixed(2)}× · ${fmt(bet * cur)}` : '—'], ['Next floor pays', next ? next.toFixed(2) + '×' : '—']]);
  }
  function setGo() {
    if (st.on) { go.classList.add('cash'); go.disabled = !st.lvl; go.textContent = st.lvl ? `Cash out ${fmt(Math.floor(st.bet * R.towersMult(st.d, st.lvl)))}` : 'Pick a tile'; }
    else { go.classList.remove('cash'); go.disabled = false; go.textContent = 'Bet'; }
  }
  async function start() {
    if (busy) return;
    const bet = readBet('towers'), d = sel.value;
    busy = true; const r = await act('towers.start', { amount: bet, diff: d }); busy = false;
    if (!r) return;
    st = { on: true, lvl: 0, d, bet, picks: [] };
    build(); mark(); lockBet('towers', true); sel.disabled = true; setGo(); renderInfo(); sfx.chip();
  }
  function revealRow(l, bombs, dim) { $$('.ttile', rowEl(l)).forEach(t => { if (t.classList.contains('safe') || t.classList.contains('bomb')) return; t.classList.add(bombs.includes(+t.dataset.c) ? 'bomb' : 'safe'); if (dim) t.classList.add('dim'); }); }
  async function pick(l, c) {
    if (!st.on || busy || l !== st.lvl) return;
    busy = true; const r = await act('towers.pick', { c }); busy = false;
    if (!r) return;
    const t = rowEl(l).querySelector(`[data-c="${c}"]`);
    if (r.bomb) { t.classList.add('bomb', 'hit'); sfx.bomb(); end(false, r.bombs); return; }
    t.classList.add('safe'); sfx.gem();
    if (r.row) revealRow(l, r.row, true);
    st.lvl++; st.picks.push(c);
    if (r.done) { end(true, r.bombs, r.mult, r.payout); return; }
    mark(); setGo(); renderInfo();
  }
  async function cashout() {
    if (!st.on || busy || !st.lvl) return;
    busy = true; const r = await act('towers.cashout'); busy = false;
    if (r) end(true, r.bombs, r.mult, r.payout);
  }
  function end(win, bombs, mult, payout) {
    st.on = false;
    for (let l = 0; l < LV; l++) revealRow(l, bombs[l], true);
    mark();
    if (win) { pop(stage, mult.toFixed(2) + '×', '+' + fmt(payout)); sfx.cashout(); resultSound(st.bet, payout); }
    else { shake(tower); setTimeout(() => sfx.lose(), 250); }
    lockBet('towers', false); sel.disabled = false; setGo(); renderInfo();
  }
  function resume(g) {
    if (!g) { if (st.on) { st.on = false; mark(); lockBet('towers', false); sel.disabled = false; setGo(); renderInfo(); } return; }
    st = { on: true, lvl: g.lvl, d: g.diff, bet: g.bet, picks: [...g.picks] };
    sel.value = g.diff; build();
    g.picks.forEach((c, l) => { const t = rowEl(l).querySelector(`[data-c="${c}"]`); if (t) t.classList.add('safe'); });
    mark(); lockBet('towers', true); sel.disabled = true; setGo(); renderInfo();
  }
  return { init, resume };
})();

/* ================= PLINKO ================= */
const Plinko = (() => {
  let cv, ctx, go, rowsSel, riskSeg, histEl, raf = 0, g = null, rows = 12, risk = 'medium', balls = [];
  const hits = new Map();
  function init() {
    cv = $('#plinko-cv'); ctx = cv.getContext('2d'); go = $('#plinko-go'); rowsSel = $('#plinko-rows'); riskSeg = $('#plinko-risk'); histEl = $('#plinko-hist');
    rowsSel.addEventListener('change', () => { if (balls.length) return; rows = +rowsSel.value; layout(); });
    riskSeg.addEventListener('click', e => { const b = e.target.closest('[data-risk]'); if (!b || balls.length) return; risk = b.dataset.risk; $$('button', riskSeg).forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    go.addEventListener('click', drop);
  }
  function layout() {
    const W = cv.clientWidth;
    if (!W) return;
    const gap = W / (rows + 3), rowH = gap * 0.88, top = gap * 1.3, bucketH = Math.max(22, gap * 0.72), bucketY = top + (rows - 1) * rowH + gap * 0.85;
    cv.style.height = bucketY + bucketH + 8 + 'px';
    fitCanvas(cv);
    g = { W, H: bucketY + bucketH + 8, gap, rowH, top, cx: W / 2, bucketY, bucketH, pegR: Math.max(2, gap * 0.09), ballR: Math.max(4, gap * 0.21) };
    draw();
  }
  const lock = on => { rowsSel.disabled = on; $$('button', riskSeg).forEach(b => (b.disabled = on)); };
  async function drop() {
    if (!g) layout();
    if (!S.me) { act('noop'); return; }
    const bet = readBet('plinko');
    hold(bet); lock(true);
    const r = await act('plinko.drop', { amount: bet, rows, risk });
    if (!r) { release(); if (!balls.length) lock(false); return; }
    balls.push({ bits: r.bits, idx: r.idx, mult: r.mult, payout: r.payout, bet, seg: 0, s: 0, last: performance.now(), rows });
    sfx.click();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function point(b, k) {
    if (k === 0) return { x: g.cx, y: g.top - g.rowH * 1.4 };
    if (k <= b.rows) { const i = k - 1; let r = 0; for (let j = 0; j < i; j++) r += b.bits[j]; return { x: g.cx + (r - i / 2) * g.gap, y: g.top + i * g.rowH - g.pegR - g.ballR }; }
    return { x: g.cx + (b.idx - b.rows / 2) * g.gap, y: g.bucketY + g.bucketH * 0.35 };
  }
  function loop(now) {
    const dur = reduced ? 25 : 115;
    for (const b of balls) {
      const dt = now - b.last; b.last = now;
      b.s += dt / (b.seg === 0 ? dur * 1.6 : dur);
      while (b.s >= 1 && b.seg <= b.rows) { b.s -= 1; b.seg++; if (b.seg <= b.rows && S.view === 'plinko') sfx.peg(); }
      if (b.seg > b.rows) b.done = true;
    }
    for (const b of balls.filter(x => x.done)) {
      hits.set(b.idx, now);
      pushHist(histEl, b.mult + '×', b.mult >= 10 ? 'big' : b.mult >= 1 ? 'win' : 'lose', 16);
      release(b.payout);
      if (b.mult >= 2) sfx.win(b.mult >= 10); else sfx.tick(0.6);
    }
    balls = balls.filter(x => !x.done);
    if (!balls.length) lock(false);
    if (S.view === 'plinko') draw(now);
    const flashing = [...hits.values()].some(t => now - t < 400);
    raf = balls.length || flashing ? requestAnimationFrame(loop) : 0;
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw(now = performance.now()) {
    if (!g) return;
    ctx.clearRect(0, 0, g.W, g.H);
    ctx.fillStyle = C.peg;
    for (let i = 0; i < rows; i++) { const n = i + 3; for (let p = 0; p < n; p++) { ctx.beginPath(); ctx.arc(g.cx + (p - (n - 1) / 2) * g.gap, g.top + i * g.rowH, g.pegR, 0, TAU); ctx.fill(); } }
    const tbl = R.PLINKO[rows][risk], fs = Math.max(8, Math.min(12, g.gap * 0.3));
    for (let k = 0; k <= rows; k++) {
      const t = Math.abs(k - rows / 2) / (rows / 2), x = g.cx + (k - rows / 2) * g.gap, w = g.gap - 4;
      const ht = hits.get(k), age = ht ? now - ht : 1e9, dy = age < 400 ? 5 * (1 - age / 400) : 0;
      rr(x - w / 2, g.bucketY + dy, w, g.bucketH, 5);
      ctx.fillStyle = age < 400 ? C['gold-hi'] : mix(C.gold, C.lose, t); ctx.fill();
      ctx.fillStyle = C['gold-ink']; ctx.font = `700 ${fs}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const m = tbl[k];
      ctx.fillText(m >= 1000 ? '1K' : String(m) + (g.gap > 34 ? '×' : ''), x, g.bucketY + dy + g.bucketH / 2 + 1);
    }
    for (const b of balls) {
      if (b.rows !== rows) continue;
      const a = point(b, b.seg), z = point(b, Math.min(b.seg + 1, b.rows + 1)), s = Math.min(1, b.s);
      let x, y;
      if (b.seg === 0) { x = a.x; y = a.y + (z.y - a.y) * s * s; }
      else { x = a.x + (z.x - a.x) * s; y = a.y + (z.y - a.y) * s - g.rowH * 0.42 * Math.sin(Math.PI * s); }
      ctx.beginPath(); ctx.arc(x, y, g.ballR, 0, TAU); ctx.fillStyle = C.gold; ctx.fill();
      ctx.beginPath(); ctx.arc(x - g.ballR * 0.3, y - g.ballR * 0.3, g.ballR * 0.35, 0, TAU); ctx.fillStyle = C['gold-hi']; ctx.fill();
    }
  }
  return { init, onShow: layout };
})();

/* ================= DICE ================= */
const Dice = (() => {
  let target = 50, over = true, rolling = false, autoT = 0, range, marker, big, go, autoBtn, hist;
  const chance = () => (over ? 100 - target : target);
  const mult = () => Math.floor((99 / chance()) * 10000) / 10000;
  function init() {
    range = $('#dice-range'); marker = $('#dice-marker'); big = $('#dice-big'); go = $('#dice-go'); autoBtn = $('#dice-auto'); hist = $('#dice-hist');
    range.addEventListener('input', () => { target = +range.value; paint(); });
    $('#dice-dir').addEventListener('click', () => { if (autoT) return; over = !over; target = 100 - target; range.value = target; paint(); sfx.click(); });
    go.addEventListener('click', roll);
    autoBtn.addEventListener('click', () => (autoT ? stopAuto() : startAuto()));
    $('#dice-bet').addEventListener('input', paint);
    paint();
  }
  function paint() {
    range.style.setProperty('--t', target + '%'); range.classList.toggle('under', !over);
    $('#dice-mult').textContent = mult().toFixed(4) + '×';
    $('#dice-target').textContent = target.toFixed(2);
    $('#dice-dir-lbl').textContent = over ? 'Roll over' : 'Roll under';
    $('#dice-chance').textContent = chance().toFixed(2) + '%';
    $('#dice-profit').textContent = fmt(Math.floor(readBet('dice') * mult()) - readBet('dice'));
  }
  async function roll() {
    if (rolling) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('dice');
    rolling = true; go.disabled = true; hold(bet);
    const r = await act('dice.roll', { amount: bet, target, over });
    if (!r) { release(); rolling = false; go.disabled = !!autoT; stopAuto(); return; }
    marker.hidden = false; marker.classList.remove('win', 'lose');
    marker.style.setProperty('--p', r.roll / 100); marker.querySelector('span').textContent = r.roll.toFixed(2);
    sfx.tick(1.2);
    await sleep(reduced ? 30 : 330);
    marker.classList.add(r.win ? 'win' : 'lose');
    big.textContent = r.roll.toFixed(2); big.className = 'dice-big num ' + (r.win ? 'win' : 'lose');
    pushHist(hist, r.roll.toFixed(2), r.win ? 'win' : 'lose', 10);
    release(r.payout);
    r.win ? sfx.gem() : sfx.tick(0.5);
    rolling = false; go.disabled = !!autoT;
  }
  function startAuto() { if (!S.me) { act('noop'); return; } autoT = setInterval(roll, 700); autoBtn.textContent = 'Stop auto roll'; autoBtn.classList.add('stop'); go.disabled = true; range.disabled = true; lockBet('dice', true); roll(); }
  function stopAuto() { if (!autoT) return; clearInterval(autoT); autoT = 0; autoBtn.textContent = 'Start auto roll'; autoBtn.classList.remove('stop'); go.disabled = false; range.disabled = false; lockBet('dice', false); }
  return { init };
})();

/* ================= LIMBO ================= */
const Limbo = (() => {
  let busy = false, big, tgt;
  function init() {
    big = $('#limbo-big'); tgt = $('#limbo-target');
    tgt.addEventListener('input', paint); $('#limbo-bet').addEventListener('input', paint);
    $('#limbo-go').addEventListener('click', play);
    paint();
  }
  const target = () => Math.max(1.01, Math.floor((parseFloat(tgt.value) || 2) * 100) / 100);
  function paint() {
    const t = target();
    $('#limbo-chance').textContent = (99 / t).toFixed(2) + '%';
    $('#limbo-profit').textContent = fmt(Math.floor(readBet('limbo') * t) - readBet('limbo'));
  }
  async function play() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('limbo'), t = target();
    busy = true; hold(bet);
    const r = await act('limbo.play', { amount: bet, target: t });
    if (!r) { release(); busy = false; return; }
    big.className = 'limbo-big num';
    const D = reduced ? 50 : Math.min(900, 250 + Math.log(r.result) * 160), t0 = performance.now();
    await new Promise(res => { const f = now => { const k = Math.min(1, (now - t0) / D); big.textContent = Math.exp(Math.log(r.result) * (1 - Math.pow(1 - k, 2))).toFixed(2) + '×'; if (k < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    big.textContent = r.result.toFixed(2) + '×';
    big.classList.add(r.win ? 'win' : 'lose');
    $('#limbo-sub').textContent = r.win ? `Won ${fmt(r.payout)} at ${t.toFixed(2)}×` : `Needed ${t.toFixed(2)}×`;
    pushHist($('#limbo-hist'), r.result.toFixed(2) + '×', r.win ? 'win' : 'lose', 10);
    release(r.payout);
    r.win ? sfx.win(t >= 10) : sfx.lose();
    busy = false;
  }
  return { init };
})();

/* ================= KENO ================= */
const Keno = (() => {
  const picks = new Set();
  let busy = false, grid;
  function init() {
    grid = $('#keno-grid');
    grid.innerHTML = Array.from({ length: 40 }, (_, i) => `<button type="button" class="kn" data-n="${i + 1}">${i + 1}</button>`).join('');
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-n]'); if (!b || busy) return;
      const n = +b.dataset.n;
      clearDraw();
      if (picks.has(n)) picks.delete(n); else if (picks.size < 10) picks.add(n); else { toast('You can pick up to 10 numbers', 'bad'); return; }
      sfx.click(); paint();
    });
    $('#keno-random').addEventListener('click', () => { if (busy) return; clearDraw(); const n = picks.size || 10; picks.clear(); const all = Array.from({ length: 40 }, (_, i) => i + 1).sort(() => rnd() - 0.5); all.slice(0, n).forEach(x => picks.add(x)); sfx.chip(); paint(); });
    $('#keno-clear').addEventListener('click', () => { if (busy) return; picks.clear(); clearDraw(); paint(); });
    $('#keno-go').addEventListener('click', play);
    paint();
  }
  function clearDraw() { $$('.kn', grid).forEach(b => b.classList.remove('drawn', 'hit')); $$('.kp', $('#keno-pay')).forEach(x => x.classList.remove('on')); }
  function paint(hits = -1) {
    $$('.kn', grid).forEach(b => b.classList.toggle('pick', picks.has(+b.dataset.n)));
    $('#keno-count').textContent = `${picks.size} / 10`;
    const tbl = R.KENO[picks.size];
    $('#keno-pay').innerHTML = tbl ? tbl.map((m, h) => `<div class="kp ${h === hits ? 'on' : ''}"><b>${m}×</b><span>${h} hit${h === 1 ? '' : 's'}</span></div>`).join('') : '<p class="hint">Pick 1 to 10 numbers to see what each number of hits pays.</p>';
  }
  async function play() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    if (!picks.size) { toast('Pick at least one number', 'bad'); return; }
    const bet = readBet('keno');
    busy = true; hold(bet); clearDraw();
    const r = await act('keno.play', { amount: bet, picks: [...picks] });
    if (!r) { release(); busy = false; return; }
    for (const n of r.drawn) {
      const b = grid.querySelector(`[data-n="${n}"]`);
      b.classList.add(picks.has(n) ? 'hit' : 'drawn');
      picks.has(n) ? sfx.gem() : sfx.tick(0.9);
      await sleep(reduced ? 10 : 110);
    }
    paint(r.hits);
    release(r.payout);
    resultSound(bet, r.payout);
    if (r.payout > bet) pop($('#keno-stage'), r.mult + '×', '+' + fmt(r.payout));
    busy = false;
  }
  return { init };
})();

/* ================= HI-LO ================= */
const HiLo = (() => {
  let st = { on: false, bet: 0, card: null, mult: 1, steps: 0, cards: [] }, busy = false;
  function init() {
    $('#hilo-go').addEventListener('click', () => (st.on ? cashout() : start()));
    $$('[data-hl]').forEach(b => b.addEventListener('click', () => guess(b.dataset.hl)));
    render();
  }
  const p = (dir) => (st.card ? R.hiloChance(st.card.r, dir) : 0);
  const stepMult = dir => 0.99 / p(dir);
  function render() {
    const card = st.card;
    $('#hilo-card').outerHTML = card ? cardHtml(card, 'big" id="hilo-card') : '<div class="pc big" id="hilo-card"><b>?</b><i></i></div>';
    $('#hilo-mult').textContent = st.mult.toFixed(2) + '×';
    const hiB = $('[data-hl="hi"]'), loB = $('[data-hl="lo"]'), skB = $('[data-hl="skip"]');
    const ph = p('hi'), pl = p('lo');
    hiB.innerHTML = card ? `Higher or same<br><small class="num">${ph >= 1 ? '—' : stepMult('hi').toFixed(2) + '× · ' + (ph * 100).toFixed(0) + '%'}</small>` : 'Higher or same';
    loB.innerHTML = card ? `Lower or same<br><small class="num">${pl >= 1 ? '—' : stepMult('lo').toFixed(2) + '× · ' + (pl * 100).toFixed(0) + '%'}</small>` : 'Lower or same';
    hiB.disabled = !st.on || ph >= 1 || busy; loB.disabled = !st.on || pl >= 1 || busy; skB.disabled = !st.on || busy;
    const go = $('#hilo-go');
    if (st.on) { go.classList.add('cash'); go.disabled = !st.steps || busy; go.textContent = st.steps ? `Cash out ${fmt(Math.floor(st.bet * st.mult))}` : 'Make a guess'; }
    else { go.classList.remove('cash'); go.disabled = busy; go.textContent = 'Bet'; }
    lockBet('hilo', st.on);
    $('#hilo-info').innerHTML = kv([['Multiplier', st.mult.toFixed(2) + '×'], ['Correct guesses', st.steps], ['Cash out now', st.on && st.steps ? fmt(Math.floor(st.bet * st.mult)) : '—']]);
    const LBL = { start: 'Start', hi: 'Higher', lo: 'Lower', skip: 'Skip', bust: 'Bust' };
    $('#hilo-trail').innerHTML = st.cards.slice(-12).map(c => `<div class="trail-card">${cardHtml(c, 'sm')}<small>${LBL[c.g] || ''}</small></div>`).join('');
  }
  async function start() {
    if (busy) return;
    const bet = readBet('hilo');
    busy = true; const r = await act('hilo.start', { amount: bet }); busy = false;
    if (!r) { render(); return; }
    st = { on: true, bet, card: r.card, mult: 1, steps: 0, cards: [{ ...r.card, g: 'start' }] };
    sfx.card(); render();
  }
  async function guess(dir) {
    if (!st.on || busy) return;
    busy = true; render();
    const r = await act('hilo.guess', { dir });
    busy = false;
    if (!r) { render(); return; }
    sfx.card();
    if (r.skip) { st.card = r.card; st.cards.push({ ...r.card, g: 'skip' }); render(); return; }
    if (r.win) { st.card = r.card; st.mult = r.mult; st.steps++; st.cards.push({ ...r.card, g: dir }); sfx.gem(); render(); return; }
    st.cards.push({ ...r.card, g: 'bust' }); st.card = r.card; st.on = false;
    shake($('#hilo-stage')); setTimeout(() => sfx.lose(), 200);
    render();
  }
  async function cashout() {
    if (!st.on || busy || !st.steps) return;
    busy = true; const r = await act('hilo.cashout'); busy = false;
    if (!r) { render(); return; }
    st.on = false; pop($('#hilo-stage'), r.mult.toFixed(2) + '×', '+' + fmt(r.payout)); sfx.cashout(); resultSound(st.bet, r.payout);
    render();
  }
  function resume(g) {
    if (!g) { if (st.on) { st.on = false; render(); } return; }
    st = { on: true, bet: g.bet, card: g.card, mult: g.mult, steps: g.steps, cards: [...g.cards] };
    render();
  }
  return { init, resume };
})();

/* ================= WHEEL ================= */
const Wheel = (() => {
  let cv, ctx, risk = 'medium', rot = 0, busy = false, lastIdx = -1;
  const COL = { 0: '#2a3f48', 1.2: '#2f8f83', 1.5: '#2f7fd6', 1.7: '#8b4fd6', 2: '#3edc8f', 3: '#f5b83f', 3.8: '#ff8a3d', 29.4: '#ff5d6b' };
  function init() {
    cv = $('#wheel-cv'); ctx = cv.getContext('2d');
    $('#wheel-risk').addEventListener('click', e => { const b = e.target.closest('[data-risk]'); if (!b || busy) return; risk = b.dataset.risk; $$('#wheel-risk button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); lastIdx = -1; legend(); draw(); sfx.click(); });
    $('#wheel-go').addEventListener('click', spin);
    legend();
  }
  function legend(hit) {
    const seg = R.WHEEL[risk], vals = [...new Set(seg)].sort((a, b) => a - b);
    $('#wheel-legend').innerHTML = vals.map(v => `<span class="wl ${hit === v ? 'on' : ''}"><i style="background:${COL[v]}"></i>${v.toFixed(2)}× · ${seg.filter(x => x === v).length}/30</span>`).join('');
  }
  function draw() {
    if (!fitCanvas(cv)) return;
    const W = cv.clientWidth, cx = W / 2, cy = W / 2, Rr = W / 2 - 14, segs = R.WHEEL[risk], n = segs.length, a = TAU / n;
    ctx.clearRect(0, 0, W, W);
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * a - Math.PI / 2, a1 = a0 + a;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Rr, a0 + 0.004, a1 - 0.004); ctx.closePath();
      ctx.fillStyle = COL[segs[i]]; ctx.globalAlpha = lastIdx >= 0 && lastIdx !== i ? 0.55 : 1; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.62, 0, TAU); ctx.fillStyle = C.panel; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 11, 2); ctx.lineTo(cx + 11, 2); ctx.lineTo(cx, 22); ctx.closePath(); ctx.fillStyle = C.fg; ctx.fill();
  }
  async function spin() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('wheel');
    busy = true; hold(bet); $('#wheel-go').disabled = true;
    const r = await act('wheel.spin', { amount: bet, risk });
    if (!r) { release(); busy = false; $('#wheel-go').disabled = false; return; }
    lastIdx = -1; $('#wheel-res').textContent = '';
    const n = R.WHEEL[risk].length, a = TAU / n, r0 = rot, tgt = (((-(r.idx + 0.5) * a) % TAU) + TAU) % TAU;
    let r1 = r0 + TAU * 4; r1 += (((tgt - r1) % TAU) + TAU) % TAU;
    const D = reduced ? 300 : 3200, t0 = performance.now();
    let lastSeg = -1;
    sfx.spin();
    await new Promise(res => {
      const f = now => {
        const k = Math.min(1, (now - t0) / D);
        rot = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 3));
        const sg = Math.floor(rot / a);
        if (sg !== lastSeg) { lastSeg = sg; sfx.tick(0.7 + k * 0.5); }
        draw();
        if (k < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    rot = ((rot % TAU) + TAU) % TAU; lastIdx = r.idx; draw(); legend(r.mult);
    const res = $('#wheel-res'); res.textContent = r.mult.toFixed(2) + '×'; res.style.color = COL[r.mult];
    release(r.payout);
    resultSound(bet, r.payout);
    busy = false; $('#wheel-go').disabled = false;
  }
  return { init, onShow: draw };
})();

/* ================= SLOTS ================= */
const Slots = (() => {
  const star = (() => { let p = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? 8 : 19, a = -Math.PI / 2 + (i * Math.PI) / 5; p += `${(24 + r * Math.cos(a)).toFixed(1)},${(25 + r * Math.sin(a)).toFixed(1)} `; } return p; })();
  const SVG = [
    '<svg viewBox="0 0 48 48"><path d="M24 7c-2 8-8 14-13 19M24 7c2 8 6 13 11 17" stroke="#2e8b3e" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M24 7c4-3 9-2 12 1-4 2-8 2-12-1z" fill="#3fae4f"/><circle cx="13" cy="32" r="9" fill="#d4283a"/><circle cx="35" cy="30" r="9" fill="#d4283a"/><circle cx="10" cy="29" r="2.5" fill="#ff9aa4"/><circle cx="32" cy="27" r="2.5" fill="#ff9aa4"/></svg>',
    '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="25" rx="17" ry="12.5" fill="#f4d23c" stroke="#c9a215" stroke-width="2" transform="rotate(-20 24 25)"/><ellipse cx="18" cy="20" rx="5" ry="2.3" fill="#fff3a6" transform="rotate(-20 18 20)"/></svg>',
    '<svg viewBox="0 0 48 48"><path d="M24 4v7" stroke="#3a7d2c" stroke-width="3" stroke-linecap="round"/><path d="M25 8c5-4 10-3 12 0-5 2-8 2-12 0z" fill="#4caf50"/>' + [[17, 15], [24, 14], [31, 15], [14, 22], [21, 22], [28, 22], [35, 22], [18, 29], [25, 29], [32, 29], [21, 36], [28, 36], [24, 42]].map(([x, y]) => `<circle cx="${x}" cy="${y + 1}" r="4.6" fill="#7b3fb5" stroke="#4e2280" stroke-width="1"/><circle cx="${x - 1.4}" cy="${y - 0.4}" r="1.3" fill="#c79bf0"/>`).join('') + '</svg>',
    '<svg viewBox="0 0 48 48"><path d="M24 6c-8 0-12 7-12 15v8l-4 6h32l-4-6v-8c0-8-4-15-12-15z" fill="#f5b83f" stroke="#a8721a" stroke-width="2"/><circle cx="24" cy="39" r="4" fill="#a8721a"/><path d="M18 14c1-3 3-4 5-4" stroke="#ffe7a6" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    `<svg viewBox="0 0 48 48"><polygon points="${star}" fill="#ffcc33" stroke="#c98a00" stroke-width="2" stroke-linejoin="round"/></svg>`,
    '<svg viewBox="0 0 48 48"><path d="M10 8h29l-15 32h-9l12-24H10z" fill="#e0263b" stroke="#7a0f1c" stroke-width="2" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 48 48"><path d="M14 8h20l10 12-20 22L4 20z" fill="#5fd3f3" stroke="#1d7fa3" stroke-width="2" stroke-linejoin="round"/><path d="M4 20h40M14 8l10 34 10-34M19 20l5-12 5 12" stroke="#1d7fa3" stroke-width="1.5" fill="none"/></svg>',
  ];
  const total = R.SLOTS.weights.reduce((a, b) => a + b, 0);
  const randSym = () => { let x = rnd() * total; for (let i = 0; i < 7; i++) { if (x < R.SLOTS.weights[i]) return i; x -= R.SLOTS.weights[i]; } return 0; };
  let busy = false, view = [[0, 1, 2], [3, 4, 5], [6, 0, 1]];
  function init() {
    view = view.map(() => [randSym(), randSym(), randSym()]);
    $('#reels').innerHTML = view.map(v => `<div class="reel"><div class="strip">${v.map(s => `<div class="sym">${SVG[s]}</div>`).join('')}</div></div>`).join('');
    const rows = R.SLOTS.pay3.map((m, i) => [i, m]).reverse().map(([i, m]) => `<div class="pt"><span class="syms">${SVG[i] + SVG[i] + SVG[i]}</span><span>${m}×</span></div>`).join('');
    $('#slots-pay').innerHTML = rows + `<div class="pt"><span class="syms">${SVG[0] + SVG[0]}</span><span>${R.SLOTS.twoCherry}×</span></div><div class="pt"><span class="syms">${SVG[0]}</span><span>${R.SLOTS.oneCherry}×</span></div>`;
    $('#slots-go').addEventListener('click', spin);
  }
  async function spin() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('slots');
    busy = true; hold(bet); $('#slots-go').disabled = true;
    const msg = $('#slot-msg'); msg.className = 'slot-msg'; msg.textContent = 'Spinning…';
    const r = await act('slots.spin', { amount: bet });
    if (!r) { release(); busy = false; $('#slots-go').disabled = false; msg.textContent = 'Line up three of a kind on the middle row'; return; }
    sfx.spin();
    const reels = $$('.reel');
    const symH = reels[0].clientHeight / 3;
    await Promise.all(reels.map((reel, i) => new Promise(res => {
      const strip = reel.querySelector('.strip');
      const fill = Array.from({ length: 18 + i * 7 }, randSym);
      const final = [randSym(), r.reels[i], randSym()];
      const list = [...view[i], ...fill, ...final];
      strip.innerHTML = list.map(s => `<div class="sym">${SVG[s]}</div>`).join('');
      strip.style.transition = 'none'; strip.style.transform = 'translateY(0)';
      void strip.offsetWidth;
      const D = reduced ? 100 : 1100 + i * 380;
      strip.style.transition = `transform ${D}ms cubic-bezier(.2,.75,.25,1.04)`;
      strip.style.transform = `translateY(${-(list.length - 3) * symH}px)`;
      setTimeout(() => {
        sfx.reelStop();
        view[i] = final;
        strip.style.transition = 'none'; strip.style.transform = 'translateY(0)';
        strip.innerHTML = final.map(s => `<div class="sym">${SVG[s]}</div>`).join('');
        res();
      }, D + 30);
    })));
    release(r.payout);
    if (r.mult > 1) { msg.className = 'slot-msg win'; msg.textContent = `${r.mult}× · you won ${fmt(r.payout)}`; resultSound(bet, r.payout); if (r.mult >= 50) pop($('#slots-stage'), r.mult + '×', '+' + fmt(r.payout)); }
    else if (r.mult > 0) { msg.textContent = `One cherry · ${fmt(r.payout)} back`; sfx.coin(); }
    else { msg.textContent = 'No match. Spin again'; sfx.tick(0.5); }
    busy = false; $('#slots-go').disabled = false;
  }
  return { init };
})();

/* ================= BACCARAT ================= */
const Baccarat = (() => {
  const bets = { player: 0, banker: 0, tie: 0 };
  let busy = false;
  const chip = () => Math.max(1, Math.round((parseFloat($('#bac-chip').value) || 0) * 100));
  const total = () => bets.player + bets.banker + bets.tie;
  function paint() {
    $$('#bac-bets .bac-spot').forEach(b => { const v = bets[b.dataset.spot]; b.querySelector('[data-amt]').textContent = fmt(v); b.classList.toggle('on', v > 0); b.disabled = busy; });
    $('#bac-total').textContent = fmt(total());
    $('#bac-go').disabled = busy || !total();
  }
  function init() {
    $('#bac-bets').addEventListener('click', e => { const b = e.target.closest('[data-spot]'); if (!b || busy) return; bets[b.dataset.spot] += chip(); sfx.chip(); paint(); });
    $('#bac-clear').addEventListener('click', () => { if (busy) return; bets.player = bets.banker = bets.tie = 0; sfx.click(); paint(); });
    $('#bac-double').addEventListener('click', () => { if (busy) return; for (const k in bets) bets[k] *= 2; sfx.chip(); paint(); });
    $('#bac-go').addEventListener('click', deal);
    paint();
  }
  async function deal() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const t = total();
    if (!t) { toast('Tap Player, Banker or Tie to place a bet', 'bad'); return; }
    busy = true; paint(); hold(t);
    $('#bac-pc').innerHTML = ''; $('#bac-bc').innerHTML = ''; $('#bac-p').textContent = '–'; $('#bac-b').textContent = '–';
    const res = $('#bac-res'); res.className = 'bac-res'; res.textContent = 'Dealing…';
    $('#bac-side-p').classList.remove('win'); $('#bac-side-b').classList.remove('win');
    const r = await act('bac.play', { ...bets });
    if (!r) { release(); busy = false; paint(); res.textContent = 'Place your bets, then deal.'; return; }
    const order = [['p', r.P[0]], ['b', r.B[0]], ['p', r.P[1]], ['b', r.B[1]]];
    if (r.P[2]) order.push(['p', r.P[2]]);
    if (r.B[2]) order.push(['b', r.B[2]]);
    const got = { p: [], b: [] };
    for (const [side, c] of order) {
      got[side].push(c);
      $(side === 'p' ? '#bac-pc' : '#bac-bc').insertAdjacentHTML('beforeend', cardHtml(c, 'deal' + (got[side].length === 3 ? ' third' : '')));
      $(side === 'p' ? '#bac-p' : '#bac-b').textContent = R.bacTotal(got[side]);
      sfx.card();
      await sleep(reduced ? 40 : got[side].length === 3 ? 750 : 420);
    }
    const W = { player: 'Player wins', banker: 'Banker wins', tie: "It's a tie" }[r.winner];
    if (r.winner !== 'tie') $(r.winner === 'player' ? '#bac-side-p' : '#bac-side-b').classList.add('win');
    res.className = 'bac-res ' + (r.payout > t ? 'win' : r.payout === t ? '' : 'lose');
    res.textContent = `${W}, ${r.p} to ${r.b}. ` + (r.payout > t ? `You won ${fmt(r.payout)}` : r.payout === t ? 'Your bets came back' : r.payout ? `${fmt(r.payout)} came back` : 'You lost this one');
    pushHist($('#bac-hist'), r.winner === 'tie' ? 'T' : r.winner === 'player' ? 'P' : 'B', r.winner === 'tie' ? 'bt' : r.winner === 'player' ? 'bp' : 'bb', 18);
    release(r.payout);
    resultSound(t, r.payout);
    busy = false; paint();
  }
  return { init };
})();

/* ================= VIDEO POKER ================= */
const VideoPoker = (() => {
  let st = { on: false, bet: 0, cards: [], held: [false, false, false, false, false] }, busy = false;
  const label = k => (R.VP_PAY.find(x => x[0] === k) || [0, ''])[1];
  function payTable(hit) { $('#vp-pay').innerHTML = R.VP_PAY.map(([k, l, m]) => `<div class="vpp ${hit === k ? 'on' : ''}"><span>${l}</span><b class="num">${m}×</b></div>`).join(''); }
  function render() {
    const cards = st.cards.length ? st.cards : [null, null, null, null, null];
    $('#vp-hand').innerHTML = cards.map((c, i) => `<button type="button" class="vp-card ${st.on && st.held[i] ? 'held' : ''}" data-i="${i}" ${st.on && !busy ? '' : 'disabled'} aria-pressed="${st.on && st.held[i]}" aria-label="Card ${i + 1}">${cardHtml(c, 'big')}<span class="vp-held">Held</span></button>`).join('');
    const go = $('#vp-go'); go.textContent = st.on ? 'Draw' : 'Deal'; go.classList.toggle('cash', st.on); go.disabled = busy;
    lockBet('vp', st.on);
  }
  function init() {
    $('#vp-hand').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b || !st.on || busy) return; const i = +b.dataset.i; st.held[i] = !st.held[i]; b.classList.toggle('held', st.held[i]); b.setAttribute('aria-pressed', String(st.held[i])); sfx.click(); });
    $('#vp-go').addEventListener('click', () => (st.on ? draw() : deal()));
    payTable(); render();
  }
  async function deal() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('vp');
    busy = true; render();
    const r = await act('vp.deal', { amount: bet });
    busy = false;
    if (!r) { render(); return; }
    st = { on: true, bet, cards: r.cards, held: [false, false, false, false, false] };
    render();
    $$('#vp-hand .pc').forEach((c, i) => { c.classList.add('deal'); c.style.animationDelay = i * 60 + 'ms'; });
    sfx.card();
    const res = $('#vp-res'); res.className = 'vp-res';
    res.textContent = r.hand ? `You already have ${label(r.hand).toLowerCase()}. Tap cards to keep, then draw.` : 'Tap the cards you want to keep, then draw.';
    payTable(r.hand);
  }
  async function draw() {
    if (busy || !st.on) return;
    busy = true; render();
    const r = await act('vp.draw', { hold: st.held });
    busy = false;
    if (!r) { render(); return; }
    const held = st.held;
    st.cards = r.cards; st.on = false;
    render();
    $$('#vp-hand .vp-card').forEach((b, i) => { if (!held[i]) b.querySelector('.pc').classList.add('deal'); else b.classList.add('kept'); });
    sfx.card();
    payTable(r.hand);
    const res = $('#vp-res');
    if (r.payout > 0) {
      res.className = 'vp-res win'; res.textContent = `${label(r.hand)}! ${r.mult}× · ${fmt(r.payout)}`;
      if (r.mult >= 9) pop($('#vp-stage'), r.mult + '×', '+' + fmt(r.payout));
      if (r.payout === st.bet) sfx.coin(); else resultSound(st.bet, r.payout);
    } else { res.className = 'vp-res lose'; res.textContent = 'No winning hand. Deal again?'; sfx.lose(); }
    st.held = [false, false, false, false, false];
  }
  function resume(g) {
    if (!g) { if (st.on) { st.on = false; render(); } return; }
    st = { on: true, bet: g.bet, cards: g.cards, held: [false, false, false, false, false] };
    $('#vp-bet').value = String(g.bet / 100);
    render(); payTable(R.vpHand(g.cards));
  }
  return { init, resume };
})();

/* ================= DIAMONDS ================= */
const Diamonds = (() => {
  const COL = ['#3edc8f', '#74c8ff', '#ff5d6b', '#f5b83f', '#b77bff', '#ff8ad6', '#e8f1f0'];
  const gem = (c, cls = '') => `<span class="dgem ${cls}" style="--g:${COL[c]}"><svg viewBox="0 0 40 40" aria-hidden="true"><path class="dg-b" d="M6 14l7-9h14l7 9-14 21z"/><path class="dg-t" d="M6 14h28l-7-9H13z"/><path class="dg-l" d="M6 14l14 21-7-21z"/><path class="dg-r" d="M34 14L20 35l7-21z"/><path class="dg-h" d="M13 5l-2 9h9z"/></svg></span>`;
  const EX = { five: [0, 0, 0, 0, 0], four: [3, 3, 3, 3, 1], full: [2, 2, 2, 4, 4], three: [1, 1, 1, 5, 6], twopair: [4, 4, 0, 0, 3], pair: [5, 5, 1, 2, 3], none: [0, 1, 2, 3, 4] };
  let busy = false;
  const empty = () => Array.from({ length: 5 }, () => '<span class="dslot"></span>').join('');
  function payTable(hit) { $('#dm-pay').innerHTML = R.DIAMONDS.map(([k, l, m]) => `<div class="dmp ${hit === k ? 'on' : ''}"><span class="dmp-g">${EX[k].map(c => gem(c, 'xs')).join('')}</span><span class="dmp-l">${l}</span><b class="num">${m}×</b></div>`).join(''); }
  function init() { $('#dm-row').innerHTML = empty(); payTable(); $('#diamonds-go').addEventListener('click', play); }
  async function play() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('diamonds');
    busy = true; $('#diamonds-go').disabled = true; hold(bet);
    const r = await act('diamonds.play', { amount: bet });
    if (!r) { release(); busy = false; $('#diamonds-go').disabled = false; return; }
    const row = $('#dm-row'); row.innerHTML = empty(); payTable();
    const res = $('#dm-res'); res.className = 'dm-res'; res.textContent = '…';
    const cnt = {}; r.gems.forEach(g => (cnt[g] = (cnt[g] || 0) + 1));
    for (let i = 0; i < 5; i++) { row.children[i].innerHTML = gem(r.gems[i], 'drop'); sfx.gemDrop(i); await sleep(reduced ? 20 : 160); }
    await sleep(reduced ? 0 : 200);
    r.gems.forEach((g, i) => { if (cnt[g] > 1) row.children[i].classList.add('match'); else row.children[i].classList.add('dim'); });
    payTable(r.hand);
    const l = (R.DIAMONDS.find(x => x[0] === r.hand) || [0, ''])[1];
    res.className = 'dm-res ' + (r.payout > bet ? 'win' : r.payout ? '' : 'lose');
    res.textContent = r.payout ? `${l} · ${r.mult}× · ${fmt(r.payout)}` : 'No match this time';
    pushHist($('#dm-hist'), r.mult + '×', r.mult >= 3 ? 'big' : r.mult >= 1 ? 'win' : 'lose', 12);
    if (r.mult >= 5) pop($('#diamonds-stage'), r.mult + '×', '+' + fmt(r.payout));
    release(r.payout); resultSound(bet, r.payout);
    busy = false; $('#diamonds-go').disabled = false;
  }
  return { init };
})();

/* ================= PUMP ================= */
const Pump = (() => {
  let st = { on: false, bet: 0, d: 'medium', k: 0 }, busy = false;
  const max = d => 25 - R.PUMP[d].pops;
  function init() {
    const sel = $('#pump-diff');
    for (const [k, v] of Object.entries(R.PUMP)) sel.add(new Option(v.label, k));
    sel.value = 'medium';
    sel.addEventListener('change', () => { if (!st.on) { st.d = sel.value; paint(); } });
    $('#pump-go').addEventListener('click', () => (st.on ? cashout() : start()));
    $('#pump-pump').addEventListener('click', pump);
    $('#pump-wrap').addEventListener('click', () => { if (st.on) pump(); });
    $('#pump-bet').addEventListener('input', paint);
    paint();
  }
  function paint() {
    const d = st.on ? st.d : $('#pump-diff').value, k = st.on ? st.k : 0, bet = st.on ? st.bet : readBet('pump');
    const cur = R.pumpMult(d, k), next = k < max(d) ? R.pumpMult(d, k + 1) : 0;
    $('#pump-info').innerHTML = kv([['Pumps', `${k} / ${max(d)}`], ['Cash out now', k ? `${cur.toFixed(2)}× · ${fmt(Math.floor(bet * cur))}` : '—'], ['Next pump pays', next ? next.toFixed(2) + '×' : '—']]);
    const mEl = $('#pump-mult');
    if (st.on || !mEl.classList.contains('lose')) { mEl.classList.remove('lose'); mEl.textContent = (k ? cur : 1).toFixed(2) + '×'; }
    const f = Math.min(1, k / Math.min(max(d), 12));
    const wrap = $('#pump-wrap');
    wrap.style.setProperty('--s', (0.42 + 0.58 * f).toFixed(3));
    wrap.style.setProperty('--h', String(Math.round(150 - 150 * f)));
    const go = $('#pump-go'), pb = $('#pump-pump');
    if (st.on) { go.classList.add('cash'); go.disabled = !k || busy; go.textContent = k ? `Cash out ${fmt(Math.floor(bet * cur))}` : 'Pump first'; pb.disabled = busy; }
    else { go.classList.remove('cash'); go.disabled = busy; go.textContent = 'Bet'; pb.disabled = true; }
    lockBet('pump', st.on); $('#pump-diff').disabled = st.on;
    const from = Math.max(1, k), list = [];
    for (let i = from; i <= Math.min(max(d), from + 5); i++) list.push(i);
    $('#pump-ladder').innerHTML = list.map(i => `<span class="${i <= k ? 'done' : i === k + 1 ? 'next' : ''}"><small>${i}</small>${R.pumpMult(d, i).toFixed(2)}×</span>`).join('');
  }
  async function start() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('pump'), d = $('#pump-diff').value;
    busy = true; const r = await act('pump.start', { amount: bet, diff: d }); busy = false;
    if (!r) { paint(); return; }
    st = { on: true, bet, d, k: 0 };
    $('#pump-wrap').classList.remove('popped');
    $('#pump-mult').classList.remove('lose');
    sfx.chip(); paint();
  }
  async function pump() {
    if (!st.on || busy) return;
    busy = true; paint();
    const wrap = $('#pump-wrap');
    wrap.classList.remove('puff'); void wrap.offsetWidth; wrap.classList.add('puff');
    sfx.pump(st.k + 1);
    const [r] = await Promise.all([act('pump.pump'), sleep(reduced ? 0 : 220)]);
    busy = false;
    if (!r) { paint(); return; }
    if (r.pop) {
      st.on = false;
      wrap.classList.add('popped'); sfx.pop(); shake($('#pump-stage')); setTimeout(() => sfx.lose(), 300);
      const mEl = $('#pump-mult'); mEl.classList.add('lose'); mEl.textContent = 'Popped!';
      paint(); return;
    }
    st.k = r.k;
    if (r.done) { st.on = false; win(r.mult, r.payout); }
    paint();
  }
  async function cashout() {
    if (!st.on || busy || !st.k) return;
    busy = true; const r = await act('pump.cashout'); busy = false;
    if (!r) { paint(); return; }
    st.on = false; win(r.mult, r.payout); paint();
  }
  function win(mult, payout) { pop($('#pump-stage'), mult.toFixed(2) + '×', '+' + fmt(payout)); sfx.cashout(); resultSound(st.bet, payout); }
  function resume(g) {
    if (!g) { if (st.on) { st.on = false; paint(); } return; }
    st = { on: true, bet: g.bet, d: g.diff, k: g.k };
    $('#pump-diff').value = g.diff; $('#pump-bet').value = String(g.bet / 100);
    $('#pump-wrap').classList.remove('popped');
    paint();
  }
  return { init, resume };
})();

/* ================= UPGRADER ================= */
const Upgrader = (() => {
  let busy = false, rot = 0;
  const L = Math.log(R.UPG_MAX / R.UPG_MIN);
  const toRange = m => Math.round((Math.log(m / R.UPG_MIN) / L) * 1000);
  const fromRange = v => Math.round(R.UPG_MIN * Math.exp((v / 1000) * L) * 100) / 100;
  const mult = () => Math.min(R.UPG_MAX, Math.max(R.UPG_MIN, Math.floor((parseFloat($('#upg-mult').value) || 2) * 100) / 100));
  function arc(ch) {
    const a = Math.min(0.9999, ch) * 2 * Math.PI, x = 100 + 84 * Math.sin(a), y = 100 - 84 * Math.cos(a);
    return `M100 16A84 84 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  function paint() {
    const m = mult(), ch = R.upgChance(m);
    $('#upg-chance').textContent = (ch * 100).toFixed(2) + '%';
    $('#upg-payout').textContent = fmt(Math.floor(readBet('upgrader') * m));
    $('#upg-arc').setAttribute('d', arc(ch));
    if (!busy) { const b = $('#upg-big'); b.textContent = m.toFixed(2) + '×'; b.className = 'num'; $('#upg-sub').textContent = `${(ch * 100).toFixed(2)}% chance. Land on green to win ${fmt(Math.floor(readBet('upgrader') * m))}`; }
    $$('#upg-presets button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.m === m)));
  }
  function init() {
    $('#upg-mult').addEventListener('input', () => { $('#upg-range').value = toRange(mult()); paint(); });
    $('#upg-mult').addEventListener('change', () => { $('#upg-mult').value = mult().toFixed(2); paint(); });
    $('#upg-range').addEventListener('input', e => { $('#upg-mult').value = fromRange(+e.target.value).toFixed(2); paint(); });
    $('#upg-presets').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b || busy) return; $('#upg-mult').value = (+b.dataset.m).toFixed(2); $('#upg-range').value = toRange(+b.dataset.m); sfx.click(); paint(); });
    $('#upgrader-bet').addEventListener('input', paint);
    $('#upg-go').addEventListener('click', play);
    $('#upg-range').value = toRange(2);
    paint();
  }
  async function play() {
    if (busy) return;
    if (!S.me) { act('noop'); return; }
    const bet = readBet('upgrader'), m = mult();
    busy = true; $('#upg-go').disabled = true; $('#upg-mult').disabled = $('#upg-range').disabled = true; hold(bet);
    const r = await act('upgrade.play', { amount: bet, mult: m });
    if (!r) { release(); busy = false; $('#upg-go').disabled = $('#upg-mult').disabled = $('#upg-range').disabled = false; return; }
    const needle = $('#upg-needle'), big = $('#upg-big');
    big.className = 'num'; big.textContent = m.toFixed(2) + '×';
    const end = rot - (rot % 360) + 360 * 4 + r.roll * 360, from = rot, D = reduced ? 300 : 3000, t0 = performance.now();
    let tick = -1;
    await new Promise(res => {
      const f = now => {
        const k = Math.min(1, (now - t0) / D), a = from + (end - from) * (1 - Math.pow(1 - k, 4));
        needle.style.transform = `rotate(${a}deg)`;
        const tk = Math.floor(a / 12); if (tk !== tick) { tick = tk; sfx.needle(); }
        if (k < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    rot = end;
    big.textContent = r.win ? '+' + fmt(r.payout) : 'Missed';
    big.className = 'num ' + (r.win ? 'win' : 'lose');
    $('#upg-sub').textContent = r.win ? `Upgraded ${fmt(bet)} to ${fmt(r.payout)}` : `It needed to stop on green (${(r.chance * 100).toFixed(2)}% chance)`;
    pushHist($('#upg-hist'), m.toFixed(2) + '×', r.win ? (m >= 10 ? 'big' : 'win') : 'lose', 12);
    release(r.payout);
    if (r.win) { sfx.win(m >= 10); if (m >= 10) pop($('#upg-stage'), m.toFixed(2) + '×', '+' + fmt(r.payout)); } else sfx.lose();
    busy = false; $('#upg-go').disabled = $('#upg-mult').disabled = $('#upg-range').disabled = false;
  }
  return { init };
})();

/* ================= ADMIN ================= */
const Admin = (() => {
  let rows = [], sel = null, ov = null;
  const ago = ts => { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  const tags = u => [u.online ? '<i class="dot"></i>online' : '', u.owner ? 'owner' : u.admin ? 'admin' : '', u.banned ? 'banned' : '', u.mutedUntil > Date.now() ? 'muted' : ''].filter(Boolean).join(' · ') || `${u.bets.toLocaleString('en-US')} bets`;
  const coinsIn = id => Math.round(parseFloat($(id).value) * 100);
  async function overview() {
    const r = await act('admin.overview');
    if (!r) return;
    ov = r;
    $('#adm-role').textContent = r.owner ? 'Owner' : 'Admin';
    $('#adm-stats').innerHTML = [['Players', r.players.toLocaleString('en-US')], ['Online now', r.online], ['Coins in wallets', fmtShort(r.coins)], ['Rain pot', fmt(r.rain)], ['Banned', r.banned]].map(([k, v]) => `<div class="adm-stat"><span>${k}</span><b class="num">${v}</b></div>`).join('');
    $('#adm-rainpot').textContent = fmt(r.rain);
    settingsForm(r.cfg);
    if (document.activeElement !== $('#adm-ann')) $('#adm-ann').value = r.announce ? r.announce.text : '';
    $('#adm-log').innerHTML = r.log.length ? r.log.map(l => `<li><span class="when">${ago(l.ts)}</span><b>${esc(l.by)}</b> ${esc(l.text)}</li>`).join('') : '<li class="empty">Nothing yet.</li>';
  }
  function settingsForm(cfg) {
    $('#adm-settings').innerHTML = R.SETTINGS.map(st => st.bool
      ? `<label class="switch adm-set"><input type="checkbox" name="${st.k}" ${cfg[st.k] ? 'checked' : ''}><span>${esc(st.label)}</span></label>`
      : `<label class="fld adm-set"><span class="lbl">${esc(st.label)}</span><input class="txt" type="number" name="${st.k}" min="${st.min}" max="${st.max}" step="${st.step}" value="${cfg[st.k]}"></label>`).join('');
  }
  async function search() {
    const r = await act('admin.find', { q: $('#admin-q').value.trim(), online: $('#adm-online').checked });
    if (!r) return;
    rows = r;
    $('#admin-body').innerHTML = rows.length ? rows.map(u => `<button type="button" class="adm-row ${sel === u.id ? 'on' : ''}" data-id="${u.id}">${avatar(u.name, 'sm')}<span class="li-name"><b>${esc(u.name)}${lvlTag(u.level)}</b><span>${tags(u)}</span></span><span class="num">${fmtShort(u.balance)}</span></button>`).join('') : '<p class="empty">No players match.</p>';
    const u = rows.find(x => x.id === sel);
    if (u) player(u);
  }
  function player(u) {
    sel = u.id;
    $$('#admin-body .adm-row').forEach(b => b.classList.toggle('on', +b.dataset.id === u.id));
    const me = S.me && S.me.id === u.id, owner = ov && ov.owner, locked = u.admin && !owner && !me;
    const kvs = [['Coins', fmt(u.balance)], ['Level', u.level], ['Wagered', fmt(u.wagered)], ['Net winnings', fmt(u.won - u.wagered)], ['Bets', u.bets.toLocaleString('en-US')], ['Joined', u.created ? new Date(u.created).toLocaleDateString() : '—']];
    $('#adm-player').innerHTML = `<div class="adm-ph">${avatar(u.name)}<div><h3>${esc(u.name)}${lvlTag(u.level)}</h3><span class="hint">${tags(u)}</span></div></div>
      <div class="kv adm-kv">${kv(kvs)}</div>
      ${locked ? '<p class="hint">This player is an admin. Only the owner (the first account) can change other admins.</p>' : `
      <div class="fld"><span class="lbl">Coins</span><div class="amt"><span class="coin sm"></span><input id="adm-coins" type="number" inputmode="decimal" min="0" step="1" placeholder="Amount" aria-label="Coins"></div></div>
      <div class="adm-btns"><button class="btn-go sm" type="button" data-p="give">Give</button><button class="btn-ghost sm" type="button" data-p="take">Take</button><button class="btn-ghost sm" type="button" data-p="set">Set coins to</button></div>
      ${me ? '' : `<span class="lbl">Chat</span><div class="adm-btns"><button class="btn-ghost sm" type="button" data-p="mute" data-min="10">Mute 10 min</button><button class="btn-ghost sm" type="button" data-p="mute" data-min="60">Mute 1 hour</button><button class="btn-ghost sm" type="button" data-p="mute" data-min="1440">Mute 1 day</button><button class="btn-ghost sm" type="button" data-p="mute" data-min="0">Unmute</button></div>`}
      <span class="lbl">Account</span>
      <div class="adm-btns"><button class="btn-ghost sm" type="button" data-p="rename">Rename</button><button class="btn-ghost sm" type="button" data-p="stats">Reset level and stats</button>${me ? '' : `<button class="btn-ghost sm" type="button" data-p="kick">Log them out</button><button class="btn-ghost sm ${u.banned ? '' : 'stop'}" type="button" data-p="ban">${u.banned ? 'Unban' : 'Ban'}</button>`}</div>
      ${owner && !me ? `<button class="btn-ghost sm adm-role" type="button" data-p="role">${u.admin ? 'Remove admin' : 'Make admin'}</button>` : ''}`}`;
  }
  async function playerAct(b) {
    const u = rows.find(x => x.id === sel);
    if (!u) return;
    const id = u.id, p = b.dataset.p;
    let ok = null;
    if (p === 'give' || p === 'take' || p === 'set') {
      const v = coinsIn('#adm-coins');
      if (!(v >= (p === 'set' ? 0 : 1))) { toast('Type a number of coins first', 'bad'); return; }
      ok = p === 'set' ? await act('admin.set', { id, balance: v }) : await act('admin.grant', { id, amount: p === 'give' ? v : -v });
    } else if (p === 'mute') ok = await act('admin.mute', { id, minutes: +b.dataset.min });
    else if (p === 'rename') { const name = prompt(`New name for ${u.name} (3–16 letters, numbers or underscores)`); if (!name) return; ok = await act('admin.rename', { id, name }); }
    else if (p === 'kick') ok = await act('admin.kick', { id });
    else if (p === 'stats') { if (!confirm(`Reset ${u.name}'s level, rakeback and leaderboard stats to zero? Their coins stay the same.`)) return; ok = await act('admin.stats', { id }); }
    else if (p === 'ban') { const banned = !u.banned; if (banned && !confirm(`Ban ${u.name}? They are logged out and can't log back in.`)) return; ok = await act('admin.ban', { id, banned }); }
    else if (p === 'role') { if (!confirm(u.admin ? `Remove ${u.name} as an admin?` : `Make ${u.name} an admin? They will be able to give coins, ban and mute players.`)) return; ok = await act('admin.role', { id, admin: !u.admin }); }
    if (ok) { toast('Done', 'good'); sfx.click(); search(); overview(); }
  }
  async function siteAct(k) {
    let ok = null;
    if (k === 'announce') { const text = $('#adm-ann').value.trim(); if (!text) { toast('Type an announcement first', 'bad'); return; } ok = await act('admin.announce', { text }); if (ok) toast('Announcement posted', 'good'); }
    else if (k === 'unannounce') { ok = await act('admin.announce', { text: '' }); if (ok) { $('#adm-ann').value = ''; toast('Announcement removed', 'good'); } }
    else if (k === 'giveall') {
      const v = coinsIn('#adm-giveall'), online = $('#adm-giveall-online').checked;
      if (!(v > 0)) { toast('Type how many coins each player gets', 'bad'); return; }
      if (!confirm(`Give ${fmt(v)} coins to ${online ? 'every player online right now' : 'every player'}?`)) return;
      ok = await act('admin.giveall', { amount: v, online });
      if (ok) toast(`Gave ${fmt(v)} coins to ${ok.n} players`, 'good');
    } else if (k === 'rainadd') { const v = coinsIn('#adm-rain'); if (!(v > 0)) { toast('Type how many coins to add', 'bad'); return; } ok = await act('admin.rain', { amount: v }); if (ok) { $('#adm-rain').value = ''; toast(`Added ${fmt(v)} coins to the rain`, 'rain'); } }
    else if (k === 'rainnow') { if (!confirm('Drop the rain now? Everyone who joined splits the pot.')) return; ok = await act('admin.rain', { now: true }); if (ok) toast('It will rain in a moment', 'rain'); }
    else if (k === 'clearchat') { if (!confirm('Delete every chat message for everyone?')) return; ok = await act('admin.clearchat'); if (ok) toast('Chat cleared', 'good'); }
    else if (k === 'settings') {
      const f = $('#adm-settings'), set = {};
      for (const st of R.SETTINGS) { const el = f.elements[st.k]; if (el) set[st.k] = st.bool ? el.checked : parseFloat(el.value); }
      ok = await act('admin.settings', { set });
      if (ok) { settingsForm(ok); toast('Settings saved', 'good'); }
    } else if (k === 'reset') {
      const bal = coinsIn('#adm-reset-amt'), word = $('#adm-reset-confirm').value;
      if (!(bal >= 0)) { toast('Type how many coins everyone should have', 'bad'); return; }
      if (word.trim().toUpperCase() !== 'RESET') { toast('Type RESET in the box to confirm', 'bad'); return; }
      if (!confirm(`Set every player's coins to ${fmt(bal)}? This can't be undone.`)) return;
      ok = await act('admin.reset', { balance: bal, stats: $('#adm-reset-stats').checked, confirm: word });
      if (ok) { $('#adm-reset-confirm').value = ''; toast("Everyone's coins were reset", 'good'); }
    }
    if (ok) { overview(); if (k === 'reset' || k === 'giveall') search(); }
  }
  function init() {
    $('#admin-form').addEventListener('submit', e => { e.preventDefault(); search(); });
    $('#adm-online').addEventListener('change', search);
    $('#admin-body').addEventListener('click', e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      const u = rows.find(x => x.id === +b.dataset.id);
      if (u) { player(u); if (innerWidth < 900) $('#adm-player').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
    });
    $('#adm-player').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) playerAct(b); });
    $('[data-view="admin"]').addEventListener('click', e => { const b = e.target.closest('[data-adm]'); if (b) siteAct(b.dataset.adm); });
  }
  return { init, onShow() { overview(); search(); } };
})();

export const SOLO = { mines: Mines, towers: Towers, plinko: Plinko, dice: Dice, limbo: Limbo, keno: Keno, hilo: HiLo, wheel: Wheel, slots: Slots, baccarat: Baccarat, videopoker: VideoPoker, diamonds: Diamonds, pump: Pump, upgrader: Upgrader, admin: Admin };
export function initSolo() { Object.values(SOLO).forEach(g => g.init()); }
