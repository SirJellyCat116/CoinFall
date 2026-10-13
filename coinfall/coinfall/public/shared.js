// Coinfall shared rules: payout tables and helpers used by both the server and the browser.
// Money is always in cents (1 coin = 100 cents).

export const CENTS = 100;
export const HOURLY_COINS = 20;
export const DAILY_COINS = 100;
export const WELCOME_COINS = 100;
export const RAIN_MINUTES = 30;
export const RAIN_BASE_COINS = 25;
export const CRASH_K = 0.12; // multiplier = e^(K * seconds)

/* ---------- Roulette (European, single zero) ---------- */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const RED_SET = new Set(REDS);
export const rouletteColor = n => (n === 0 ? 'green' : RED_SET.has(n) ? 'red' : 'black');
export const RL_SPOTS = [
  ...Array.from({ length: 37 }, (_, i) => 'n' + i),
  'red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3',
];
export function rouletteMult(k, n) {
  if (k[0] === 'n') return +k.slice(1) === n ? 36 : 0;
  if (n === 0) return 0;
  switch (k) {
    case 'red': return RED_SET.has(n) ? 2 : 0;
    case 'black': return RED_SET.has(n) ? 0 : 2;
    case 'odd': return n % 2 ? 2 : 0;
    case 'even': return n % 2 ? 0 : 2;
    case 'low': return n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'd1': return n <= 12 ? 3 : 0;
    case 'd2': return n > 12 && n <= 24 ? 3 : 0;
    case 'd3': return n > 24 ? 3 : 0;
    case 'c1': return n % 3 === 1 ? 3 : 0;
    case 'c2': return n % 3 === 2 ? 3 : 0;
    case 'c3': return n % 3 === 0 ? 3 : 0;
  }
  return 0;
}
export const SPOT_LABEL = k => (k[0] === 'n' ? k.slice(1) : ({ red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1–18', high: '19–36', d1: '1st 12', d2: '2nd 12', d3: '3rd 12', c1: 'Col 1', c2: 'Col 2', c3: 'Col 3' }[k] || k));

/* ---------- Mines / Towers ---------- */
export function minesMult(m, k) {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (25 - i) / (25 - m - i);
  return Math.floor(p * 0.99 * 100) / 100;
}
export const TOWERS = {
  easy: { cols: 4, safe: 3, label: 'Easy · 1 bomb in 4' },
  medium: { cols: 3, safe: 2, label: 'Medium · 1 bomb in 3' },
  hard: { cols: 2, safe: 1, label: 'Hard · 1 bomb in 2' },
  expert: { cols: 3, safe: 1, label: 'Expert · 2 bombs in 3' },
};
export const TOWER_LEVELS = 8;
export const towersMult = (d, k) => (k ? Math.floor(0.98 * Math.pow(TOWERS[d].cols / TOWERS[d].safe, k) * 100) / 100 : 0);

/* ---------- Plinko (about 99% RTP) ---------- */
export const PLINKO = {
  8: { low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6], medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13], high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] },
  12: { low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10], medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33], high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170] },
  16: { low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16], medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110], high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000] },
};

/* ---------- Keno: 40 numbers, 10 drawn, pick 1–10 (about 99% RTP) ---------- */
export const KENO = {
  1: [0, 3.96],
  2: [0, 1.9, 4.5],
  3: [0, 1, 3.1, 10.4],
  4: [0, 0.8, 1.8, 5, 22.5],
  5: [0, 0.25, 1.4, 4.1, 16.5, 36],
  6: [0, 0, 1, 3.68, 7, 16.5, 40],
  7: [0, 0, 0.47, 3, 4.5, 14, 31, 60],
  8: [0, 0, 0, 2.2, 4, 13, 22, 55, 70],
  9: [0, 0, 0, 1.55, 3, 8, 15, 44, 60, 85],
  10: [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100],
};

/* ---------- Wheel: 30 segments (98% RTP) ---------- */
function spread(groups) {
  const items = [];
  groups.forEach(([v, n], gi) => { for (let i = 0; i < n; i++) items.push({ v, k: (i + 0.5) / n + gi * 1e-6 }); });
  return items.sort((a, b) => a.k - b.k).map(x => x.v);
}
export const WHEEL = {
  low: spread([[1.2, 17], [0, 7], [1.5, 6]]),
  medium: spread([[0, 15], [1.5, 7], [1.7, 3], [2, 2], [3, 2], [3.8, 1]]),
  high: spread([[0, 29], [29.4, 1]]),
};

