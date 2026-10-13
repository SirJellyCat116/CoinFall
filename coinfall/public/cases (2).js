// Coinfall cases, free cases and case battles. Results come from the server; this file shows them.
import { srvNow, lvlTag, $, $$, S, R, sfx, act, hold, release, fmt, fmtShort, esc, toast, pop, coinShower, reduced, sleep, avatar } from './app.js';

/* ---------- item art ----------
   Every item is drawn as SVG: a shape for its type (Blade, Pistol, Rifle…) painted in its finish (the first word
   of its name: Frost, Molten, Toxic…), sometimes with a pattern on top, and lit by its rarity colour. */
const FIN = {
  Neon: ['#ff4df2', '#2dfff0', 'glow'], Frost: ['#f2fdff', '#4fb8f0', 'ice'], Molten: ['#ffd23f', '#e0300a', 'glow'], Toxic: ['#d4ff3d', '#1d8a2c', 'spots'],
  Glitch: ['#ff2e88', '#2ef0ff', 'pixels'], Velvet: ['#d0507e', '#3d0a24'], Shadow: ['#5f6576', '#101216', 'stripes'], Royal: ['#9a7bff', '#25137a', 'facets'],
  Lunar: ['#eef0f7', '#7c86a3', 'spots'], Solar: ['#fff27a', '#ff7a00', 'glow'], Venom: ['#7dff5a', '#2b0b47', 'stripes'], Crystal: ['#d6f8ff', '#6b7dff', 'facets'],
  Storm: ['#b3c7d9', '#253449', 'stripes'], Phantom: ['#ddd2ff', '#3a2966'], Gilded: ['#fff1b3', '#b07c0b', 'facets'], Abyssal: ['#1ed4d4', '#04203a'],
  Blazing: ['#fff35a', '#ff2a00', 'glow'], Jungle: ['#a6d65a', '#2b4a1b', 'camo'], Titan: ['#d8dee4', '#56616c', 'stripes'], Nova: ['#ffffff', '#ff4fbf', 'glow'],
  Rusty: ['#e69a62', '#5a2a10', 'spots'], Chrome: ['chrome'], Arctic: ['#ffffff', '#8fcfff', 'camo'], Ember: ['#ffa040', '#6a1600', 'spots'],
  Cobalt: ['#6a9dff', '#0a2878'], Scarlet: ['#ff5468', '#6e000f'], Midnight: ['#5566e0', '#070b26', 'spots'], Pixel: ['#47ef86', '#3a8dff', 'pixels'],
  Retro: ['#ffb347', '#ff4f9a', 'stripes'], Hyper: ['#00f0ff', '#7a00ff', 'glow'], Static: ['#e6e6e6', '#3d3d3d', 'pixels'], Wild: ['#ffcc33', '#b8410c', 'camo'],
  Silent: ['#9ea8ba', '#262c38'], Crimson: ['#f03348', '#3e000c'], Ivory: ['#fffaec', '#c7b68a'], Onyx: ['#4d4d4d', '#050505', 'facets'],
  Sapphire: ['#70b8ff', '#082f80', 'facets'], Ruby: ['#ff6b88', '#7a0622', 'facets'], Jade: ['#6cffa9', '#07603a', 'facets'], Topaz: ['#ffdc94', '#b75f00', 'facets'],
  Plasma: ['#ff62f2', '#4a00ff', 'glow'], Vortex: ['#62f2ff', '#141466', 'stripes'], Cosmic: ['#c270ff', '#08082e', 'spots'], Feral: ['#ddb080', '#4d3115', 'camo'],
  Hollow: ['#b4bcc4', '#323941'], Prism: ['prism'], Quartz: ['#ffeaf4', '#bb83a3', 'facets'], Rogue: ['#b03a3a', '#151515', 'stripes'],
  Savage: ['#ff7a1f', '#241000', 'camo'], Thunder: ['#fff45e', '#30307e', 'stripes'],
};
const DK = '#1b2129', MT = '#c7d1d8', MD = '#7b8893', HI = 'rgba(255,255,255,.38)', SH = 'rgba(0,0,0,.28)';
// body = the parts painted in the item's finish (also used to clip the pattern). under/top = other parts. over = shine and details.
const ART = [
  { // Blade
    tf: 'rotate(-38 32 32)',
    body: '<path d="M25 28h25c6 0 10 2.6 12.5 5-3 2.6-8 4.5-14.5 4.5H25z"/>',
    under: `<path class="o" fill="${DK}" d="M4.5 29h17.5v8H4.5A3.5 3.5 0 0 1 1 33.5v-1A3.5 3.5 0 0 1 4.5 29z"/><rect class="o" fill="${MT}" x="21" y="24.5" width="4.5" height="17" rx="1.5"/>`,
    over: `<path fill="${HI}" d="M25 28h25c4.5 0 8 1.5 10.5 3.2H25z"/><path stroke="${SH}" stroke-width="1.2" d="M28 33.2h19"/><path stroke="rgba(255,255,255,.14)" stroke-width="1.4" d="M7 30v6M11 30v6M15 30v6M19 30v6"/>`,
  },
  { // Pistol
    tf: 'rotate(-6 32 32)',
    body: '<path d="M6 17h47a3 3 0 0 1 3 3v7H6z"/><path d="M11 32h9l-1.6 15h-8.6z"/>',
    under: `<path class="o" fill="${DK}" d="M8 26h42v5H31l-1.5 3H23l-2.8 21.5c-.3 1.7-1.5 2.5-3.2 2.5H9.5c-2 0-3-1.3-2.7-3.2L9.6 31z"/><path fill="none" stroke="${DK}" stroke-width="2.6" d="M24 32c0 6 3.5 9 8.5 9H37"/><rect fill="${MT}" x="51" y="14.5" width="3" height="2.5"/><rect fill="${MT}" x="8" y="14.5" width="4" height="2.5"/>`,
    over: `<path fill="${HI}" d="M6 17h47a3 3 0 0 1 3 3H6z"/><path stroke="${SH}" stroke-width="1.3" d="M10 20v5M13 20v5M16 20v5"/><rect fill="rgba(0,0,0,.4)" x="31" y="20" width="10" height="3" rx="1"/><path stroke="${MT}" stroke-width="2" stroke-linecap="round" d="M29 32l1.2 5"/>`,
  },
  { // Rifle
    tf: 'rotate(-8 32 32)',
    body: '<path d="M1 27l15-4v14L2.5 41.5A1.8 1.8 0 0 1 0 39.8z"/><path d="M42 24.5h13v9H42z"/><path d="M20 14h16a3 3 0 0 1 0 6H20a3 3 0 0 1 0-6z"/>',
    under: `<path class="o" fill="${DK}" d="M15 22.5h28v12H15z"/><path class="o" fill="${DK}" d="M28 34h7.5l2.6 11.4a1.2 1.2 0 0 1-1.2 1.6H31z"/><path class="o" fill="${DK}" d="M18.5 34h5.5l-2.5 10h-5.5z"/><rect class="o" fill="${MD}" x="55" y="27.4" width="8.5" height="3.4" rx="1"/><path stroke="${DK}" stroke-width="2.4" d="M24 20v3M32 20v3"/>`,
    over: `<path fill="${HI}" d="M15 22.5h28v2.5H15z"/><path stroke="${SH}" stroke-width="1.3" d="M44 27h9M44 30.5h9"/><circle cx="37.5" cy="17" r="1.8" fill="#74c8ff"/><path fill="${HI}" d="M20 14h16a3 3 0 0 1 2.6 1.5H17.4A3 3 0 0 1 20 14z"/>`,
  },
  { // Gloves
    body: '<path d="M18 12a3 3 0 0 1 6 0v19h-6z"/><path d="M25 8.5a3 3 0 0 1 6 0V31h-6z"/><path d="M32 9.5a3 3 0 0 1 6 0V31h-6z"/><path d="M39 14a3 3 0 0 1 6 0v17h-6z"/><path d="M17 27h29v13c0 7-5 11-12 11h-5c-7 0-12-4-12-11z"/><path d="M19.5 35.5l-9-7.4a3.2 3.2 0 0 1 4.1-4.9l8.6 6.6z"/>',
    top: `<path class="o" fill="${DK}" d="M19 48.5h25.5v8.5a2 2 0 0 1-2 2H21a2 2 0 0 1-2-2z"/>`,
    over: `<path stroke="${SH}" stroke-width="1.3" d="M18.5 31h27"/><path stroke="${HI}" stroke-width="1.6" stroke-linecap="round" d="M20.5 12.5v13M27.5 9v15M34.5 10v14"/><path stroke="rgba(255,255,255,.35)" stroke-width="1.4" d="M19.5 53h24.5"/>`,
  },
  { // Helmet
    body: '<path d="M9 40C9 22 19 11 32 11s23 11 23 29v5a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"/>',
    top: `<path class="o" fill="#0e151c" d="M14.5 29c5-3 11-4.5 17.5-4.5S44.5 26 49.5 29v9.5c-5 3-11 4.5-17.5 4.5s-12.5-1.5-17.5-4.5z"/><path class="o" fill="${DK}" d="M9 44h46v1a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z"/>`,
    over: `<path stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round" fill="none" d="M18.5 30.5c4-2 8.5-3 13-3"/><path fill="rgba(116,200,255,.25)" d="M14.5 33c5 2.5 11 3.5 17.5 3.5S44.5 35.5 49.5 33v5.5c-5 3-11 4.5-17.5 4.5s-12.5-1.5-17.5-4.5z"/><path fill="${HI}" d="M15 22c3-6 9-9.5 17-9.5v3c-7 0-12 3-15 7.5z"/><path stroke="${SH}" stroke-width="2" stroke-linecap="round" d="M47 19l4 3.5"/>`,
  },
  { // Gem
    body: '<path d="M11 24l9.5-12.5h23L53 24 32 53z"/>',
    over: `<path fill="rgba(255,255,255,.42)" d="M20.5 11.5l5.5 12.5h12l5.5-12.5z"/><path fill="rgba(255,255,255,.18)" d="M11 24l9.5-12.5L26 24z"/><path fill="rgba(0,0,0,.12)" d="M43.5 11.5L53 24H38z"/><path fill="rgba(0,0,0,.12)" d="M11 24h15l6 29z"/><path fill="rgba(255,255,255,.12)" d="M26 24h12l-6 29z"/><path fill="rgba(0,0,0,.3)" d="M38 24h15L32 53z"/><path fill="#fff" d="M50 6l1.2 3.3L54.5 10.5l-3.3 1.2L50 15l-1.2-3.3-3.3-1.2 3.3-1.2z"/>`,
  },
  { // Crown
    body: '<path d="M10 45L6.5 18l13 12L32 12l12.5 18 13-12L54 45z"/><path d="M10 43.5h44v9H10z"/>',
    over: `<path fill="rgba(0,0,0,.25)" d="M10 43.5h44v9H10z"/><circle cx="19" cy="48" r="2.7" fill="#ff5d6b" stroke="rgba(0,0,0,.4)"/><circle cx="32" cy="48" r="3.2" fill="#74c8ff" stroke="rgba(0,0,0,.4)"/><circle cx="45" cy="48" r="2.7" fill="#3edc8f" stroke="rgba(0,0,0,.4)"/><circle cx="6.5" cy="17" r="3" fill="${HI}" stroke="rgba(0,0,0,.35)"/><circle cx="32" cy="11" r="3.4" fill="${HI}" stroke="rgba(0,0,0,.35)"/><circle cx="57.5" cy="17" r="3" fill="${HI}" stroke="rgba(0,0,0,.35)"/><path stroke="${HI}" stroke-width="2" stroke-linecap="round" fill="none" d="M14 39l-2-13 6.5 6"/>`,
  },
  { // Orb
    body: '<circle cx="32" cy="29" r="20"/>',
    under: `<path class="o" fill="${DK}" d="M21 48h22l3.5 8h-29z"/><path fill="${MD}" d="M19 54h26v3H19z"/>`,
    over: `<path fill="rgba(0,0,0,.3)" d="M32 49a20 20 0 0 0 20-20c0-3-.7-6-1.9-8.5A18 18 0 0 1 18 41.5 20 20 0 0 0 32 49z"/><path stroke="rgba(255,255,255,.45)" stroke-width="2" fill="none" stroke-linecap="round" d="M20 31c4-8 14-10 19.5-4.5s2 13.5-6 11.5"/><ellipse cx="25" cy="20" rx="6" ry="3.8" fill="rgba(255,255,255,.55)" transform="rotate(-32 25 20)"/>`,
  },
  { // Sticker
    body: '<rect x="13.5" y="13.5" width="37" height="37" rx="7"/>',
    under: `<path class="o" fill="#eef2f4" d="M19 9h26a10 10 0 0 1 10 10v22L41 55H19A10 10 0 0 1 9 45V19A10 10 0 0 1 19 9z"/>`,
    top: `<path class="o" fill="#cfd6da" d="M41 55l14-14v3c0 6-5 11-11 11z"/>`,
    over: `<path fill="rgba(255,255,255,.88)" stroke="rgba(0,0,0,.35)" d="M32 20.5l3.4 7 7.7 1.1-5.6 5.4 1.3 7.7L32 38.1l-6.8 3.6 1.3-7.7-5.6-5.4 7.7-1.1z"/><path fill="${HI}" d="M20.5 13.5h23a7 7 0 0 1 6.5 4.5H14a7 7 0 0 1 6.5-4.5z"/>`,
  },
  { // Charm
    body: '<path d="M32 57C14 45 9 34 14 26c4-6 12-6 18 1 6-7 14-7 18-1 5 8 0 19-18 31z"/>',
    under: `<circle cx="32" cy="9" r="5" fill="none" stroke="${MT}" stroke-width="2.6"/><path stroke="${MT}" stroke-width="2.6" d="M32 14v6"/><rect class="o" fill="${MT}" x="28" y="19" width="8" height="5" rx="1.5"/>`,
    over: `<path stroke="rgba(255,255,255,.6)" stroke-width="2.8" stroke-linecap="round" fill="none" d="M18.5 29c1.8-3.5 5-4 7.5-2.5"/><path fill="rgba(0,0,0,.22)" d="M32 57c12-8 18-15.5 19.5-22-4 7-10 12.5-19.5 18z"/>`,
  },
  { // Bow
    body: '<path d="M21 4c21 11 21 45 0 56l4.5 2.2c23-13 23-47.5 0-60.4z"/>',
    under: `<path stroke="#e8e2d0" stroke-width="1.2" d="M23 5v54"/>`,
    top: `<rect class="o" fill="${DK}" x="35" y="26" width="7.5" height="12" rx="2"/><path stroke="#d6bd8f" stroke-width="2.2" d="M5 32h46"/><path class="o" fill="${MT}" d="M50.5 28l11 4-11 4z"/><path class="o" fill="#ff5d6b" d="M5 32l-3.5-4.5h6.5l3.5 4.5-3.5 4.5H1.5z"/>`,
    over: `<path stroke="${HI}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M24 6.5c14 8.5 18 22 17 34"/>`,
  },
  { // Hammer
    tf: 'rotate(-28 32 34)',
    body: '<path d="M11 9h42a3.5 3.5 0 0 1 3.5 3.5v13a3.5 3.5 0 0 1-3.5 3.5H11a3.5 3.5 0 0 1-3.5-3.5v-13A3.5 3.5 0 0 1 11 9z"/>',
    under: `<path class="o" fill="#5b3a22" d="M29 27h6v31a3 3 0 0 1-6 0z"/>`,
    top: `<rect class="o" fill="${MT}" x="3.5" y="11" width="5" height="16" rx="1.5"/><rect class="o" fill="${MT}" x="55.5" y="11" width="5" height="16" rx="1.5"/><rect class="o" fill="${MD}" x="27" y="28" width="10" height="5" rx="1.5"/>`,
    over: `<path stroke="${HI}" stroke-width="2.2" stroke-linecap="round" d="M11.5 12.5h41"/><path stroke="rgba(255,255,255,.22)" stroke-width="1.6" d="M29 46h6M29 50h6M29 54h6"/><path fill="${SH}" d="M7.5 22h49v3.5a3.5 3.5 0 0 1-3.5 3.5H11a3.5 3.5 0 0 1-3.5-3.5z"/>`,
  },
];
const PATTERNS = {
  stripes: '<pattern id="ip-stripes" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="2.6" height="7" fill="rgba(255,255,255,.22)"/></pattern>',
  camo: '<pattern id="ip-camo" width="26" height="26" patternUnits="userSpaceOnUse"><path fill="rgba(0,0,0,.3)" d="M2 4c4-3 9 0 8 4s-7 5-9 2-2-4 1-6zM15 14c5-2 10 1 9 5s-6 6-10 4-4-7 1-9z"/><path fill="rgba(255,255,255,.16)" d="M14 2c3-1 6 1 5 3s-5 3-6 1 0-3 1-4zM3 17c3-1 6 2 4 4s-6 2-6 0 1-3 2-4z"/></pattern>',
  spots: '<pattern id="ip-spots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.9" fill="rgba(0,0,0,.25)"/><circle cx="9" cy="8.5" r="1.3" fill="rgba(0,0,0,.2)"/><circle cx="8" cy="2" r=".8" fill="rgba(255,255,255,.3)"/></pattern>',
  pixels: '<pattern id="ip-pixels" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="rgba(255,255,255,.2)"/><rect x="4" y="4" width="4" height="4" fill="rgba(0,0,0,.18)"/></pattern>',
  facets: '<pattern id="ip-facets" width="16" height="16" patternUnits="userSpaceOnUse"><path fill="rgba(255,255,255,.2)" d="M0 0h16L0 16z"/><path fill="rgba(0,0,0,.12)" d="M16 16H0L16 0z"/></pattern>',
  ice: '<pattern id="ip-ice" width="22" height="22" patternUnits="userSpaceOnUse"><path fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".9" d="M2 4l7 5 3 8M9 9l9-2M12 17l7 3M18 7l3-5"/></pattern>',
};
let defsReady = false;
function ensureDefs() {
  if (defsReady || typeof document === 'undefined') return;
  defsReady = true;
  let g = '';
  for (const [name, f] of Object.entries(FIN)) {
    const id = 'if-' + name;
    if (f[0] === 'chrome') g += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#c9d2d9"/><stop offset=".5" stop-color="#5b6874"/><stop offset=".75" stop-color="#9aa6b0"/><stop offset="1" stop-color="#e6ecef"/></linearGradient>`;
    else if (f[0] === 'prism') g += `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${['#ff5d6b', '#ffb347', '#fff35a', '#3edc8f', '#74c8ff', '#b77bff'].map((c, i) => `<stop offset="${i / 5}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    else g += `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f[0]}"/><stop offset="1" stop-color="${f[1]}"/></linearGradient>`;
  }
  g += Object.values(PATTERNS).join('');
  g += ART.map((a, t) => `<clipPath id="ic-${t}">${a.body}</clipPath>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<svg id="itm-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${g}</defs></svg>`);
}
const finOf = it => { const w = it.name.split(' ')[0]; return FIN[w] ? w : 'Titan'; };
function itemArt(it) {
  ensureDefs();
  const t = it.type % ART.length, a = ART[t], f = finOf(it), fin = FIN[f], pat = fin[2];
  const paint = (html, fill, cls) => html.replace(/<(path|rect|circle) /g, `<$1 class="${cls}" fill="${fill}" `);
  const accent = fin[0] === 'chrome' ? '#dfe6ea' : fin[0] === 'prism' ? '#b77bff' : fin[0];
  return `<svg class="ia${pat === 'glow' ? ' glow' : ''}" viewBox="0 0 64 64" style="--fa:${accent}" aria-hidden="true" focusable="false"><g${a.tf ? ` transform="${a.tf}"` : ''}>${a.under || ''}${paint(a.body, `url(#if-${f})`, '')}${pat && pat !== 'glow' ? `<g clip-path="url(#ic-${t})"><rect x="-12" y="-12" width="88" height="88" fill="url(#ip-${pat})"/></g>` : ''}${paint(a.body, 'none', 'o')}${a.top || ''}${a.over || ''}</g></svg>`;
}
// Big numbers get short ("1.4M") so they fit on a tile.
const money = v => (v >= 1e7 ? fmtShort(v) : fmt(v));
const pct = w => (w / 1000).toFixed(w < 1000 ? 2 : 1) + '%';
const itemTile = (it, cls = '', extra = '') => { const sp = it.name.indexOf(' '); return `<div class="itm r${it.rarity} ${cls}" style="--rc:${R.RARITIES[it.rarity].color}">${extra}<span class="itm-ic">${itemArt(it)}</span><b class="itm-v num"><span class="coin xs"></span>${money(it.value)}</b><span class="itm-n"><i>${esc(it.name.slice(0, sp))}</i> ${esc(it.name.slice(sp + 1))}</span></div>`; };

/* Crate art, drawn as SVG. Tier 0 = basic wood bands, 1 = steel with rivets, 2 = gold with a gem, 3 = high roller (black and gold, glowing). */
const TIERS = ['Basic case', 'Steel case', 'Gold case', 'High roller'];
let cxSeq = 0;
const star = (x, y, s) => `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;
function crate(c, cls = '') {
  const t = c.tier || 0, tiny = /\b(sm|xs)\b/.test(cls), id = 'cx' + ++cxSeq;
  const rv = (x, y) => `<circle class="rv" cx="${x}" cy="${y}" r="1.9"/>`;
  let s = '<ellipse class="sh" cx="60" cy="91" rx="47" ry="6"/>';
  if (!tiny) s += '<path class="rays" d="M60 44L28 0h13zM60 44L54 0h12zM60 44L79 0h13zM60 44L2 12l7-9zM60 44L118 12l-7-9z"/>';
  s += '<rect class="bd o" x="14" y="44" width="92" height="44" rx="6"/><path class="bd-sh" d="M14 72h92v10a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z"/>';
  if (t === 0 && !tiny) s += '<path class="pl" d="M16 58h88M16 72h88"/>';
  s += '<rect class="tr o" x="25" y="44" width="10" height="44"/><rect class="tr o" x="85" y="44" width="10" height="44"/>';
  if (t >= 1 && !tiny) s += rv(30, 53) + rv(30, 80) + rv(90, 53) + rv(90, 80);
  s += '<ellipse class="in" cx="60" cy="45" rx="42" ry="5"/>';
  s += '<g class="lid"><path class="ld o" d="M12 46V30Q12 14 30 14H90Q108 14 108 30V46z"/><path class="hl" d="M19 29Q19 20 30 20H90Q101 20 101 29z"/>';
  if (t === 0 && !tiny) s += '<path class="pl" d="M13 33h94"/>';
  s += '<rect class="tr o" x="25" y="14.5" width="10" height="31"/><rect class="tr o" x="85" y="14.5" width="10" height="31"/><rect class="tr o" x="10" y="40" width="100" height="8" rx="3"/>';
  if (t >= 1 && !tiny) s += rv(30, 23) + rv(90, 23);
  if (t >= 2) s += '<path class="gm o" d="M60 18l8 7-8 11-8-11z"/><path class="gm-hl" d="M60 18l-8 7h8z"/>';
  s += '</g><rect class="lk o" x="51" y="37" width="18" height="22" rx="4"/><path class="kh" d="M60 43.5a2.7 2.7 0 0 0-1.3 5.1L58 54h4l-.7-5.4A2.7 2.7 0 0 0 60 43.5z"/>';
  if (t >= 2 && !tiny) s += `<clipPath id="${id}"><path d="M12 46V30Q12 14 30 14H90Q108 14 108 30V46h-2v36a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V46z"/></clipPath><g clip-path="url(#${id})"><rect class="sn" style="animation-delay:-${((c.hue * 7 + String(c.id).length * 13) % 36) / 10}s" x="0" y="0" width="16" height="100"/></g>`;
  if (t === 3 && !tiny) s += `<path class="sp" d="${star(106, 12, 6.5)}"/><path class="sp" style="animation-delay:.9s" d="${star(12, 22, 4.5)}"/><path class="sp" style="animation-delay:1.7s" d="${star(103, 66, 4)}"/>`;
  return `<div class="crate t${t} ${cls}" style="--h:${c.hue}"><svg viewBox="0 0 120 100" aria-hidden="true" focusable="false">${s}</svg></div>`;
}
// Chance of each rarity, as a bar.
function oddsBar(c) {
  const by = R.RARITIES.map((r, i) => ({ r, w: c.items.filter(it => it.rarity === i).reduce((a, it) => a + it.w, 0) }));
  return `<div class="odds"><div class="odds-bar">${by.map(x => `<i style="--rc:${x.r.color};flex:${Math.max(x.w, 2200)}"></i>`).join('')}</div><div class="odds-key">${by.map(x => `<span style="--rc:${x.r.color}"><i></i>${x.r.label} <b class="num">${pct(x.w)}</b></span>`).join('')}</div></div>`;
}
const caseCard = c => `<a class="case-card t${c.tier}" href="#case-${c.id}" style="--h:${c.hue}">${c.tier === 3 ? '<span class="cc-badge">High roller</span>' : ''}${crate(c)}<b>${esc(c.name)}</b><span class="cc-row"><span class="num cc-price"><span class="coin sm"></span>${fmt(c.price)}</span><span class="cc-best" title="Best drop">Top ${fmtShort(c.items[0].value)}</span></span></a>`;
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
    if (range === 'hr') list = list.filter(c => c.tier === 3);
    else if (range !== 'all') { const [lo, hi] = range.split('-').map(Number); list = list.filter(c => c.price / 100 > lo - 1e-9 && c.price / 100 <= hi); }
    list.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'desc' ? (a, b) => b.price - a.price : (a, b) => a.price - b.price);
    $('#case-grid').innerHTML = list.length ? list.map(caseCard).join('') : '<p class="empty">No cases match.</p>';
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
    const best = cur.items[0], rtp = Math.round((cur.items.reduce((a, it) => a + (it.w / 100000) * it.value, 0) / cur.price) * 100);
    const profit = cur.items.filter(it => it.value > cur.price).reduce((a, it) => a + it.w, 0);
    const head = $('#case-head');
    head.className = `case-head t${cur.tier}`;
    head.style.setProperty('--h', cur.hue);
    $('#case-reel').parentElement.style.setProperty('--h', cur.hue);
    head.innerHTML = `${crate(cur)}<div class="ch-info"><span class="ch-tier">${TIERS[cur.tier]}</span><h1>${esc(cur.name)}</h1><div class="ch-stats"><span><small>Price</small><b class="num">${fmt(cur.price)}</b></span><span><small>Top drop</small><b class="num">${money(best.value)}</b></span><span><small>Chance to profit</small><b class="num">${pct(profit)}</b></span><span><small>Returns</small><b class="num">~${rtp}%</b></span></div></div>${oddsBar(cur)}`;
    $('#case-open').textContent = `Open for ${fmt(cur.price)}`;
    $('#case-result').textContent = '';
    $('#case-items').innerHTML = cur.items.map(it => itemTile(it, '', `<span class="itm-p">${pct(it.w)}</span><span class="itm-r">${R.RARITIES[it.rarity].label}</span>`)).join('');
    requestAnimationFrame(() => reel.idle(cur));
  }
  async function open() {
    if (busy || !cur) return;
    if (!S.me) { act('noop'); return; }
    busy = true; $('#case-open').disabled = true; $('#case-result').textContent = '';
    hold(cur.price);
    const r = await act('case.open', { id: cur.id });
    if (!r) { release(); busy = false; $('#case-open').disabled = false; return; }
    const art = $('#case-head .crate');
    if (art) art.classList.add('opening');
    const it = await reel.spin(cur, r.idx, $('#case-fast').checked);
    if (art) art.classList.remove('opening');
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
      return `<div class="free-card t${c.tier} ${locked ? 'locked' : ready ? 'ready' : ''}" style="--h:${c.hue}">${crate(c)}<b>${esc(c.name)}${lvlTag(c.level)}</b><span class="hint"><span>Pays ~${fmtShort(c.price)}</span><span>Best ${fmtShort(c.items[0].value)}</span></span>${btn}</div>`;
    }).join('');
  }
  const mm = ms => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return `Ready in ${m}:${String(s % 60).padStart(2, '0')}`; };
  async function open(i) {
    if (busy) return;
    const c = R.FREE_CASES[i];
    busy = true;
    const box = $('#free-reel-box'); box.hidden = false; box.style.setProperty('--h', c.hue); $('#free-result').textContent = '';
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
  let mode = '1v1', picks = [], pq = '', psort = 'asc';
  const cost = () => picks.reduce((a, id) => a + R.CASES[id].price, 0);
  function init() {
    $('#bm-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; mode = b.dataset.mode; $$('#bm-mode button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); sfx.click(); });
    $('#bm-add').addEventListener('click', () => { $('#picker').hidden = false; renderPicker(); setTimeout(() => $('#picker-q').focus(), 30); });
    $('#bm-clear').addEventListener('click', () => { picks = []; renderMaker(); });
    $('#picker-done').addEventListener('click', () => { $('#picker').hidden = true; });
    $('#picker').addEventListener('click', e => { if (e.target.id === 'picker') $('#picker').hidden = true; });
    $('#picker-q').addEventListener('input', e => { pq = e.target.value.trim().toLowerCase(); renderPicker(); });
    $('#picker-sort').addEventListener('change', e => { psort = e.target.value; renderPicker(); });
    $('#picker-grid').addEventListener('click', e => {
      const b = e.target.closest('[data-pk]'); if (!b) return;
      const id = +b.dataset.pk, d = +b.dataset.d;
      if (d > 0) {
        const room = R.BATTLE_MAX_ROUNDS - picks.length;
        if (room <= 0) { toast(`Battles hold up to ${R.BATTLE_MAX_ROUNDS} cases`, 'bad'); return; }
        for (let k = 0; k < Math.min(d, room); k++) picks.push(id);
        sfx.chip();
      } else { const k = picks.lastIndexOf(id); if (k >= 0) picks.splice(k, 1); }
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
    $('#bm-cases').innerHTML = picks.length ? [...counts].map(([id, n]) => { const c = R.CASES[id]; return `<span class="bm-chip">${crate(c, 'xs')}${esc(c.name)} ×${n} · ${fmt(c.price * n)}<button type="button" data-rm="${id}" aria-label="Remove one ${esc(c.name)}">−</button></span>`; }).join('') : `<span class="hint">Add up to ${R.BATTLE_MAX_ROUNDS} cases. Everyone opens the same cases, one round each.</span>`;
    $('#bm-count').textContent = `${picks.length} / ${R.BATTLE_MAX_ROUNDS}`;
    $('#bm-cost').textContent = fmt(cost());
    $('#bm-create').disabled = !picks.length;
    $('#picker-sum').textContent = `${picks.length} cases · ${fmt(cost())} per player`;
  }
  function renderPicker() {
    const list = R.CASES.filter(c => !pq || c.name.toLowerCase().includes(pq));
    list.sort(psort === 'name' ? (a, b) => a.name.localeCompare(b.name) : psort === 'desc' ? (a, b) => b.price - a.price : (a, b) => a.price - b.price);
    $('#picker-grid').innerHTML = list.map(c => { const n = picks.filter(x => x === c.id).length; return `<div class="pk t${c.tier} ${n ? 'on' : ''}" style="--h:${c.hue}">${crate(c)}<b>${esc(c.name)}</b><span class="num">${fmt(c.price)}</span><div class="pk-ctl"><button type="button" data-pk="${c.id}" data-d="-1" aria-label="Remove one">−</button><span>${n}</span><button type="button" data-pk="${c.id}" data-d="1" aria-label="Add one">+</button><button type="button" class="pk5" data-pk="${c.id}" data-d="5" aria-label="Add five">+5</button></div></div>`; }).join('');
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
  let id = null, b = null, shown = -1, spinning = -1, animating = false, sig = '';
  const view = () => $('#battle-view');
  function onRoute(bid) { id = bid; shown = -1; spinning = -1; sig = ''; b = null; animating = false; view().innerHTML = '<p class="empty">Loading battle…</p>'; if (S.tables.battles) onTable(S.tables.battles); }
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
    } else if (b.state === 'running') { const at = Math.max(spinning, shown); status = at < 0 ? 'Starting…' : `Round ${Math.min(at + 1, b.cases.length)} of ${b.cases.length}`; }
    else { status = 'Finished'; actions = `<button class="btn-go sm" type="button" data-bact="again">Make the same battle</button>`; }
    const h = view().querySelector('.bv-head');
    if (h) h.innerHTML = `<div class="bmode"><b>${R.BATTLE_MODES[b.mode].label}</b>${b.cursed ? '<span class="tag cursed">Cursed · lowest wins</span>' : '<span class="tag">Highest total wins</span>'}</div><span class="grow hint">${status}</span><span class="bcost"><span class="hint">Cost per player</span><span class="num">${fmt(b.cost)}</span></span>${actions}`;
    const rs = view().querySelector('.bv-rounds');
    if (rs) {
      const at = Math.max(0, spinning, shown);
      [...rs.children].forEach((el, k) => { el.classList.toggle('cur', k === at); el.classList.toggle('past', k < at); });
      const cur = rs.querySelector('.cur');
      if (cur) rs.scrollTo({ left: cur.offsetLeft - rs.clientWidth / 2 + cur.offsetWidth / 2, behavior: reduced ? 'auto' : 'smooth' });
    }
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
      el.querySelector('[data-tot]').textContent = money(total(s, shown));
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
      spinning = r;
      header();
      await Promise.all(b.seats.map((s, i) => spinCol(i, c, s.drops[r], D)));
      shown = r; spinning = -1;
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