/* ---------- Slots: 3 reels, one payline (about 97% RTP) ---------- */
export const SLOTS = {
  symbols: ['cherry', 'lemon', 'grape', 'bell', 'star', 'seven', 'diamond'],
  weights: [7, 6, 5, 4, 3, 2, 1],
  pay3: [7, 10, 15, 25, 50, 100, 250],
  twoCherry: 2,
  oneCherry: 0.5,
};
export function slotsMult(r) {
  if (r[0] === r[1] && r[1] === r[2]) return SLOTS.pay3[r[0]];
  const ch = r.filter(x => x === 0).length;
  return ch === 2 ? SLOTS.twoCherry : ch === 1 ? SLOTS.oneCherry : 0;
}

/* ---------- Cards (Blackjack, Hi-Lo) ---------- */
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const cardVal = c => (c.r === 1 ? 1 : Math.min(10, c.r));
export function bjValue(cards) {
  let t = 0, a = 0;
  for (const c of cards) { t += cardVal(c); if (c.r === 1) a++; }
  let soft = false;
  if (a && t + 10 <= 21) { t += 10; soft = true; }
  return { t, soft };
}
export const isBlackjack = cards => cards.length === 2 && bjValue(cards).t === 21;
// Hi-Lo: "higher or same" / "lower or same" with an infinite deck
export const hiloChance = (r, dir) => (dir === 'hi' ? (14 - r) / 13 : r / 13);

/* ---------- Levels + rakeback ---------- */
// XP is total coins wagered. Reaching level L takes 750 × (L − 1)³ coins of wagers:
// level 2 = 750, level 5 = 48,000, level 10 = 546,750, level 20 = 5.1 million, level 100 = 727 million.
export const MAX_LEVEL = 100;
export const LEVEL_BASE = 750;
export const levelReq = L => (L <= 1 ? 0 : LEVEL_BASE * Math.pow(L - 1, 3) * CENTS);
export function levelOf(wageredCents) {
  let L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Math.cbrt(Math.max(0, wageredCents) / CENTS / LEVEL_BASE)) + 1));
  while (L < MAX_LEVEL && levelReq(L + 1) <= wageredCents) L++;
  while (L > 1 && levelReq(L) > wageredCents) L--;
  return L;
}
// Rakeback: 0.25% of every bet at level 1, +0.05% per level (level 2 = 0.30%, level 3 = 0.35% …).
export const rakePct = L => 0.25 + 0.05 * (L - 1);
export const rakeRate = L => rakePct(L) / 100;

/* ---------- Cases ---------- */
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const RARITIES = [
  { key: 'common', label: 'Common', color: '#5b8def' },
  { key: 'uncommon', label: 'Uncommon', color: '#8a5cf6' },
  { key: 'rare', label: 'Rare', color: '#d946ef' },
  { key: 'epic', label: 'Epic', color: '#ef4444' },
  { key: 'legendary', label: 'Legendary', color: '#f5b83f' },
];
export const ITEM_TYPES = ['Blade', 'Pistol', 'Rifle', 'Gloves', 'Helmet', 'Gem', 'Crown', 'Orb', 'Sticker', 'Charm', 'Bow', 'Hammer'];
const ITEM_ADJ = ['Neon', 'Frost', 'Molten', 'Toxic', 'Glitch', 'Velvet', 'Shadow', 'Royal', 'Lunar', 'Solar', 'Venom', 'Crystal', 'Storm', 'Phantom', 'Gilded', 'Abyssal', 'Blazing', 'Jungle', 'Titan', 'Nova', 'Rusty', 'Chrome', 'Arctic', 'Ember', 'Cobalt', 'Scarlet', 'Midnight', 'Pixel', 'Retro', 'Hyper', 'Static', 'Wild', 'Silent', 'Crimson', 'Ivory', 'Onyx', 'Sapphire', 'Ruby', 'Jade', 'Topaz', 'Plasma', 'Vortex', 'Cosmic', 'Feral', 'Hollow', 'Prism', 'Quartz', 'Rogue', 'Savage', 'Thunder'];
// rarity, item count, chance out of 100000, value range (× case price, before tuning)
const PLAN = [[0, 4, 70000, 0.12, 0.6], [1, 3, 22000, 0.8, 1.7], [2, 2, 6500, 2.5, 6], [3, 1, 1300, 12, 30], [4, 1, 200, 60, 200]];
function makeCase(id, name, price, rtp, seed, hue, extra = {}) {
  const rng = mulberry32(seed);
  const items = [];
  for (const [rar, n, w, lo, hi] of PLAN) {
    const mults = Array.from({ length: n }, () => lo + (hi - lo) * rng()).sort((a, b) => a - b);
    const raw = mults.map((_, i) => n - i + rng() * 0.5);
    const sum = raw.reduce((a, b) => a + b, 0);
    let left = w;
    mults.forEach((m, i) => {
      const wi = i === n - 1 ? left : Math.max(1, Math.round((w * raw[i]) / sum));
      left -= wi;
      items.push({ rarity: rar, mult: m, w: wi, name: ITEM_ADJ[Math.floor(rng() * ITEM_ADJ.length)] + ' ' + ITEM_TYPES[Math.floor(rng() * ITEM_TYPES.length)], type: Math.floor(rng() * ITEM_TYPES.length) });
    });
  }
  const ev = items.reduce((a, it) => a + (it.w / 100000) * it.mult, 0);
  const k = rtp / ev;
  for (const it of items) { it.value = Math.max(1, Math.round(price * it.mult * k)); delete it.mult; }
  items.sort((a, b) => b.value - a.value);
  return { id, name, price, hue, items, ...extra };
}
const nice = c => { const d = Math.pow(10, Math.floor(Math.log10(c)) - 1); return Math.max(1, Math.round(c / d) * d); };
const CASE_PRE = ['Neon', 'Frost', 'Inferno', 'Toxic', 'Cyber', 'Shadow', 'Royal', 'Lunar', 'Solar', 'Venom', 'Crystal', 'Storm', 'Phantom', 'Golden', 'Abyss', 'Blaze', 'Glitch', 'Jungle', 'Titan', 'Nova'];
const CASE_SUF = ['Case', 'Crate', 'Vault', 'Box', 'Chest'];
// 100 cases from 0.25 to 25,000 coins, about 95% returned on average.
export const CASES = (() => {
  const names = [];
  CASE_PRE.forEach((p, pi) => CASE_SUF.forEach(s => names.push([p + ' ' + s, (pi * 37) % 360])));
  const rng = mulberry32(2026);
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  return names.map(([name, hue], i) => makeCase(i, name, nice(25 * Math.pow(100000, i / 99)), 0.95, 1000 + i * 7919, hue));
})();
// Free cases: one of each every hour, unlocked by level. "worth" is the average payout.
export const FREE_CASES = [
  ['Starter', 1, 3], ['Bronze', 2, 6], ['Silver', 3, 12], ['Gold', 5, 25], ['Platinum', 8, 50], ['Emerald', 12, 90],
  ['Diamond', 16, 150], ['Master', 20, 300], ['Grandmaster', 30, 600], ['Legend', 50, 1500], ['Mythic', 75, 4000], ['Crown', 100, 12000],
].map(([nm, lvl, worth], i) => makeCase('f' + i, nm + ' Case', worth * CENTS, 1, 777 + i * 104729, [200, 30, 210, 45, 190, 150, 195, 280, 320, 25, 340, 48][i], { level: lvl, free: true }));
export const FREE_COOLDOWN = 3600e3;
export function rollCase(c, r) { // r: integer 0..99999
  for (let i = 0; i < c.items.length; i++) { if (r < c.items[i].w) return i; r -= c.items[i].w; }
  return c.items.length - 1;
}
export const caseById = id => (typeof id === 'string' && id[0] === 'f' ? FREE_CASES[+id.slice(1)] : CASES[id]);

/* ---------- Case battles ---------- */
export const BATTLE_MODES = {
  '1v1': { seats: 2, teams: null, label: '1v1' },
  '1v1v1': { seats: 3, teams: null, label: '1v1v1' },
  '1v1v1v1': { seats: 4, teams: null, label: '1v1v1v1' },
  '2v2': { seats: 4, teams: [[0, 1], [2, 3]], label: '2v2' },
};
export const BATTLE_MAX_ROUNDS = 25;
export const BATTLE_ROUND_MS = 4600;
export const BOT_NAMES = ['Kayden_07', 'mila.rose', 'TurboTaco', 'xNova', 'Jaxon22', 'sunnyside', 'LilChris', 'GhostPanda', 'ava_plays', 'Brody88', 'NoScopeNate', 'peachyy', 'Zayn_x', 'coolbeans44', 'Harper_J', 'MrWaffles', 'Lunaaa', 'Tyler_W', 'skyy', 'FrostByte', 'emmaaa_', 'Rico99', 'pixelpup', 'Maddox', 'jellyjam', 'Owen.K', 'StormyDays', 'CamCam', 'nightowl3', 'Leo_V', 'Bubbles21', 'Riley_R', 'KingKai', 'zoey.x', 'MangoMike', 'Ethan_P', 'shadowfox', 'Ivy', 'Dash_44', 'Wren'];
