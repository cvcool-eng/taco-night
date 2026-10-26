// =====================================================================
//  TACO NIGHT — an 8-bit taco truck game
//  Everything renders at 320x180 and is scaled up with pixelated edges.
//  Layers:  sky (unlit)  ->  base (lit by the light map)  ->  emit (glow,
//  added on top)  ->  ui (drawn normally over everything).
// =====================================================================

const W = 256, H = 144, HORIZON = 100, N = W * H;
let OY = -30; // camera height (the market interior temporarily uses 0)
const HZ = HORIZON + OY;
const WORLD_W = 1340, HILLS_W = 700;      // the street: your truck, the market, then lots for more trucks
const CAM_TRUCK = 40, CAM_MARKET = 332;  // camera left edge (world x) for each view
let camX = CAM_TRUCK, camTarget = CAM_TRUCK, OX = -CAM_TRUCK;
// The world is drawn at 320x180 coordinates; the camera shows a zoomed-in 256x144
// window onto it, offset by (OX, OY), framed on the truck.
const FPS_ANIM = 8; // the "8-bit" animation frame rate for sprites

const cv = document.getElementById('game');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

function layer(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
const [skyC, sky] = layer();
const [baseC, b] = layer();
const [emitC, e] = layer();
const [uiC, ui] = layer();
const [groundC, gnd] = layer(WORLD_W, 180); // world space
const [hillsC, hills] = layer(HILLS_W, H);
const [truckC, trk] = layer(WORLD_W, 180); // world space: truck, poles and market

const outImg = ctx.createImageData(W, H);
const od = outImg.data;

// light map (lit surfaces) and halo map (glow in the air)
const LR = new Float32Array(N), LG = new Float32Array(N), LB = new Float32Array(N);
const HR = new Float32Array(N), HG = new Float32Array(N), HB = new Float32Array(N);
const AMB_NIGHT = [0.09, 0.11, 0.21]; // moonlight
const AMB_STORE = [0.62, 0.62, 0.66]; // fluorescent store interior
let AMB = AMB_NIGHT;
const VIG = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - W / 2) / (W / 2), dy = (y - H * 0.55) / (H / 2);
  VIG[y * W + x] = Math.max(0.25, 1 - 0.45 * (dx * dx + dy * dy));
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const STEP = 255 / 23; // 24 levels per channel, dithered

// ---------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = Math.random;
const rr = (a, b) => a + rand() * (b - a);
const pick = arr => arr[(rand() * arr.length) | 0];

function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function P(c, x, y, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
function disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.6));
    c.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}
function sprite(c, x, y, rows, pal) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch !== '.' && pal[ch]) P(c, x + i, y + j, pal[ch]);
  }
}

// add a light: target 0 = surface light, 1 = air halo
function light(x, y, rad, r, g, bl, int, sy = 1, halo = false) {
  x += OX; y += OY;
  if (int <= 0.001) return;
  const AR = halo ? HR : LR, AG = halo ? HG : LG, AB = halo ? HB : LB;
  const ry = rad / sy;
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(W - 1, Math.ceil(x + rad));
  const y0 = Math.max(0, Math.floor(y - ry)), y1 = Math.min(H - 1, Math.ceil(y + ry));
  const inv = 1 / rad, r2 = rad * rad;
  for (let yy = y0; yy <= y1; yy++) {
    const dy = (yy - y) * sy, dy2 = dy * dy;
    let i = yy * W + x0;
    for (let xx = x0; xx <= x1; xx++, i++) {
      const dx = xx - x, d2 = dx * dx + dy2;
      if (d2 >= r2) continue;
      let f = 1 - Math.sqrt(d2) * inv;
      f = halo ? f * f * f * int : f * f * int;
      AR[i] += f * r; AG[i] += f * g; AB[i] += f * bl;
    }
  }
}
const glow = (x, y, rad, r, g, bl, int, sy = 1) => light(x, y, rad, r, g, bl, int, sy, true);

// ---------------------------------------------------------------------
//  ingredients + tiny pixel fonts
// ---------------------------------------------------------------------
const ING = {
  asada:   { col: { 1: '#7a4221', 2: '#a5622f', 3: '#4a2410' }, map: ['.11..', '12211', '11131', '13111', '..11.'] },
  pollo:   { col: { 1: '#d9a35c', 2: '#f3cc8a', 3: '#a8a8b2' }, map: ['..11.', '.1221', '.1111', '.31..', '3....'] }, // drumstick with a gray bone
  queso:   { col: { 1: '#ffd23a', 2: '#fff09a', 3: '#c9921a' }, map: ['....1', '...11', '..131', '.1121', '13111'] },
  salsa:   { col: { 1: '#d6281e', 2: '#ff8a6a', 3: '#3a9a2a' }, map: ['..3..', '.111.', '12111', '11111', '.111.'] },
  lechuga: { col: { 1: '#4caa3a', 2: '#8ae06a', 3: '#2a6a1e' }, map: ['1.2.1', '12121', '.313.', '11211', '.131.'] },
};
const MEATS = ['asada', 'pollo'], TOPS = ['queso', 'salsa', 'lechuga'];
const ORDER = ['asada', 'pollo', 'queso', 'salsa', 'lechuga'];
function drawIcon(c, id, x, y) { sprite(c, x, y, ING[id].map, ING[id].col); }

const FONT3 = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
  '$': ['011', '110', '010', '011', '110'], '+': ['000', '010', '111', '010', '000'],
  '!': ['010', '010', '010', '000', '010'], '?': ['111', '001', '011', '000', '010'],
  'X': ['101', '101', '010', '101', '101'], '♪': ['011', '011', '010', '110', '110'],
  ':': ['000', '010', '000', '010', '000'], 'Z': ['111', '001', '010', '100', '111'],
};
function text3(c, str, x, y, col, outline = '#000') {
  const w = str.length * 4 - 1;
  let cx = Math.round(x - w / 2);
  for (const ch of str) {
    const g = FONT3[ch];
    if (g) {
      if (outline) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1')
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P(c, cx + i + ox, y + j + oy, outline);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') P(c, cx + i, y + j, col);
    }
    cx += 4;
  }
}
const SIGN_FONT = {
  T: ['11111', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '11111', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '01111'],
  O: ['01110', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '01110', '00001', '11110'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  R: ['11110', '10001', '11110', '10100', '10011'],
  K: ['10001', '10010', '11100', '10010', '10001'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  P: ['11110', '10001', '11110', '10000', '10000'],
  N: ['10001', '11001', '10101', '10011', '10001'],
  X: ['10001', '01010', '00100', '01010', '10001'],
  I: ['11111', '00100', '00100', '00100', '11111'],
};
// draw a word in the 5x5 sign font; scale 2 gives chunky neon letters
function signText(c, str, x, y, scale, col, hi) {
  let cx = x;
  for (const ch of str) {
    const g = SIGN_FONT[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '1') {
      R(c, cx + i * scale, y + j * scale, scale, scale, col);
      if (hi) P(c, cx + i * scale, y + j * scale, hi);
    }
    cx += 6 * scale;
  }
}

// ---------------------------------------------------------------------
//  static scenery (built once)
// ---------------------------------------------------------------------
function buildGround() {
  const r = mulberry(11);
  const img = gnd.createImageData(WORLD_W, 180), d = img.data;
  for (let y = HORIZON; y < 180; y++) {
    const t = (y - HORIZON) / (180 - HORIZON);
    const depth = 0.25 + 0.75 * Math.pow(t, 0.7);
    for (let x = 0; x < WORLD_W; x++) {
      const n = r();
      const m = 0.88 + 0.12 * Math.sin(x * 0.07 + y * 0.31) * Math.sin(x * 0.021 - y * 0.13);
      const k = depth * m * (0.8 + 0.35 * n);
      const p = (y * WORLD_W + x) * 4;
      d[p] = 112 * k; d[p + 1] = 104 * k; d[p + 2] = 96 * k; d[p + 3] = 255;
    }
  }
  // pebbles: tiny far away, chunkier up close
  for (let k = 0; k < 4000; k++) {
    const t = Math.pow(r(), 0.75), y = Math.floor(HORIZON + 2 + t * (180 - HORIZON - 3));
    const x = Math.floor(r() * WORLD_W);
    const depth = 0.25 + 0.75 * Math.pow((y - HORIZON) / (180 - HORIZON), 0.7);
    const size = t < 0.35 ? 1 : (r() < 0.55 ? 1 : 2);
    const tint = r();
    const base = tint < 0.08 ? [150, 110, 90] : tint < 0.14 ? [110, 120, 135] : [150, 142, 130];
    const br = depth * (0.75 + 0.45 * r());
    for (let j = 0; j < size; j++) for (let i = 0; i < size + (size > 1 ? 1 : 0); i++) {
      const px = x + i, py = y + j;
      if (px >= WORLD_W || py >= 180) continue;
      const p = (py * WORLD_W + px) * 4;
      const hl = j === 0 ? 1.15 : 1;
      d[p] = base[0] * br * hl; d[p + 1] = base[1] * br * hl; d[p + 2] = base[2] * br * hl;
    }
    const sp = ((y + size) * WORLD_W + x) * 4;
    if (y + size < 180) { d[sp] *= 0.45; d[sp + 1] *= 0.45; d[sp + 2] *= 0.45; }
  }
  // weeds along the horizon
  for (let x = 0; x < WORLD_W; x += 1) {
    if (r() < 0.35) {
      const h = 1 + Math.floor(r() * 3);
      for (let j = 0; j < h; j++) {
        const p = ((HORIZON + 1 - j) * WORLD_W + x) * 4;
        d[p] = 22; d[p + 1] = 34; d[p + 2] = 26; d[p + 3] = 255;
      }
    }
  }
  gnd.putImageData(img, 0, 0);
  // soft shadow under the truck and poles (world space)
  gnd.fillStyle = 'rgba(0,0,0,0.5)';
  for (let y = 126; y < 148; y++) {
    const t = (y - 137) / 11, w = Math.sqrt(Math.max(0, 1 - t * t)) * 112;
    gnd.fillRect(168 - w, y, w * 2, 1);
  }
  gnd.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 128; y < 143; y++) gnd.fillRect(70, y, 200, 1);
  for (const px of [17, 302]) { gnd.fillRect(px - 4, 146, 10, 1); gnd.fillRect(px - 2, 147, 7, 1); }
}

function buildHills() {
  const HORIZON = HZ;
  const r = mulberry(5);
  // far ridge
  let h = 12;
  for (let x = 0; x < HILLS_W; x++) {
    h += (r() - 0.5) * 1.6; h = Math.max(6, Math.min(18, h));
    R(hills, x, HORIZON - h, 1, h, '#0e1228');
  }
  // town lights on the far ridge
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * HILLS_W), y = HORIZON - 3 - Math.floor(r() * 6);
    P(hills, x, y, pick(['#ffcf7a', '#ffb060', '#c8d8ff', '#ffe6a8']));
  }
  // near tree line
  for (let x = 0; x < HILLS_W; x++) {
    const tree = Math.max(0, Math.sin(x * 0.19) * 3 + Math.sin(x * 0.53 + 1) * 2 + Math.sin(x * 1.7) * 1.2);
    const hh = 3 + Math.floor(tree + r() * 1.5);
    R(hills, x, HORIZON - hh, 1, hh, '#070915');
  }
}

function buildTruck() {
  const c = trk;
  // sign posts + sign board
  R(c, 120, 46, 2, 5, '#3a3a40'); R(c, 172, 46, 2, 5, '#3a3a40');
  R(c, 110, 31, 74, 16, '#24151f'); R(c, 110, 31, 74, 1, '#4a3040'); R(c, 110, 46, 74, 1, '#120a10');
  R(c, 110, 31, 1, 16, '#4a3040'); R(c, 183, 31, 1, 16, '#120a10');
  // roof vent
  R(c, 82, 45, 14, 5, '#8d939b'); R(c, 82, 45, 14, 1, '#c3c8cf'); R(c, 84, 47, 10, 1, '#5c6168');
  // cargo box
  R(c, 72, 50, 152, 80, '#e4d4b2');
  R(c, 72, 50, 152, 2, '#f6ecd4');
  R(c, 72, 126, 152, 4, '#bfae8c');
  R(c, 72, 52, 1, 76, '#f0e4c8'); R(c, 223, 52, 1, 76, '#bfae8c');
  for (const sx of [86, 206]) R(c, sx, 52, 1, 60, '#d3c3a0');
  // cab
  R(c, 224, 72, 38, 49, '#e4d4b2'); R(c, 226, 70, 30, 2, '#e4d4b2'); R(c, 226, 70, 30, 1, '#f6ecd4');
  R(c, 256, 72, 2, 2, '#e4d4b2'); R(c, 258, 74, 4, 2, '#e4d4b2');
  R(c, 262, 90, 5, 31, '#d6c5a2'); R(c, 262, 90, 5, 1, '#efe2c4');
  R(c, 230, 77, 26, 19, '#7d828a'); R(c, 231, 78, 24, 17, '#1b2738');
  for (let i = 0; i < 6; i++) { P(c, 236 + i, 92 - i * 2, '#3b5470'); P(c, 237 + i, 92 - i * 2, '#3b5470'); }
  for (let i = 0; i < 4; i++) P(c, 246 + i, 90 - i * 2, '#304660');
  R(c, 228, 97, 1, 22, '#b3a282'); R(c, 246, 102, 5, 1, '#6d6f75');
  R(c, 228, 80, 2, 4, '#6d6f75'); // mirror
  R(c, 262, 103, 4, 5, '#d8d0b0'); // headlight housing
  // stripe + skirt (box and cab)
  R(c, 72, 113, 195, 5, '#c8362a'); R(c, 72, 113, 195, 1, '#e65a46'); R(c, 72, 118, 195, 2, '#8e2219');
  R(c, 72, 120, 195, 8, '#2c2a2e'); R(c, 72, 120, 195, 1, '#45434a');
  R(c, 259, 120, 9, 5, '#9aa0a8'); R(c, 259, 120, 9, 1, '#d0d4da'); // bumper
  // chalk menu board on the body, left of the window
  R(c, 75, 70, 21, 30, '#6b4a2a'); R(c, 76, 71, 19, 28, '#1d2a22');
  drawIcon(c, 'asada', 78, 74); drawIcon(c, 'pollo', 78, 81); drawIcon(c, 'queso', 78, 88);
  for (const yy of [76, 83, 90]) R(c, 85, yy, 8, 1, '#a9bcae');
  R(c, 78, 95, 15, 1, '#e0c070');
  // the serving window
  R(c, 98, 66, 96, 40, '#9aa0a8'); R(c, 98, 66, 96, 1, '#d0d4da');
  R(c, 100, 68, 92, 34, '#6a4430');
  for (let y = 84; y < 102; y += 4) R(c, 100, y, 92, 1, '#5a3826');
  for (let y = 84; y < 102; y += 4) for (let x = 100 + ((y / 4) % 2) * 3; x < 192; x += 6) R(c, x, y, 1, 4, '#5a3826');
  R(c, 100, 68, 92, 2, '#3a2418'); // shadow under awning
  // shelf with bottles + hanging tools (left)
  R(c, 102, 83, 28, 1, '#3a2618'); R(c, 102, 84, 28, 1, '#24170e');
  [['#2e8b57', 104], ['#c0392b', 108], ['#e1b12c', 112], ['#c0392b', 116], ['#d9d0b8', 121], ['#2e8b57', 125]]
    .forEach(([col, x]) => { R(c, x, 78, 3, 5, col); R(c, x + 1, 76, 1, 2, col); P(c, x, 79, '#ffffff55'); });
  R(c, 104, 72, 20, 1, '#8d939b');
  for (const x of [107, 113, 119]) { R(c, x, 72, 1, 3, '#8d939b'); R(c, x - 1, 75, 3, 2, '#b7bcc3'); }
  // grill hood + grill (right)
  R(c, 164, 70, 26, 5, '#7b8088'); R(c, 164, 70, 26, 1, '#a0a5ad'); R(c, 166, 75, 22, 1, '#5c6168');
  R(c, 164, 93, 26, 9, '#2b2b30'); R(c, 164, 93, 26, 1, '#5a5a62');
  // awning (red / cream stripes with scallops)
  for (let x = 94; x < 198; x++) {
    const s = Math.floor((x - 94) / 6) % 2, col = s ? '#efe6d6' : '#c8362a', sh = s ? '#c9bfae' : '#8e2219';
    R(c, x, 57, 1, 9, col); P(c, x, 57, sh);
    const k = (x - 94) % 6;
    if (k >= 1 && k <= 4) P(c, x, 66, col);
    if (k >= 2 && k <= 3) P(c, x, 67, col);
  }
  R(c, 94, 56, 104, 1, '#5c1610');
  // wheels
  for (const wx of [102, 240]) {
    disc(c, wx, 128, 12, '#141416');
    disc(c, wx, 131, 9, '#1c1c20');
    disc(c, wx, 131, 5, '#8a9099');
    disc(c, wx, 131, 2, '#c5cad1');
    P(c, wx - 3, 129, '#b0b5bd');
  }
}

function buildScenery() {
  // wooden light poles
  for (const px of [16, 301]) {
    R(trk, px, 42, 3, 105, '#4f3622'); R(trk, px, 42, 1, 105, '#6e4c30');
    R(trk, px - 3, 44, 9, 2, '#4f3622');
  }
  // sandwich board, on the left
  const bx = 46;
  R(trk, bx + 2, 138, 2, 22, '#5b3e26'); R(trk, bx + 18, 138, 2, 22, '#5b3e26');
  R(trk, bx, 136, 22, 18, '#6b4a2a'); R(trk, bx + 1, 137, 20, 16, '#1d2a22');
  drawIcon(trk, 'asada', bx + 3, 140);
  text3(trk, '$3', bx + 15, 140, '#e8efe6', null);
  R(trk, bx + 3, 148, 16, 1, '#a9bcae'); R(trk, bx + 3, 150, 11, 1, '#a9bcae');
}

// The corner market, further down the street (world space).
const MKT = { x: 384, y: 58, w: 156, h: 86 };
function buildMarket() {
  const c = trk, { x, y, w } = MKT, bot = y + MKT.h;
  // sidewalk
  R(c, x - 12, bot - 2, w + 24, 8, '#4a4a50'); R(c, x - 12, bot - 2, w + 24, 1, '#6a6a72');
  for (let sx = x - 12; sx < x + w + 12; sx += 16) R(c, sx, bot - 1, 1, 7, '#38383e');
  // walls, roof, sign band, stripes
  R(c, x, y + 8, w, MKT.h - 10, '#d8d2c4'); R(c, x, y + 8, w, 1, '#ece6d8');
  R(c, x - 2, y, w + 4, 8, '#2e3038'); R(c, x - 2, y, w + 4, 1, '#4a4c56');
  R(c, x + 4, y + 10, w - 8, 15, '#141c2c'); R(c, x + 4, y + 10, w - 8, 1, '#2a3550');
  R(c, x, y + 27, w, 3, '#e8b830'); R(c, x, y + 30, w, 2, '#2a5aa8');
  // windows with shelves of goods inside, and the glass door
  for (const wx of [x + 6, x + 96]) {
    R(c, wx - 1, y + 35, 56, 41, '#7a808a'); R(c, wx, y + 36, 54, 39, '#1a2430');
    for (const sy of [y + 48, y + 60, y + 72]) {
      R(c, wx + 2, sy, 50, 1, '#4a5260');
      for (let px = wx + 3; px < wx + 50; px += 4) R(c, px, sy - 5, 3, 5, pick(['#d6281e', '#ffd23a', '#4caa3a', '#3a6ea5', '#e8e0d0', '#a5622f']));
    }
  }
  R(c, x + 65, y + 37, 26, bot - y - 39, '#7a808a'); R(c, x + 66, y + 38, 24, bot - y - 40, '#22303c');
  R(c, x + 77, y + 38, 1, bot - y - 40, '#7a808a'); R(c, x + 73, y + 62, 2, 6, '#c0c4ca'); R(c, x + 80, y + 62, 2, 6, '#c0c4ca');
  // ice chest + trash can
  R(c, x + 128, bot - 14, 24, 12, '#3a6ea5'); R(c, x + 128, bot - 14, 24, 2, '#6a9ad0');
  R(c, x - 9, bot - 12, 7, 10, '#3a4a3a'); R(c, x - 10, bot - 13, 9, 2, '#4a5a4a');
}

// ---------------------------------------------------------------------
//  world objects
// ---------------------------------------------------------------------
const stars = [];
{
  const r = mulberry(3);
  for (let i = 0; i < 90; i++) stars.push({
    x: Math.floor(r() * W), y: Math.floor(r() * (HZ - 10)),
    b: 0.3 + r() * 0.7, s: 0.5 + r() * 3, p: r() * 6.28, big: r() < 0.06,
  });
}
const clouds = [];
for (let i = 0; i < 5; i++) clouds.push({ x: rr(0, W), y: rr(8, 60), w: rr(30, 70), v: rr(1, 3) });

// string lights: [ax, ay, bx, by, sag]
const STRINGS = [[18, 43, 73, 51, 9], [73, 51, 223, 51, 15], [223, 51, 302, 43, 10]];
const BULB_COLS = [[1, 0.82, 0.5], [1, 0.82, 0.5], [1, 0.6, 0.3], [1, 0.82, 0.5], [1, 0.45, 0.6], [1, 0.82, 0.5], [0.5, 0.9, 0.8]];
const bulbs = [];
STRINGS.forEach((s, si) => {
  const len = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(2, Math.floor(len / 9));
  for (let i = 1; i < n; i++) bulbs.push({
    s: si, t: i / n, col: BULB_COLS[bulbs.length % BULB_COLS.length],
    ph: rand() * 6.28, bad: rand() < 0.06, x: 0, y: 0, f: 1,
  });
});
function stringPoint(s, t, time, si) {
  const sway = Math.sin(time * 1.3 + si * 1.7) * 1.6;
  const k = 4 * t * (1 - t);
  return [s[0] + (s[2] - s[0]) * t + sway * k * 0.4, s[1] + (s[3] - s[1]) * t + (s[4] + sway) * k];
}

// papel picado flags hanging under the middle string
const FLAG_COLS = ['#ff5fa2', '#ffd23a', '#3ac0d6', '#7ad65a', '#ff8a3c', '#b07aff'];

const fireflies = [];
for (let i = 0; i < 24; i++) fireflies.push({
  x: rr(0, WORLD_W), y: rr(HORIZON + 2, 178), vx: 0, vy: 0, ph: rand() * 6.28, sp: rr(0.8, 1.8),
});
const moths = [];
for (let i = 0; i < 6; i++) moths.push({ b: (rand() * 30) | 0, a: rand() * 6.28, r: rr(3, 8), sp: rr(3, 7) });

let parts = []; // generic particles

function addPart(o) { parts.push(Object.assign({ life: 1, max: 1, vx: 0, vy: 0, g: 0, size: 1 }, o)); }

// ---------------------------------------------------------------------
//  game state
// ---------------------------------------------------------------------
const SLOTS = [146, 118, 92, 66];
const FEET = 162;
const SHIRTS = ['#3a6ea5', '#2f8f5b', '#a5473a', '#7d5ba6', '#c79a2b', '#3a9aa5', '#d0d0d0', '#b0526e'];
const PANTS = ['#2b3550', '#3b3b40', '#4a3a2a', '#25303a'];
const SKIN = ['#f1c27d', '#e0a77a', '#c68642', '#8d5524', '#ffdbac'];
const HAIR = ['#2a1a10', '#5a3a1a', '#111111', '#b08040', '#7a2a1a', '#d8d8d8'];

// money and ingredient stock carry over between page reloads (saved in this browser)
const SAVE_KEY = 'tacoNight.money', STOCK_KEY = 'tacoNight.stock';
const PACK_SIZE = 10, PACK_PRICE = 4, MISS_PENALTY = 5, STARTING_STOCK = 20;
function loadMoney() {
  try { return Math.max(0, parseInt(localStorage.getItem(SAVE_KEY), 10) || 0); } catch (err) { return 0; }
}
function loadStock() {
  const stock = Object.fromEntries(ORDER.map(id => [id, STARTING_STOCK])); // new players start with 20 of everything
  try {
    const saved = JSON.parse(localStorage.getItem(STOCK_KEY) || 'null');
    if (saved) for (const id of ORDER) if (Number.isFinite(saved[id])) stock[id] = Math.max(0, saved[id]);
  } catch (err) { /* ignore a bad save */ }
  return stock;
}
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, String(G.money));
    localStorage.setItem(STOCK_KEY, JSON.stringify(G.stock));
  } catch (err) { /* storage blocked: progress just won't persist */ }
}

const G = {
  running: false, paused: false, scene: 'street', time: 0,
  money: loadMoney(), stock: loadStock(), served: 0,
  taco: [], customers: [], spawnT: 1.5, flying: null,
};

// chef animation state
const chef = {
  pose: 'idle',  // idle | cook | serve | cheer | shrug
  poseT: 0,
  idle: 'stand', // stand | tap | wipe | whistle | look
  idleT: 3,
  look: 0,       // -1 left, 0 center, 1 right
  lookT: 2,
  blinkT: 3,
};
function setPose(p, dur) { chef.pose = p; chef.poseT = dur; }

// ---- business: extra trucks, cooks and a store runner ----
const TRUCK_SPOTS = [0, 560, 800, 1040]; // world x offset of each truck (yours is first)
const COOK_PRICE = 100, RUNNER_PRICE = 100, TRUCK_PRICE = 250;
const COOK_TIME = 7;                    // seconds a hired cook takes per taco
const WORK_TIME = 60, BREAK_TIME = 120; // workers work a minute, then take a 2-minute break
const BIZ_KEY = 'tacoNight.business';
const RUNNER_HOME = 278, STORE_DOOR = 462; // Leo hangs out by the right side of your truck

// The people you can hire. Cooks work a truck window; the runner shops for you.
const WORKERS = [
  { id: 'maria', name: 'MARIA', job: 'cook', girl: true, hair: '#2a1a10', skin: '#c68642', cap: '#e05a8a', apron: '#e05a8a' },
  { id: 'sofia', name: 'SOFIA', job: 'cook', girl: true, hair: '#c8742a', skin: '#f1c27d', cap: '#8a4ac8', apron: '#8a4ac8' },
  { id: 'diego', name: 'DIEGO', job: 'cook', girl: false, hair: '#111111', skin: '#8d5524', cap: '#2a5aa8', apron: '#2a5aa8' },
  { id: 'lucia', name: 'LUCIA', job: 'cook', girl: true, hair: '#111111', skin: '#e0a77a', cap: '#2aa8a0', apron: '#2aa8a0' },
  { id: 'carlos', name: 'CARLOS', job: 'cook', girl: false, hair: '#4a2a14', skin: '#c68642', cap: '#c83a2a', apron: '#c83a2a' },
  { id: 'ana', name: 'ANA', job: 'cook', girl: true, hair: '#e8c060', skin: '#ffdbac', cap: '#3a9a3a', apron: '#3a9a3a' },
  { id: 'mateo', name: 'MATEO', job: 'cook', girl: false, hair: '#2a1a10', skin: '#f1c27d', cap: '#5a5a6a', apron: '#5a5a6a' },
  { id: 'elena', name: 'ELENA', job: 'cook', girl: true, hair: '#5a1a1a', skin: '#8d5524', cap: '#d8a020', apron: '#d8a020' },
  { id: 'leo', name: 'LEO', job: 'runner', girl: false, hair: '#5a3a1a', skin: '#e0a77a', cap: '#ff8a20', apron: '#ff8a20' },
];
const COOKS = WORKERS.filter(w => w.job === 'cook');
const RUNNER = WORKERS.find(w => w.job === 'runner');
const workerById = id => WORKERS.find(w => w.id === id) || null;

function makeChef() { return { pose: 'idle', poseT: 0, idle: 'stand', idleT: rr(1, 4), look: 0, lookT: 2, blinkT: rr(1, 4) }; }
function makeTruck(i) { return { i, off: TRUCK_SPOTS[i], chef: i === 0 ? chef : makeChef(), spawnT: rr(1.5, 5) }; }
G.trucks = [makeTruck(0)];

// Hired cooks. Each one works at a truck: in your truck they bustle around
// behind you; in another truck the first cook takes the window.
G.staff = Object.fromEntries(COOKS.map(w => [w.id, {
  id: w.id, w, truck: null, onBreak: false, shiftT: WORK_TIME, cooking: null, noStock: false,
  chef: makeChef(), x: 146, goal: 146, dir: 1, waitT: rr(1, 3),
}]));
const staffAt = i => COOKS.map(w => G.staff[w.id]).filter(s => s.truck === i);
const truckOf = id => { const s = G.staff[id]; return s && s.truck !== null ? G.trucks[s.truck] : null; };
function hireCook(id, truck) {
  Object.assign(G.staff[id], { truck, onBreak: false, shiftT: WORK_TIME, cooking: null, x: 146, goal: 146 });
}

G.runner = {
  hired: false, auto: false, order: Object.fromEntries(ORDER.map(id => [id, 0])),
  state: 'idle', x: RUNNER_HOME, dir: -1, walkT: 0, t: 0, lookT: 3, carrying: null, msg: '',
  onBreak: false, shiftT: WORK_TIME,
  // Leo's looks: an orange cap and shirt so you can spot him
  shirt: RUNNER.cap, pants: '#2b3550', skin: RUNNER.skin, hair: RUNNER.hair, hat: RUNNER.cap, stache: false,
  patience: 1, maxPatience: 1, shake: 0, mood: 'ok', bob: 0,
};
function loadBusiness() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(BIZ_KEY) || 'null'); } catch (err) { s = null; }
  if (!s) return;
  const n = Math.min(TRUCK_SPOTS.length, Math.max(1, s.trucks | 0));
  G.trucks = [];
  for (let i = 0; i < n; i++) G.trucks.push(makeTruck(i));
  if (s.staff) {
    for (const id in s.staff) if (G.staff[id] && s.staff[id] !== null && s.staff[id] < n) hireCook(id, s.staff[id]);
  } else if (s.cooks) { // older saves stored one cook per truck
    const free = COOKS.map(w => w.id);
    s.cooks.forEach((c, i) => {
      const id = c === true ? free[0] : c;
      if (i < n && free.includes(id)) { hireCook(id, i); free.splice(free.indexOf(id), 1); }
    });
  }
  G.runner.hired = !!s.runner; G.runner.auto = !!s.auto;
  if (s.order) for (const id of ORDER) G.runner.order[id] = Math.max(0, Math.min(9, s.order[id] | 0));
}
function saveBusiness() {
  try {
    localStorage.setItem(BIZ_KEY, JSON.stringify({
      trucks: G.trucks.length, staff: Object.fromEntries(COOKS.map(w => [w.id, G.staff[w.id].truck])),
      runner: G.runner.hired, auto: G.runner.auto, order: G.runner.order,
    }));
  } catch (err) { /* storage blocked */ }
}

// Random orders: any meat, any mix of toppings (sometimes none, sometimes
// double meat), and never the same taco as one of the last few customers.
const recentOrders = [];
function newOrder() {
  let order, key;
  for (let tries = 0; tries < 30; tries++) {
    const meats = rand() < 0.2 ? MEATS.slice() : [pick(MEATS)];
    const tops = TOPS.filter(() => rand() < 0.5);
    order = [...meats, ...tops];
    key = order.slice().sort().join();
    if (!recentOrders.includes(key)) break;
  }
  recentOrders.push(key);
  if (recentOrders.length > 4) recentOrders.shift();
  return order;
}
function spawnCustomer(ti = 0) {
  const patience = Math.max(13, 26 - G.served * 0.6);
  const tr = G.trucks[ti], startX = ti === 0 ? -12 : tr.off + 330;
  G.customers.push({
    truck: ti, x: startX, target: startX, state: 'walk', dir: ti === 0 ? 1 : -1, walkT: 0,
    order: newOrder(), patience, maxPatience: patience,
    shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), hair: pick(HAIR),
    hat: rand() < 0.45 ? pick(['#2a4a8a', '#3a9a3a', '#e0e0e0', '#3a3a3a', '#d8a020']) : null,
    stache: rand() < 0.35,
    tall: rand() < 0.5 ? 0 : 1, mood: 'ok', shake: 0, bob: rand() * 6,
  });
}
function queue(ti = 0) { return G.customers.filter(c => c.truck === ti && c.state !== 'leave'); }
function front(ti = 0) { const q = queue(ti); return q[0] && q[0].state === 'wait' ? q[0] : null; }

// ---------------------------------------------------------------------
//  sound (tiny WebAudio square-wave bleeps)
// ---------------------------------------------------------------------
let AC = null;
function audio() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (err) { AC = null; }
}
function tone(f, d, type = 'square', v = 0.05, slide = 0, delay = 0) {
  if (!AC) return;
  const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
}
function hiss(d, v = 0.05, hp = 2500) {
  if (!AC) return;
  const len = Math.floor(AC.sampleRate * d), buf = AC.createBuffer(1, len, AC.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v;
  src.connect(f).connect(g).connect(AC.destination); src.start();
}
const sfx = {
  add: () => { tone(520, 0.06, 'square', 0.04); tone(780, 0.06, 'square', 0.03, 0, 0.05); hiss(0.25, 0.03); },
  trash: () => tone(300, 0.2, 'square', 0.04, -200),
  good: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.09, 'square', 0.04, 0, i * 0.07)),
  bad: () => { tone(220, 0.15, 'square', 0.05); tone(160, 0.25, 'square', 0.05, 0, 0.12); },
  angry: () => tone(200, 0.4, 'sawtooth', 0.04, -120),
  bell: () => { tone(1500, 0.3, 'triangle', 0.05); tone(1500, 0.3, 'triangle', 0.04, 0, 0.12); },
  cricket: () => { for (let i = 0; i < 3; i++) tone(4300, 0.03, 'triangle', 0.008, 0, i * 0.06); },
  whistle: () => [880, 990, 1175].forEach((f, i) => tone(f, 0.12, 'sine', 0.02, 0, i * 0.14)),
};

// ---------------------------------------------------------------------
//  actions
// ---------------------------------------------------------------------
function canPlay() { return G.running && !G.paused && G.scene === 'street'; }
// you work whichever truck the camera is closest to (so you can cover for cooks on break)
function playerTruck() {
  const center = camX + W / 2;
  let best = G.trucks[0];
  for (const tr of G.trucks) if (Math.abs(tr.off + 146 - center) < Math.abs(best.off + 146 - center)) best = tr;
  return best;
}

function addIngredient(id) {
  if (!canPlay() || G.flying) return;
  const i = G.taco.indexOf(id);
  if (i >= 0) G.taco.splice(i, 1);
  else if (G.stock[id] <= 0) { outOfStock(id); return; }
  else G.taco.push(id);
  setPose('cook', 0.45);
  sfx.add();
  for (let k = 0; k < 6; k++) addPart({ type: 'ember', x: rr(168, 186), y: 93, vx: rr(-8, 8), vy: rr(-35, -15), life: rr(0.4, 0.9), max: 0.9 });
  for (let k = 0; k < 3; k++) addPart({ type: 'steam', x: rr(168, 186), y: 92, vx: rr(-3, 3), vy: rr(-12, -6), life: 1.6, max: 1.6, size: 1 });
  refreshButtons();
}
function outOfStock(id) {
  sfx.trash();
  const btn = document.querySelector(`button.ing[data-ing="${id}"]`);
  if (btn) { btn.classList.remove('empty-flash'); void btn.offsetWidth; btn.classList.add('empty-flash'); }
  flashHint('OUT OF ' + id.toUpperCase() + '! BUY MORE AT THE MARKET');
}
function trashTaco() {
  if (!canPlay() || !G.taco.length) return;
  G.taco = [];
  sfx.trash();
  setPose('shrug', 0.5);
  refreshButtons();
}
function serve() {
  if (!canPlay() || G.flying) return;
  const tr = playerTruck(), c = front(tr.i);
  if (!c || !G.taco.length) { sfx.trash(); return; }
  G.flying = { items: G.taco.slice(), t: 0, c, from: tr.off };
  for (const id of G.taco) G.stock[id] = Math.max(0, G.stock[id] - 1); // serving uses up the ingredients
  G.taco = [];
  saveGame();
  setPose('serve', 0.5);
  refreshButtons();
}
// a happy customer pays (base price + toppings + a tip for being quick)
function payCustomer(c, st) {
  const tip = Math.ceil((c.patience / c.maxPatience) * 3);
  const pay = 2 + c.order.length + tip;
  G.money += pay; G.served++;
  saveGame();
  c.mood = 'happy'; c.state = 'leave'; c.dir = 1;
  if (onScreen(c.x)) { sfx.good(); setTimeout(() => sfx.bell(), 250); }
  setPoseOf(st, 'cheer', 0.9);
  addPart({ type: 'text', str: '+$' + pay, x: c.x, y: FEET - 50, vy: -10, life: 1.4, max: 1.4, col: '#ffd84a' });
  for (let k = 0; k < 14; k++) addPart({ type: 'coin', x: c.x + rr(-3, 3), y: FEET - 28, vx: rr(-30, 30), vy: rr(-70, -35), g: 140, life: rr(0.8, 1.3), max: 1.3 });
  for (let k = 0; k < 4; k++) addPart({ type: 'heart', x: c.x + rr(-6, 6), y: FEET - 26, vx: rr(-4, 4), vy: rr(-18, -10), life: 1.4, max: 1.4 });
  updateHud();
}
function onScreen(wx) { return wx > camX - 20 && wx < camX + W + 20; }
function setPoseOf(st, p, dur) { st.pose = p; st.poseT = dur; }

function resolveServe(f) {
  const c = f.c;
  const want = c.order.slice().sort().join(), got = f.items.slice().sort().join();
  if (want === got) {
    payCustomer(c, chef);
  } else {
    c.patience -= c.maxPatience * 0.3; c.shake = 0.4; c.mood = 'mad';
    sfx.bad(); setPose('shrug', 0.8);
    addPart({ type: 'text', str: '?', x: c.x, y: FEET - 50, vy: -8, life: 1, max: 1, col: '#ff5a4a' });
  }
  updateHud();
}
// a customer gave up waiting: they walk off and it costs you
function customerLeftAngry(c) {
  c.state = 'leave'; c.dir = 1; c.mood = 'mad';
  G.money = Math.max(0, G.money - MISS_PENALTY);
  saveGame();
  sfx.angry();
  addPart({ type: 'text', str: '-$' + MISS_PENALTY, x: c.x, y: FEET - 50, vy: -8, life: 1.4, max: 1.4, col: '#ff3a3a' });
  for (let k = 0; k < 8; k++) addPart({ type: 'puff', x: c.x + rr(-4, 4), y: FEET - 26, vx: rr(-10, 10), vy: rr(-15, -5), life: 0.8, max: 0.8 });
  updateHud();
}

// ---------------------------------------------------------------------
//  update
// ---------------------------------------------------------------------
let cricketT = 2;
function update(dt) {
  if (G.paused || G.menu) return; // everything freezes while paused or in a menu
  G.time += dt;
  const t = G.time;

  // --- camera glides toward where the player scrolled
  camX += (camTarget - camX) * Math.min(1, dt * 8);
  if (Math.abs(camTarget - camX) < 0.3) camX = camTarget;
  OX = -Math.round(camX);
  updateNavButtons();

  // --- customers, cooks and the runner (all frozen while you're inside the market)
  const live = G.running && G.scene === 'street';
  if (live) {
    G.trucks.forEach((tr, i) => {
      if (i > 0 && !staffAt(i).length) return; // an extra truck only opens once it has a cook
      tr.spawnT -= dt;
      if (tr.spawnT <= 0 && queue(i).length < 2) {
        spawnCustomer(i);
        tr.spawnT = Math.max(5.5, 10.5 - G.served * 0.25) * rr(0.85, 1.15); // a customer every ~10s, down to ~5.5s
      }
      queue(i).forEach((c, k) => { c.target = tr.off + SLOTS[k]; });
    });
    for (const c of G.customers) {
      c.shake = Math.max(0, c.shake - dt);
      if (c.state === 'leave') {
        c.x += 34 * dt; c.walkT += dt; c.dir = 1;
        continue;
      }
      const first = queue(c.truck)[0];
      const dx = c.target - c.x;
      if (Math.abs(dx) > 0.6) {
        c.x += Math.sign(dx) * Math.min(Math.abs(dx), 30 * dt);
        c.walkT += dt; c.dir = Math.sign(dx); c.state = 'walk';
      } else {
        c.x = c.target;
        const wasWalking = c.state === 'walk';
        c.state = 'wait';
        if (wasWalking && c === first && onScreen(c.x)) sfx.bell();
      }
      if (c.state === 'wait') {
        c.patience -= dt * (c === first ? 1 : 0.35);
        if (c.patience <= 0) customerLeftAngry(c);
      }
    }
    G.customers = G.customers.filter(c => c.x < WORLD_W + 20);
    updateCooks(dt);
    updateRunner(dt);
  }

  // --- flying taco
  if (live && G.flying) {
    G.flying.t += dt / 0.35;
    if (G.flying.t >= 1) { const f = G.flying; G.flying = null; resolveServe(f); }
  }

  // --- chef animation brains (you, plus any hired cooks)
  for (const tr of G.trucks) animChef(tr.chef, dt, tr);

  // --- ambient particles
  for (const { off: o } of G.trucks) {
  if (rand() < dt * 6) addPart({ type: 'smoke', x: o + rr(84, 94), y: 44, vx: rr(2, 6), vy: rr(-10, -6), life: rr(2.5, 4), max: 4, size: 1 });
  if (rand() < dt * 3) addPart({ type: 'steam', x: o + rr(168, 186), y: 92, vx: rr(-2, 2), vy: rr(-9, -5), life: 1.8, max: 1.8, size: 1 });
  if (rand() < dt * 2.5) addPart({ type: 'ember', x: o + rr(166, 188), y: 93, vx: rr(-5, 5), vy: rr(-25, -10), life: rr(0.4, 0.9), max: 0.9 });
  }
  if (rand() < dt * 4) addPart({ type: 'dust', x: rr(90, 210), y: rr(100, 170), vx: rr(-2, 2), vy: rr(-2, 1), life: rr(3, 6), max: 6 });
  if (rand() < dt * 0.25) addPart({ type: 'spark', x: rr(114, 180), y: rr(34, 44), life: 0.3, max: 0.3 });
  if (rand() < dt * 0.05) addPart({ type: 'shoot', x: rr(60, 300), y: rr(5, 30), vx: -90, vy: 30, life: 0.6, max: 0.6 });

  for (const p of parts) {
    p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'smoke') { p.size = 1 + (1 - p.life / p.max) * 4; p.vx += 4 * dt; }
    if (p.type === 'steam' && p.y < 70) p.life -= dt * 3;
    if (p.type === 'dust') p.vx += Math.sin(t + p.y) * dt;
    if (p.type === 'coin' && p.y > FEET) { p.y = FEET; p.vy *= -0.4; p.vx *= 0.6; }
  }
  parts = parts.filter(p => p.life > 0);

  for (const f of fireflies) {
    f.vx += rr(-20, 20) * dt; f.vy += rr(-20, 20) * dt;
    f.vx *= 0.97; f.vy *= 0.97;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.x < 0) f.x += WORLD_W; if (f.x > WORLD_W) f.x -= WORLD_W;
    if (f.y < HORIZON - 10) f.vy += 6 * dt; if (f.y > 180) f.vy -= 6 * dt;
  }
  for (const m of moths) m.a += m.sp * dt * (0.6 + 0.4 * Math.sin(t * 7 + m.r));
  for (const c of clouds) { c.x += c.v * dt; if (c.x - c.w > W) c.x = -c.w; }

  if (live) {
    cricketT -= dt;
    if (cricketT <= 0) { sfx.cricket(); cricketT = rr(1.5, 5); }
  }
}


function animChef(st, dt, tr) {
  if (st.poseT > 0) { st.poseT -= dt; if (st.poseT <= 0) st.pose = 'idle'; }
  st.idleT -= dt;
  if (st.idleT <= 0) {
    st.idle = pick(['stand', 'stand', 'tap', 'wipe', 'whistle', 'look']);
    st.idleT = rr(2.5, 5);
    if (st.idle === 'whistle' && st === chef && G.running && G.scene === 'street' && onScreen(146)) sfx.whistle();
  }
  st.lookT -= dt;
  if (st.lookT <= 0) {
    st.look = front(tr.i) ? 0 : pick([-1, 0, 0, 1]);
    st.lookT = rr(1, 3);
  }
  st.blinkT -= dt;
  if (st.blinkT < -0.12) st.blinkT = rr(2, 5);
  if (st.idle === 'whistle' && st.pose === 'idle' && rand() < dt * 1.5)
    addPart({ type: 'note', x: tr.off + 152, y: 80, vx: rr(4, 10), vy: -10, life: 1.4, max: 1.4 });
}

// Workers' shifts: a minute of work, then a 2-minute break. A break only
// starts once they've finished what they're doing (canStop).
function tickShift(w, dt, canStop) {
  w.shiftT -= dt;
  if (w.shiftT > 0) return;
  if (!w.onBreak && !canStop) { w.shiftT = 0; return; }
  w.onBreak = !w.onBreak;
  w.shiftT = w.onBreak ? BREAK_TIME : WORK_TIME;
}

// Hired cooks serve customers at their truck by themselves, as long as
// there's stock for the whole order and they aren't on break. In your truck
// they shuffle around behind you between the shelf and the grill.
function updateCooks(dt) {
  for (const w of COOKS) {
    const s = G.staff[w.id];
    if (s.truck === null) continue;
    const tr = G.trucks[s.truck];
    tickShift(s, dt, !s.cooking);
    animChef(s.chef, dt, tr);

    // the first cook in an extra truck takes the window; everyone else walks around inside
    const atWindow = s.truck > 0 && staffAt(s.truck)[0] === s;
    if (atWindow) s.x = s.goal = 146;
    else if (Math.abs(s.goal - s.x) > 0.5) { s.dir = Math.sign(s.goal - s.x); s.x += s.dir * Math.min(Math.abs(s.goal - s.x), 22 * dt); }
    else if (!s.cooking && (s.waitT -= dt) <= 0) { s.goal = pick([112, 124, 160, 176, 182]); s.waitT = rr(1.5, 4); }

    if (s.cooking) {
      if (!atWindow) s.goal = 176; // at the grill
      s.cooking.t += dt;
      if (Math.floor(s.cooking.t * 3) !== Math.floor((s.cooking.t - dt) * 3))
        addPart({ type: 'ember', x: tr.off + rr(168, 186), y: 93, vx: rr(-5, 5), vy: rr(-30, -12), life: 0.7, max: 0.7 });
      if (s.cooking.t >= COOK_TIME) {
        const c = s.cooking.c;
        s.cooking = null;
        c.claimed = null;
        if (c.state === 'wait') payCustomer(c, s.chef);
      }
      continue;
    }
    s.noStock = false;
    if (s.onBreak) continue;
    // take the first waiting customer nobody is already cooking for
    const c = queue(s.truck).find(c => c.state === 'wait' && !c.claimed && c.patience < c.maxPatience - 1.5);
    if (!c) continue;
    if (c.order.every(id => G.stock[id] > 0)) {
      for (const id of c.order) G.stock[id]--;
      saveGame(); refreshButtons();
      c.claimed = w.id;
      s.cooking = { c, items: c.order.slice(), t: 0 };
      setPoseOf(s.chef, 'cook', COOK_TIME);
    } else s.noStock = true;
  }
}

// The runner walks to the market, buys the packs you asked for with your
// money, and walks back to stock the trucks.
function runnerPacks() { return ORDER.reduce((n, id) => n + G.runner.order[id], 0); }
function sendRunner() {
  const r = G.runner;
  if (!r.hired) return 'Hire a runner first';
  if (r.onBreak) return 'Leo is on break. Try again soon';
  if (r.state !== 'idle') return 'The runner is already on a trip';
  if (!runnerPacks()) return 'Pick what to buy first';
  r.state = 'toStore'; r.msg = 'Heading to the market';
  return 'Runner is on the way!';
}
function updateRunner(dt) {
  const r = G.runner;
  if (!r.hired) return;
  const speed = 42;
  if (r.state === 'idle' && (r.lookT -= dt) <= 0) { r.dir = pick([-1, -1, 1]); r.lookT = rr(2, 5); } // chilling, glancing around
  if (r.state === 'idle' && r.auto && runnerPacks() && ORDER.some(id => r.order[id] > 0 && G.stock[id] < 5)) sendRunner();
  if (r.state === 'toStore') {
    r.x += speed * dt; r.walkT += dt; r.dir = 1;
    if (r.x >= STORE_DOOR) { r.state = 'shopping'; r.t = 1.5; r.msg = 'Shopping...'; }
  } else if (r.state === 'shopping') {
    r.t -= dt;
    if (r.t <= 0) {
      r.carrying = {};
      let bought = 0;
      for (const id of ORDER) {
        const packs = Math.min(r.order[id], Math.floor(G.money / PACK_PRICE));
        if (packs <= 0) continue;
        G.money -= packs * PACK_PRICE;
        r.carrying[id] = packs * PACK_SIZE;
        bought += packs;
      }
      saveGame(); updateHud();
      r.msg = bought ? `Bought ${bought} pack${bought > 1 ? 's' : ''}, coming back` : 'Not enough money! Coming back';
      r.state = 'back';
    }
  } else if (r.state === 'back') {
    r.x -= speed * dt; r.walkT += dt; r.dir = -1;
    if (r.x <= RUNNER_HOME) {
      r.x = RUNNER_HOME; r.dir = -1; r.state = 'idle';
      for (const id in r.carrying) {
        G.stock[id] += r.carrying[id];
        addPart({ type: 'icon', id, x: r.x + rr(-6, 6), y: FEET - 40, vy: -12, life: 1.4, max: 1.4 });
      }
      r.carrying = null;
      r.msg = 'Delivered! Waiting for orders';
      // a fresh list for next time (auto-restock keeps it, since that's what it reorders)
      if (!r.auto) { for (const id of ORDER) r.order[id] = 0; saveBusiness(); renderLeoIfOpen(); }
      saveGame(); refreshButtons();
      if (onScreen(r.x)) sfx.bell();
    }
  }
  refreshBusinessLive();
}
// ---------------------------------------------------------------------
//  drawing
// ---------------------------------------------------------------------
function drawSky(t) {
  const HORIZON = HZ;
  for (let y = 0; y < HORIZON; y++) {
    const k = y / HORIZON;
    sky.fillStyle = `rgb(${4 + 22 * k * k | 0},${6 + 24 * k * k | 0},${16 + 48 * k * k | 0})`;
    sky.fillRect(0, y, W, 1);
  }
  sky.clearRect(0, HORIZON, W, H - HORIZON);
  for (const s of stars) {
    const tw = s.b * (0.55 + 0.45 * Math.sin(t * s.s + s.p));
    const v = 120 + 135 * tw | 0;
    P(sky, s.x, s.y, `rgb(${v},${v},${Math.min(255, v + 30)})`);
    if (s.big && tw > 0.6) {
      const c2 = `rgba(${v},${v},255,0.5)`;
      P(sky, s.x - 1, s.y, c2); P(sky, s.x + 1, s.y, c2); P(sky, s.x, s.y - 1, c2); P(sky, s.x, s.y + 1, c2);
    }
  }
  // moon
  disc(sky, 44, 22, 8, '#f2ecd0');
  P(sky, 41, 19, '#d6cfb0'); R(sky, 46, 23, 2, 2, '#d6cfb0'); P(sky, 43, 26, '#d6cfb0'); R(sky, 40, 23, 1, 2, '#e0d9bb');
  // clouds
  for (const c of clouds) {
    sky.fillStyle = 'rgba(46,54,96,0.35)';
    sky.fillRect(c.x | 0, c.y | 0, c.w | 0, 2);
    sky.fillRect(c.x + c.w * 0.15 | 0, c.y - 2 | 0, c.w * 0.5 | 0, 2);
    sky.fillRect(c.x + c.w * 0.3 | 0, c.y + 2 | 0, c.w * 0.6 | 0, 1);
  }
  sky.drawImage(hillsC, -Math.round((camX - CAM_TRUCK) * 0.35), 0); // hills drift slower than the street
}

function drawTaco(c, cx, by, items) {
  // shell (a little half-moon), fillings on top
  R(c, cx - 7, by - 3, 14, 1, '#f3cc6a');
  R(c, cx - 6, by - 2, 12, 1, '#e8b545');
  R(c, cx - 5, by - 1, 10, 1, '#d9a23a');
  R(c, cx - 3, by, 6, 1, '#b07a22');
  P(c, cx - 7, by - 3, '#b07a22'); P(c, cx + 6, by - 3, '#b07a22');
  P(c, cx - 2, by - 2, '#c48a2a'); P(c, cx + 3, by - 1, '#c48a2a');
  const has = id => items.includes(id);
  for (const m of MEATS) if (has(m)) {
    const col = ING[m].col;
    for (let i = -6; i <= 5; i++) P(c, cx + i, by - 4, (i & 1) ? col[1] : col[3]);
    for (const i of [-4, -1, 2, 4]) P(c, cx + i, by - 5, col[2]);
  }
  if (has('salsa')) for (const [i, j] of [[-5, 4], [-2, 5], [1, 4], [3, 5], [5, 4]]) P(c, cx + i, by - j, '#e0301e');
  if (has('queso')) for (const [i, j] of [[-6, 5], [-3, 5], [0, 6], [2, 5], [4, 6]]) P(c, cx + i, by - j, '#ffe04a');
  if (has('lechuga')) for (const [i, j] of [[-5, 6], [-1, 6], [1, 7], [3, 6], [6, 5], [-4, 7]]) P(c, cx + i, by - j, '#6ad04a');
}

// ---------------------------------------------------------------------
//  Characters: chunky NES-era sprites, 16 px wide. Everyone shares the same
//  proportions: an 11-row head (hat/hair, 1x2 eyes) on an 11-row torso,
//  so the chef and customers match.
// ---------------------------------------------------------------------

// Chef, facing the camera: red cap, big nose, mustache and a full beard,
// red apron over a black shirt. His legs are hidden behind the counter.
const CHEF_PAL = {
  R: '#d82818', D: '#8a1008', Y: '#fcd000', B: '#4a2400', S: '#d88a58',
  N: '#b06030', K: '#181820', A: '#d82818', c: '#2c2c38',
};
const CHEF_HEAD = [
  '.....RRRRRR.....',
  '....RRRYYRRRR...',
  '...RRRRRRRRRR...',
  '..DDDDDDDDDDDD..',
  '...BSSSSSSSSB...',
  '..BBSSSSSSSSBB..',
  '..BSSSSSSSSSSB..',
  '..BBSSNNNNSSBB..',
  '..BBBBBBBBBBBB..',
  '...BBBBBBBBBB...',
  '....BBBBBBBB....',
];
// the beard spills over the top of his shirt
const CHEF_BEARD = [
  '.....BBBBBB.....',
  '......BBBB......',
];
// torso without arms (arms are animated separately)
const CHEF_BODY = [
  '...KKKKKKKKKK...',
  '....KAKKKKAK....',
  '....KAAAAAAK....',
  '....cAAAAAAc....',
  '....cAAYYAAc....',
  '....cAAAAAAc....',
  '....cAAAAAAc....',
  '....cDDDDDDc....',
  '....cAAAAAAc....',
  '....AAAAAAAA....',
  '....AAAAAAAA....',
];

// Hired workers share the chef's body but have their own face: no beard,
// their own hair, skin and cap color, and long hair for the girls.
const WORKER_HEAD = [
  '.....CCCCCC.....',
  '....CCCCCCCC....',
  '...CCCCCCCCCC...',
  '..DDDDDDDDDDDD..',
  '...HSSSSSSSSH...',
  '..HHSSSSSSSSHH..',
  '..HSSSSSSSSSSH..',
  '...SSSSNNSSSS...',
  '...SSSSSSSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
];
function workerPal(w) {
  return w.pal || (w.pal = {
    C: w.cap, D: shade(w.cap), H: w.hair, B: w.hair, S: w.skin, N: shade(w.skin),
    K: '#181820', A: w.apron, Y: w.apron, c: '#2c2c38', // plain apron, no patch
  });
}
function drawWorkerHead(c, w, sx0, y0, hatHop = 0, look = 0, eyes = 'open', mouth = 'smile') {
  const pal = workerPal(w);
  if (w.girl) { R(c, sx0 + 2, y0 + 5, 2, 13, w.hair); R(c, sx0 + 12, y0 + 5, 2, 13, w.hair); } // long hair past the shoulders
  sprite(c, sx0, y0 + 4, WORKER_HEAD.slice(4), pal);
  sprite(c, sx0, y0 - hatHop, WORKER_HEAD.slice(0, 4), pal); // cap and brim hop together
  const ex1 = sx0 + 6 + look, ex2 = sx0 + 9 + look;
  if (eyes === 'open') { R(c, ex1, y0 + 5, 1, 2, '#000'); R(c, ex2, y0 + 5, 1, 2, '#000'); }
  else if (eyes === 'closed') { R(c, ex1 - 1, y0 + 6, 2, 1, w.hair); R(c, ex2, y0 + 6, 2, 1, w.hair); }
  else for (const ex of [ex1, ex2]) { P(c, ex - 1, y0 + 6, '#000'); P(c, ex, y0 + 5, '#000'); P(c, ex + 1, y0 + 6, '#000'); }
  const MC = w.girl ? '#c83a5a' : '#6a2018';
  if (mouth === 'smile') { R(c, sx0 + 7, y0 + 9, 2, 1, MC); P(c, sx0 + 6, y0 + 8, MC); P(c, sx0 + 9, y0 + 8, MC); }
  if (mouth === 'open') { R(c, sx0 + 6, y0 + 8, 4, 2, MC); R(c, sx0 + 7, y0 + 8, 2, 1, '#f0f0f0'); }
  if (mouth === 'frown') { R(c, sx0 + 7, y0 + 8, 2, 1, MC); P(c, sx0 + 6, y0 + 9, MC); P(c, sx0 + 9, y0 + 9, MC); }
  if (mouth === 'o') R(c, sx0 + 7, y0 + 8, 2, 2, MC);
}

// a little portrait for the business panel
const portraitCache = {};
function portraitURL(w) {
  if (portraitCache[w.id]) return portraitCache[w.id];
  const pc = document.createElement('canvas'); pc.width = 20; pc.height = 20;
  const g = pc.getContext('2d');
  R(g, 0, 0, 20, 20, '#2a1a24'); R(g, 0, 14, 20, 6, '#3a2430');
  sprite(g, 2, 14, CHEF_BODY.slice(0, 6), workerPal(w));
  R(g, 2, 15, 3, 5, '#181820'); R(g, 15, 15, 3, 5, '#181820'); // shoulders
  drawWorkerHead(g, w, 2, 2);
  return (portraitCache[w.id] = pc.toDataURL());
}

function drawChef(c, t, st = chef, pal = CHEF_PAL, wk = null) {
  if (wk) pal = workerPal(wk);
  const x = 146;
  const frame = Math.floor(t * FPS_ANIM);
  const { S, K, B } = pal;

  // breathing: 2-frame idle stance, body rises every half second
  const breathe = Math.floor(t * 2) % 2;
  let lean = 0, armL = 'down', armR = 'down', mouth = 'none', eyes = 'open', hatHop = 0;
  let look = st.look;

  switch (st.pose) {
    case 'cook': armR = (frame % 2) ? 'grill' : 'grill2'; look = 1; break;
    case 'serve': armL = 'out'; armR = 'out'; lean = 1; break;
    case 'cheer': armL = (frame % 2) ? 'up' : 'up2'; armR = (frame % 2) ? 'up2' : 'up'; mouth = 'open'; eyes = 'happy'; hatHop = frame % 2; break;
    case 'shrug': armL = 'shrug'; armR = 'shrug'; mouth = 'frown'; break;
    default:
      switch (st.idle) {
        case 'tap': armR = (frame % 2) ? 'tap' : 'down'; break;
        case 'wipe': armL = ['wipe0', 'wipe1', 'wipe2', 'wipe1'][frame % 4]; look = 0; break;
        case 'whistle': mouth = 'o'; look = Math.floor(t * 1.5) % 2 ? 1 : -1; break;
        case 'look': look = Math.floor(t * 1.2) % 3 - 1; break;
      }
  }
  if (st.blinkT < 0 && eyes === 'open') eyes = 'closed';

  const y0 = 80 + (breathe ? 0 : 1) + lean, sx0 = x - 8, yb = y0 + 11;

  sprite(c, sx0, yb, CHEF_BODY, pal);
  if (wk) drawWorkerHead(c, wk, sx0, y0, hatHop, look, eyes, mouth === 'none' ? 'smile' : mouth);
  else drawChefHead();
  function drawChefHead() {
  sprite(c, sx0, y0 + 3, CHEF_HEAD.slice(3), pal);
  sprite(c, sx0, y0 - hatHop, CHEF_HEAD.slice(0, 3), pal); // cap hops when he cheers
  sprite(c, sx0, yb, CHEF_BEARD, pal);

  // eyes: 1x2 black; they slide to look around
  const ex1 = sx0 + 6 + look, ex2 = sx0 + 9 + look;
  if (eyes === 'open') { R(c, ex1, y0 + 5, 1, 2, '#000'); R(c, ex2, y0 + 5, 1, 2, '#000'); }
  else if (eyes === 'closed') { R(c, ex1 - 1, y0 + 6, 2, 1, B); R(c, ex2, y0 + 6, 2, 1, B); }
  else for (const ex of [ex1, ex2]) { P(c, ex - 1, y0 + 6, '#000'); P(c, ex, y0 + 5, '#000'); P(c, ex + 1, y0 + 6, '#000'); }

  // mouth, peeking out of the beard under the mustache
  if (mouth === 'open') { R(c, sx0 + 6, y0 + 9, 4, 2, '#5a0808'); R(c, sx0 + 6, y0 + 9, 4, 1, '#f0f0f0'); }
  if (mouth === 'frown') R(c, sx0 + 6, y0 + 10, 4, 1, '#2a0804');
  if (mouth === 'o') R(c, sx0 + 8, y0 + 9, 2, 2, '#5a0808');
  }

  // arms: 3 px sleeves with 3 px hands, same as the customers'
  const arm = (o, kind) => {
    const sx = o < 0 ? x - 7 : x + 4;
    switch (kind) {
      case 'down': R(c, sx, yb + 1, 3, 7, K); R(c, sx, yb + 8, 3, 2, S); break;
      case 'tap': R(c, sx, yb + 1, 3, 5, K); R(c, sx, yb + 6, 3, 2, S); break;
      case 'grill':
      case 'grill2': {
        const up = kind === 'grill' ? -1 : 1;
        R(c, sx, yb + 2, 8, 3, K); R(c, sx + 8, yb + 2, 3, 3, S);
        R(c, sx + 11, yb + 3, 3, 1, '#b7bcc3'); R(c, sx + 14, yb + 3 + up, 4, 1, '#e0e4ea');
        break;
      }
      case 'out': R(c, sx, yb + 1, 3, 5, K); R(c, sx - o * 2, yb + 5, 3, 3, K); R(c, sx - o * 2, yb + 8, 3, 2, S); break;
      case 'up': R(c, sx + o, yb - 8, 3, 9, K); R(c, sx + o, yb - 11, 3, 3, S); break;
      case 'up2': R(c, sx + o * 2, yb - 6, 3, 7, K); R(c, sx + o * 2, yb - 9, 3, 3, S); break;
      case 'shrug': R(c, sx + o, yb, 3, 4, K); R(c, sx + o * 2, yb - 3, 3, 4, K); R(c, sx + o * 2, yb - 6, 3, 3, S); break;
      default: { // wipe0..2: rag sweeps across the counter
        const k = +kind.slice(4), hx = sx + 3 + k * 3;
        R(c, sx, yb + 1, 3, 6, K); R(c, sx, yb + 6, hx - sx, 3, K);
        R(c, hx, yb + 6, 3, 3, S); R(c, hx - 1, yb + 9, 6, 1, '#3cbcfc');
      }
    }
  };
  arm(-1, armL); arm(1, armR);
}

// Customers: 16x32. T = cap (or hair), U = cap brim, H = hair, S = skin,
// E = eye, N = nose shade, M = mustache (or skin), C = shirt, c = shirt shade,
// P = pants, K = shoes. Side view faces right; mirrored for left.
const CUST_HEAD_SIDE = [
  '.....TTTTTT.....',
  '....TTTTTTTTT...',
  '...TTTTTTTTTTUU.',
  '...HHHSSSSES....',
  '..HHSHSSSSESSS..',
  '..HSSHSSSSSSSSS.',
  '..HSSHHSSSSNNSSS',
  '..HHSSSSSSMMMMM.',
  '...HSSSSSSSSSS..',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
];
const CUST_HEAD_BACK = [
  '.....TTTTTT.....',
  '....TTTTTTTT....',
  '...TTTTTTTTTT...',
  '...HHHHHHHHHH...',
  '..SHHHHHHHHHHS..',
  '..SHHHHHHHHHHS..',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '....HHHHHHHH....',
  '.....SSSSSS.....',
  '.....SSSSSS.....',
];
const CUST_BODY = [
  '...CCCCCCCCCC...',
  '..CCCCCCCCCCCC..',
  '.CCCCCCCCCCCCCC.',
  '.CCCcCCCCCCcCCC.',
  '.CCCcCCCCCCcCCC.',
  '.CCCcCCCCCCcCCC.',
  '.CCCcCCCCCCcCCC.',
  '.CCCcCCCCCCcCCC.',
  '.SSScCCCCCCcSSS.',
  '.SSSPPPPPPPPSSS.',
  '....PPPPPPPP....',
];
const CUST_LEGS = {
  stand: [
    '....PPPPPPPP....', '....PPPPPPPP....', '....PPP..PPP....', '....PPP..PPP....', '....PPP..PPP....',
    '....PPP..PPP....', '....PPP..PPP....', '....PPP..PPP....', '..KKKKK..KKKKK..', '..KKKKK..KKKKK..',
  ],
  tap: [
    '....PPPPPPPP....', '....PPPPPPPP....', '....PPP..PPP....', '....PPP..PPP....', '....PPP..PPP....',
    '....PPP..PPP....', '....PPP..PPP....', '....PPP..KKKKK..', '..KKKKK..KKKKK..', '..KKKKK.........',
  ],
  walk1: [
    '....PPPPPPPP....', '...PPPPPPPPPP...', '..PPPP....PPPP..', '..PPP......PPP..', '.PPP........PPP.',
    '.PPP........PPP.', 'PPP..........PPP', 'PPP..........PPP', 'KKKK.......KKKKK', 'KKKK.......KKKKK',
  ],
  walk2: [
    '....PPPPPPPP....', '....PPPPPPPP....', '.....PPPPPP.....', '.....PPPPPP.....', '......PPPP......',
    '......PPPP......', '......PPPP......', '......PPPP......', '.....KKKKKKK....', '.....KKKKKKK....',
  ],
};
const shade = hex => '#' + hex.slice(1).match(/../g).map(h => Math.round(parseInt(h, 16) * 0.65).toString(16).padStart(2, '0')).join('');

function customerX(c, t) {
  return Math.round(c.x) + (c.shake > 0 ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0);
}
function drawCustomer(g, c, t) {
  const x = customerX(c, t), fy = FEET;
  const side = c.state !== 'wait'; // side view unless ordering at a window
  const walking = c.state === 'walk' || c.state === 'leave';
  const f = Math.floor(c.walkT * FPS_ANIM) % 2; // 2-frame NES walk cycle
  let legs = 'stand';
  if (walking) legs = f ? 'walk2' : 'walk1';
  else if (c.state === 'wait' && c.patience / c.maxPatience < 0.35 && Math.floor(t * 4) % 2) legs = 'tap'; // impatient foot tap
  const rows = [...(side ? CUST_HEAD_SIDE : CUST_HEAD_BACK), ...CUST_BODY, ...CUST_LEGS[legs]];
  const flip = side && c.dir < 0;
  const pal = {
    T: c.hat || c.hair, U: c.hat, H: c.hair, S: c.skin, E: '#000000', N: shade(c.skin),
    M: c.stache ? c.hair : c.skin, C: c.shirt, c: shade(c.shirt), P: c.pants, K: '#2a1608',
  };
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - 7, fy, 14, 1); g.fillRect(x - 5, fy + 1, 10, 1);
  // Mario-style bounce on the passing frame
  const bob = walking && f ? -1 : 0;
  sprite(g, x - 8, fy - 32 + bob, flip ? rows.map(r => [...r].reverse().join('')) : rows, pal);
  if (side && c.mood === 'happy') R(g, flip ? x - 6 : x + 4, fy - 32 + bob + 9, 2, 1, '#5a0808');
}

function drawBubble(c, t) {
  const n = c.order.length, w = n * 7 + 3, h = 9;
  const bx = Math.round(c.x - w / 2), by = FEET - 52 + (Math.floor(t * 2) % 2);
  ui.fillStyle = '#1a0f14';
  ui.fillRect(bx - 1, by, w + 2, h); ui.fillRect(bx, by - 1, w, h + 2);
  ui.fillStyle = '#f4ead8';
  ui.fillRect(bx, by, w, h);
  R(ui, Math.round(c.x) - 1, by + h, 3, 1, '#f4ead8'); P(ui, Math.round(c.x), by + h + 1, '#f4ead8');
  c.order.forEach((id, i) => drawIcon(ui, id, bx + 2 + i * 7, by + 2));
  // patience bar
  const k = Math.max(0, c.patience / c.maxPatience);
  R(ui, bx, by + h + 3, w, 2, '#1a0f14');
  R(ui, bx, by + h + 3, Math.round(w * k), 2, k > 0.5 ? '#6ad04a' : k > 0.25 ? '#ffd23a' : (Math.floor(t * 6) % 2 ? '#ff3a3a' : '#a01010'));
}

function drawMiniPatience(c) {
  const k = Math.max(0, c.patience / c.maxPatience);
  const y = FEET - 36;
  R(ui, c.x - 4, y, 8, 1, '#1a0f14');
  R(ui, c.x - 4, y, Math.round(8 * k), 1, k > 0.5 ? '#6ad04a' : k > 0.25 ? '#ffd23a' : '#ff3a3a');
}

const CASHIER_PAL = Object.assign({}, CHEF_PAL, { R: '#2a8a4a', D: '#1a5a2a', A: '#2a8a4a', Y: '#ffffff', B: '#3a2410', K: '#e8e8e8' });
const hover = { market: false, shelf: null, exit: false }; // what the mouse is over

function beginLayers(ox, oy) {
  for (const g of [b, e, ui]) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(1, 0, 0, 1, ox, oy);
  }
}

function render(t) {
  LR.fill(0); LG.fill(0); LB.fill(0); HR.fill(0); HG.fill(0); HB.fill(0);
  if (G.scene === 'market') renderMarket(t);
  else renderStreet(t);
  compose();
  ctx.drawImage(uiC, 0, 0);
}

// the front of one truck: you (or the window cook), helpers moving around
// behind, the counter and the taco being made
function drawTruckFront(tr, t) {
  const yours = tr === playerTruck();
  const staff = staffAt(tr.i);
  const atWindow = tr.i > 0 ? staff[0] : null; // in an extra truck the first cook takes the window
  const behind = staff.filter(s => s !== atWindow && !s.onBreak);
  b.save(); b.translate(tr.off, 0);
  // helpers in the back are drawn first (a little higher, further away) so the window covers them
  for (const s of behind) {
    b.save(); b.translate(Math.round(s.x) - 146, -3);
    drawChef(b, t, s.chef, null, s.w);
    b.restore();
  }
  if (tr.i === 0) drawChef(b, t, tr.chef);
  else if (atWindow && !atWindow.onBreak) drawChef(b, t, atWindow.chef, null, atWindow.w);
  R(b, 96, 102, 100, 3, '#c3c8cf'); R(b, 96, 102, 100, 1, '#eef0f3'); R(b, 98, 105, 96, 2, '#80858d');
  const cook = staff.find(s => s.cooking);
  let items = [];
  if (yours && (G.taco.length || !cook)) items = G.flying ? [] : G.taco;
  else if (cook) items = cook.cooking.items.slice(0, Math.floor(cook.cooking.t / COOK_TIME * (cook.cooking.items.length + 1)));
  drawTaco(b, 146, 101, items);
  R(b, 106, 98, 6, 4, '#9aa0a8'); R(b, 107, 97, 4, 1, '#f4f4f4');
  R(b, 182, 97, 2, 5, '#d6281e'); P(b, 182, 96, '#2a8a2a');
  b.restore();
  // a window cook on break leaves a countdown in the window
  if (atWindow && atWindow.onBreak) {
    const s = Math.ceil(atWindow.shiftT);
    text3(ui, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, tr.off + 146, 84, '#ffd84a', '#1a0f14');
    text3(ui, 'Z', tr.off + 146 + Math.floor(t * 2) % 2, 76, '#9fd0ff', '#1a0f14');
  }
}

// neon sign, window glow, grill and headlight for one truck
function truckLights(tr, t, neonOn) {
  const o = tr.off;
  e.save(); e.translate(o, 0);
  const word = 'TACOS';
  for (let li = 0; li < 5; li++) {
    const g = SIGN_FONT[word[li]], lx = 117 + li * 12, ly = 34;
    const on = neonOn && !(tr.i === 0 && li === 3 && Math.sin(t * 9) * Math.sin(t * 0.37) > 0.8);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '1') {
      R(e, lx + i * 2, ly + j * 2, 2, 2, on ? '#ff6bb0' : '#3a1028');
      if (on) P(e, lx + i * 2, ly + j * 2, '#ffd0e6');
    }
    if (on) glow(o + lx + 5, 39, 14, 1, 0.3, 0.65, 0.35);
  }
  R(e, 168, 75, 18, 1, '#ffe9b0');
  for (let x = 166; x < 188; x += 2) {
    const hgt = (Math.floor(t * 10 + x * 7 + o) % 3);
    R(e, x, 93 - hgt, 1, hgt + 1, hgt === 2 ? '#ffd060' : '#ff7a20');
  }
  R(e, 263, 104, 3, 3, '#fff4c8');
  P(e, 234, 92, '#4ad0ff'); P(e, 236, 92, '#ffb040');
  e.restore();

  if (neonOn) light(o + 146, 40, 64, 1, 0.35, 0.7, 0.5, 1.4);
  const flick = 0.95 + 0.05 * Math.sin(t * 17 + o) * Math.sin(t * 5);
  light(o + 146, 80, 66, 1, 0.8, 0.6, 1.15 * flick, 1.25);
  light(o + 146, 112, 135, 1, 0.68, 0.4, 0.8 * flick, 1.7);
  light(o + 150, 150, 150, 1, 0.7, 0.45, 0.75 * flick, 2.4); // warm pool on the gravel
  glow(o + 177, 76, 12, 1, 0.85, 0.6, 0.35);
  light(o + 177, 92, 34, 1, 0.45, 0.15, 0.7 + 0.3 * Math.sin(t * 11 + o));
  glow(o + 265, 105, 10, 1, 0.95, 0.75, 0.6);
  light(o + 285, 118, 50, 1, 0.95, 0.75, 0.35, 1.4);
}

// an empty lot with a FOR SALE sign where the next truck can go
function drawLot(off, t) {
  const x = off + 140;
  R(b, x, 128, 2, 22, '#5b3e26');
  R(b, x - 16, 116, 34, 16, '#6b4a2a'); R(b, x - 15, 117, 32, 14, '#e8e0cc');
  text3(b, '$' + TRUCK_PRICE, x + 1, 119, '#c8362a', null);
  R(b, x - 12, 126, 26, 1, '#8a8070');
  // dashed parking outline on the gravel
  for (let k = 0; k < 200; k += 8) { R(b, off + 64 + k, 146, 4, 1, '#c8c0a8'); R(b, off + 64 + k, 116, 4, 1, '#8a8478'); }
  if (Math.floor(t * 2) % 2) R(ui, x - 18, 113, 38, 1, '#ffd84a');
}

function renderStreet(t) {
  AMB = AMB_NIGHT;
  drawSky(t);
  beginLayers(OX, OY);

  // ---------- base layer
  b.drawImage(groundC, 0, 0);
  b.drawImage(truckC, 0, 0); // your truck, poles, the market
  for (let i = 1; i < G.trucks.length; i++) {
    const o = G.trucks[i].off;
    b.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 126; y < 148; y++) { const k = (y - 137) / 11, w = Math.sqrt(Math.max(0, 1 - k * k)) * 112; b.fillRect(o + 168 - w, y, w * 2, 1); }
    b.drawImage(truckC, 60, 28, 212, 120, 60 + o, 28, 212, 120);
  }
  if (G.trucks.length < TRUCK_SPOTS.length) drawLot(TRUCK_SPOTS[G.trucks.length], t);

  // steam inside the windows sits behind the cooks
  for (const p of parts) if (p.type === 'steam') {
    b.globalAlpha = 0.35 * (p.life / p.max);
    R(b, p.x, p.y, 2, 1, '#e8e4dc'); P(b, p.x + 1, p.y - 1, '#e8e4dc');
  }
  b.globalAlpha = 1;
  for (const tr of G.trucks) drawTruckFront(tr, t);

  // string-light wires, flags and bulbs
  STRINGS.forEach((s, si) => {
    for (let k = 0; k <= 80; k++) { const [px, py] = stringPoint(s, k / 80, t, si); P(b, px, py, '#121212'); }
  });
  {
    const s = STRINGS[1];
    for (let k = 0; k < 14; k++) {
      const tt = (k + 0.5) / 14, [px, py] = stringPoint(s, tt, t, 1);
      const flutter = Math.floor(t * 4 + k) % 2;
      const col = FLAG_COLS[k % FLAG_COLS.length];
      R(b, px - 2, py + 1, 5, 4, col);
      P(b, px - 2 + flutter * 4, py + 5, col); P(b, px, py + 5, col);
      P(b, px, py + 2, '#1a0f14'); // cut-out hole
    }
  }
  for (const bl of bulbs) {
    const s = STRINGS[bl.s];
    [bl.x, bl.y] = stringPoint(s, bl.t, t, bl.s);
    bl.y += 1;
    let f = 0.92 + 0.08 * Math.sin(t * 3 + bl.ph);
    if (bl.bad && Math.sin(t * 13 + bl.ph) * Math.sin(t * 2.3) > 0.6) f = 0.15;
    bl.f = f;
    P(b, bl.x, bl.y - 1, '#2a2a2a');
    R(b, bl.x, bl.y, 2, 2, '#fff0c8');
  }

  // the runner (inside the market while shopping)
  const rn = G.runner;
  if (rn.hired && rn.state !== 'shopping') {
    const moving = rn.state === 'toStore' || rn.state === 'back';
    drawCustomer(b, Object.assign({}, rn, { state: moving ? 'walk' : 'idle' }), t);
    if (rn.carrying) { const bx = Math.round(rn.x) + (rn.dir < 0 ? -11 : 7); R(b, bx, FEET - 16, 5, 6, '#c8a878'); R(b, bx, FEET - 16, 5, 1, '#e0c898'); }
    if (rn.onBreak) text3(ui, 'Z', rn.x + 6 + Math.floor(t * 2) % 2, FEET - 40, '#9fd0ff', '#1a0f14');
  }
  for (const c of G.customers) drawCustomer(b, c, t);

  // flying taco (base, so it gets lit)
  if (G.flying) {
    const f = G.flying, k = Math.min(1, f.t);
    const sx = f.from + 146, sy = 101, ex = f.c.x, ey = FEET - 14;
    drawTaco(b, sx + (ex - sx) * k, sy + (ey - sy) * k - Math.sin(k * Math.PI) * 14, f.items);
  }

  // base particles
  for (const p of parts) {
    const a = p.life / p.max;
    if (p.type === 'smoke') { b.globalAlpha = 0.28 * a; const s = Math.round(p.size); R(b, p.x - s / 2, p.y - s / 2, s, s, '#9aa0ae'); }
    else if (p.type === 'dust') { b.globalAlpha = 0.6 * Math.sin(a * Math.PI); P(b, p.x, p.y, '#e8dcc8'); }
    else if (p.type === 'puff') { b.globalAlpha = 0.5 * a; R(b, p.x, p.y, 2, 2, '#5a5a60'); }
  }
  b.globalAlpha = 1;
  for (const m of moths) {
    const bl = bulbs[m.b % bulbs.length];
    const mx = bl.x + Math.cos(m.a) * m.r, my = bl.y + 1 + Math.sin(m.a * 1.3) * m.r * 0.6;
    P(b, mx, my, '#c9b48a');
    if (Math.floor(t * 16 + m.r) % 2) P(b, mx + 1, my, '#a08a68');
  }

  // ---------- emit layer + lights
  for (let y = HORIZON - 8; y < HORIZON + 16; y++) {
    const k = 1 - Math.abs(y - HORIZON - 2) / 14;
    e.fillStyle = `rgba(50,60,110,${0.18 * Math.max(0, k)})`;
    e.fillRect(-OX, y, W, 1);
  }
  glow(44 - OX, 22 - OY, 26, 0.6, 0.7, 1, 0.22); // moon (sky is screen space)

  const neonOn = !(Math.sin(t * 7.3) > 0.97 || (Math.sin(t * 0.7) > 0.995));
  for (const tr of G.trucks) if (onScreen(tr.off + 60) || onScreen(tr.off + 270)) truckLights(tr, t, neonOn);
  if (onScreen(MKT.x) || onScreen(MKT.x + MKT.w)) marketLights(t);

  for (const bl of bulbs) {
    if (!onScreen(bl.x)) continue;
    const [r, g, bb] = bl.col, f = bl.f;
    const core = `rgb(${255 * r * f | 0},${255 * g * f | 0},${255 * bb * f | 0})`;
    R(e, bl.x, bl.y, 2, 2, core);
    if (f > 0.5) P(e, bl.x, bl.y, '#ffffff');
    glow(bl.x + 1, bl.y + 1, 10, r, g, bb, 0.6 * f);
    light(bl.x + 1, bl.y + 1, 46, r, g, bb, 0.26 * f, 0.9);
  }

  for (const ff of fireflies) {
    if (!onScreen(ff.x)) continue;
    const p = Math.max(0, Math.sin(t * ff.sp + ff.ph));
    const k = p * p * p;
    if (k < 0.05) continue;
    P(e, ff.x, ff.y, `rgba(200,255,120,${k})`);
    glow(ff.x, ff.y, 5, 0.7, 1, 0.4, 0.5 * k);
    light(ff.x, ff.y, 16, 0.7, 1, 0.4, 0.35 * k);
  }

  drawEmitParticles();

  // people block the glow of lit windows behind them (the emit layer is drawn on top)
  e.save();
  e.globalCompositeOperation = 'destination-out';
  for (const c of G.customers) if (onScreen(c.x)) drawCustomer(e, c, t);
  if (rn.hired && rn.state !== 'shopping') drawCustomer(e, Object.assign({}, rn, { state: rn.state === 'toStore' || rn.state === 'back' ? 'walk' : 'idle' }), t);
  e.restore();

  // ---------- UI layer: order bubbles, cook status, market hover
  G.trucks.forEach((tr, i) => {
    queue(i).forEach((c, k) => {
      if (c.state !== 'wait') return;
      if (k === 0) drawBubble(c, t); else drawMiniPatience(c);
    });
    if (staffAt(i).some(s => s.noStock) && Math.floor(t * 3) % 2) text3(ui, '!', tr.off + 146, 70, '#ff5a3a', '#1a0f14');
  });
}

function drawEmitParticles() {
  for (const p of parts) {
    const a = Math.max(0, p.life / p.max);
    switch (p.type) {
      case 'ember': {
        const col = a > 0.6 ? '#ffe080' : a > 0.3 ? '#ff9a30' : '#c04010';
        P(e, p.x, p.y, col); light(p.x, p.y, 8, 1, 0.5, 0.15, 0.5 * a);
        break;
      }
      case 'spark':
        P(e, p.x, p.y, '#ffd0ea'); P(e, p.x - 1, p.y, '#ff6bb0'); P(e, p.x + 1, p.y, '#ff6bb0');
        P(e, p.x, p.y - 1, '#ff6bb0'); P(e, p.x, p.y + 1, '#ff6bb0');
        glow(p.x, p.y, 6, 1, 0.4, 0.7, 0.6 * a);
        break;
      case 'coin': {
        const spin = Math.floor(p.life * 12) % 3;
        R(e, p.x - (spin === 1 ? 0 : 1), p.y, spin === 1 ? 1 : 2, 2, '#ffd23a');
        P(e, p.x, p.y, '#fff6b0');
        glow(p.x, p.y, 6, 1, 0.85, 0.3, 0.5 * a);
        break;
      }
      case 'heart':
        sprite(e, p.x - 2, p.y, ['11.11', '11111', '.111.', '..1..'], { 1: `rgba(255,95,162,${a})` });
        glow(p.x, p.y + 2, 6, 1, 0.4, 0.7, 0.4 * a);
        break;
      case 'note':
        text3(ui, '♪', p.x, p.y + Math.sin(p.life * 8) * 1.5, '#ffe9b0', '#2a1a10');
        break;
      case 'icon':
        R(ui, p.x - 1, p.y - 1, 7, 7, '#1a0f14'); drawIcon(ui, p.id, p.x, p.y);
        break;
      case 'shoot':
        for (let k = 0; k < 6; k++) P(e, p.x - p.vx * k * 0.01, p.y - p.vy * k * 0.01, `rgba(220,230,255,${a * (1 - k / 6)})`);
        break;
      case 'text':
        text3(ui, p.str, p.x, p.y, p.col, '#1a0f14');
        break;
    }
  }
}

// glowing sign, lit windows and the cool white spill of the market
function marketLights(t) {
  const { x, y, w } = MKT, bot = y + MKT.h;
  signText(e, 'MARKET', x + 43, y + 13, 2, '#7ff0ff', '#e8ffff');
  glow(x + 78, y + 18, 50, 0.4, 0.9, 1, 0.35, 2.5);
  // windows + door glow (shelves stay dark so the goods read through the glass)
  e.fillStyle = 'rgba(190,228,240,0.30)';
  e.fillRect(x + 6, y + 36, 54, 39); e.fillRect(x + 96, y + 36, 54, 39); e.fillRect(x + 66, y + 38, 24, bot - y - 40);
  // OPEN sign, blinking
  if (Math.floor(t * 1.5) % 4) {
    signText(e, 'OPEN', x + 112, y + 38, 1, '#ff4a4a', '#ffb0b0');
    glow(x + 123, y + 40, 12, 1, 0.3, 0.3, 0.5);
  }
  light(x + 78, y + 58, 120, 0.75, 0.9, 1, 0.85, 1.5);
  light(x + 78, bot + 12, 100, 0.75, 0.9, 1, 0.55, 2.4);
}

// ---------------------------------------------------------------------
//  inside the market (screen space, its own lighting)
// ---------------------------------------------------------------------
const SHELVES = [
  { id: 'asada', x: 16, y: 18, w: 50, h: 48 },
  { id: 'pollo', x: 72, y: 18, w: 50, h: 48 },
  { id: 'queso', x: 128, y: 18, w: 50, h: 48 },
  { id: 'salsa', x: 18, y: 84, w: 78, h: 36 },
  { id: 'lechuga', x: 110, y: 88, w: 76, h: 32 },
];
const EXIT_DOOR = { x: 190, y: 22, w: 30, h: 44 };

function renderMarket(t) {
  AMB = AMB_STORE;
  sky.clearRect(0, 0, W, H);
  const ox0 = OX, oy0 = OY;
  OX = 0; OY = 0; // lights use screen coordinates in here
  beginLayers(0, 0);

  // wall, ceiling, floor tiles
  R(b, 0, 0, W, 66, '#d6d0c0'); R(b, 0, 0, W, 8, '#a8a294'); R(b, 0, 8, W, 1, '#8a8478');
  R(b, 0, 64, W, 2, '#8a8478');
  for (let y = 66; y < H; y += 6) for (let x = 0; x < W; x += 8)
    R(b, x, y, 8, 6, ((x / 8 + (y - 66) / 6) & 1) ? '#e8e4dc' : '#c4c0b6');

  // back-wall coolers: asada, pollo, queso
  for (const s of SHELVES.slice(0, 3)) {
    const col = ING[s.id].col;
    R(b, s.x, s.y - 9, s.w, 8, '#1c2433'); drawIcon(e, s.id, s.x + s.w / 2 - 2, s.y - 8);
    R(b, s.x, s.y, s.w, s.h, '#8a9098'); R(b, s.x + 2, s.y + 2, s.w - 4, s.h - 4, '#2a3a48');
    for (const sy of [s.y + 15, s.y + 29, s.y + 43]) {
      R(b, s.x + 2, sy, s.w - 4, 1, '#6a7480');
      for (let px = s.x + 4; px < s.x + s.w - 6; px += 6) {
        R(b, px, sy - 6, 5, 6, col[1]); R(b, px, sy - 6, 5, 2, col[2]); P(b, px + 2, sy - 3, col[3]);
      }
    }
    R(b, s.x + s.w / 2, s.y + 2, 1, s.h - 4, '#8a9098');
    R(b, s.x + s.w / 2 - 3, s.y + 20, 1, 8, '#c8ccd2'); R(b, s.x + s.w / 2 + 2, s.y + 20, 1, 8, '#c8ccd2');
    e.fillStyle = 'rgba(160,220,255,0.14)'; e.fillRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
    light(s.x + s.w / 2, s.y + 24, 36, 0.75, 0.92, 1, 0.55);
  }

  // exit door with a red EXIT sign
  const d = EXIT_DOOR;
  R(b, d.x, d.y, d.w, d.h, '#5a6a7a'); R(b, d.x + 3, d.y + 4, d.w - 6, 16, '#22303c'); R(b, d.x + 22, d.y + 26, 3, 6, '#c8ccd2');
  signText(e, 'EXIT', d.x + 3, d.y - 9, 1, '#ff3a3a', '#ffb0b0');
  glow(d.x + 14, d.y - 7, 12, 1, 0.2, 0.2, 0.5);

  // salsa aisle: a gondola shelf full of jars
  {
    const s = SHELVES[3];
    R(b, s.x, s.y - 9, s.w, 8, '#1c2433'); drawIcon(e, 'salsa', s.x + s.w / 2 - 2, s.y - 8);
    R(b, s.x, s.y, s.w, s.h, '#a0a6ae'); R(b, s.x + 2, s.y + 2, s.w - 4, s.h - 4, '#6a7078');
    for (const sy of [s.y + 12, s.y + 23, s.y + 34]) {
      R(b, s.x + 2, sy, s.w - 4, 2, '#c8ccd2');
      for (let px = s.x + 4; px < s.x + s.w - 5; px += 5) { R(b, px, sy - 7, 4, 7, '#d6281e'); R(b, px, sy - 8, 4, 1, '#e8e8e8'); R(b, px, sy - 4, 4, 2, '#f4ead8'); }
    }
  }
  // produce stand: crates of lettuce
  {
    const s = SHELVES[4];
    R(b, s.x, s.y - 9, s.w, 8, '#1c2433'); drawIcon(e, 'lechuga', s.x + s.w / 2 - 2, s.y - 8);
    R(b, s.x, s.y + 12, s.w, s.h - 12, '#7a4a24');
    for (let k = s.y + 15; k < s.y + s.h; k += 5) R(b, s.x, k, s.w, 1, '#5a3418');
    for (let row = 0; row < 3; row++) for (let px = s.x + 3 + (row % 2) * 4; px < s.x + s.w - 6; px += 8)
      disc(b, px + 3, s.y + 3 + row * 4, 3, row % 2 ? '#4caa3a' : '#6ad04a');
  }

  // checkout counter with a cashier
  const cashier = { pose: 'idle', idle: 'stand', look: Math.floor(t * 0.5) % 3 - 1, blinkT: (t % 4) < 0.15 ? -1 : 1 };
  b.save(); b.translate(232 - 146, -2);
  drawChef(b, t, cashier, CASHIER_PAL);
  b.restore();
  R(b, 200, 98, 56, 4, '#c8c0b0'); R(b, 200, 102, 56, 28, '#8a4a2a'); R(b, 200, 102, 56, 1, '#a86a40');
  R(b, 208, 88, 14, 10, '#2a2a30'); R(e, 210, 90, 10, 3, '#4aff8a'); glow(215, 91, 8, 0.3, 1, 0.5, 0.4);

  // fluorescent ceiling tubes
  for (const tx of [20, 100, 180]) {
    R(e, tx, 3, 50, 2, '#f4fbff');
    glow(tx + 25, 4, 30, 0.85, 0.95, 1, 0.25, 3);
    light(tx + 25, 10, 120, 0.9, 0.95, 1, 0.5, 1.2);
  }

  // whatever the mouse is over lights up a little, and its sign icon bobs
  const hs = hover.shelf || (hover.exit ? EXIT_DOOR : null);
  if (hs) {
    light(hs.x + hs.w / 2, hs.y + hs.h / 2, Math.max(hs.w, hs.h) * 0.8, 1, 0.95, 0.8, 0.55);
    glow(hs.x + hs.w / 2, hs.y - 5, 14, 1, 0.9, 0.6, 0.3);
    if (hover.shelf && Math.floor(t * 4) % 2) {
      R(e, hs.x + hs.w / 2 - 3, hs.y - 9, 7, 8, '#1c2433');
      drawIcon(e, hs.id, hs.x + hs.w / 2 - 2, hs.y - 9);
    }
  }

  // (street particles like the chef's whistling notes stay outside)
  OX = ox0; OY = oy0;
}

function compose() {
  const sd = sky.getImageData(0, 0, W, H).data;
  const bd = b.getImageData(0, 0, W, H).data;
  const ed = e.getImageData(0, 0, W, H).data;
  for (let y = 0, i = 0; y < H; y++) {
    const by = (y & 3) << 2;
    for (let x = 0; x < W; x++, i++) {
      const p = i << 2;
      const a = bd[p + 3] / 255, ia = 1 - a;
      let r = bd[p] * (AMB[0] + LR[i]) * a + sd[p] * ia;
      let g = bd[p + 1] * (AMB[1] + LG[i]) * a + sd[p + 1] * ia;
      let bl = bd[p + 2] * (AMB[2] + LB[i]) * a + sd[p + 2] * ia;
      const ea = ed[p + 3] / 255;
      r += ed[p] * ea + HR[i] * 255;
      g += ed[p + 1] * ea + HG[i] * 255;
      bl += ed[p + 2] * ea + HB[i] * 255;
      const v = VIG[i], th = BAYER[by | (x & 3)];
      r = Math.floor(r * v / STEP + th) * STEP;
      g = Math.floor(g * v / STEP + th) * STEP;
      bl = Math.floor(bl * v / STEP + th) * STEP;
      od[p] = r > 255 ? 255 : r; od[p + 1] = g > 255 ? 255 : g; od[p + 2] = bl > 255 ? 255 : bl; od[p + 3] = 255;
    }
  }
  ctx.putImageData(outImg, 0, 0);
}

// ---------------------------------------------------------------------
//  HUD + input
// ---------------------------------------------------------------------
const $ = id => document.getElementById(id);
const wrap = $('wrap'), screen = $('screen'), shopEl = $('shop'), bizEl = $('biz');
const navL = $('navL'), navR = $('navR');
const ING_NAMES = { asada: 'ASADA', pollo: 'POLLO', queso: 'QUESO', salsa: 'SALSA', lechuga: 'LECHUGA' };

function iconURL(id) {
  const c = document.createElement('canvas'); c.width = 5; c.height = 5;
  drawIcon(c.getContext('2d'), id, 0, 0);
  return c.toDataURL();
}
document.querySelectorAll('button.ing').forEach(btn => {
  const id = btn.dataset.ing;
  btn.querySelector('img').src = iconURL(id);
  btn.addEventListener('click', () => { addIngredient(id); btn.blur(); });
});
$('serve').addEventListener('click', () => { serve(); $('serve').blur(); });
$('leave').addEventListener('click', () => leaveMarket());
// browsers only allow sound after the first click or key press
window.addEventListener('pointerdown', audio);

function refreshButtons() {
  document.querySelectorAll('button.ing').forEach(btn => {
    const id = btn.dataset.ing, n = G.stock[id];
    btn.classList.toggle('on', G.taco.includes(id));
    btn.classList.toggle('low', n > 0 && n <= 3);
    btn.classList.toggle('out', n <= 0);
    btn.querySelector('.cnt').textContent = n;
  });
  if (!shopEl.classList.contains('hidden')) refreshShop();
}
function updateHud() {
  $('money').textContent = '$' + G.money;
  $('served').textContent = 'SERVED ' + G.served;
  if (!shopEl.classList.contains('hidden')) refreshShop();
}

let hintTimer = 0;
function flashHint(msg) {
  const h = $('hint');
  h.textContent = msg; h.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => h.classList.remove('show'), 2400);
}

// ---- pause ----
function setPaused(p) {
  G.paused = p;
  $('pause').classList.toggle('paused', p);
  $('pause').setAttribute('aria-label', p ? 'Resume' : 'Pause');
  if (p) {
    screen.innerHTML = '<h1>PAUSED</h1><div class="panel"><button id="resume">RESUME</button></div>';
    $('resume').addEventListener('click', () => setPaused(false));
  }
  screen.classList.toggle('hidden', !p);
}
$('pause').addEventListener('click', () => { setPaused(!G.paused); $('pause').blur(); });

// ---- scrolling the street ----
function camStops() {
  const stops = [{ x: CAM_TRUCK, name: 'TRUCK' }, { x: CAM_MARKET, name: 'MARKET' }];
  G.trucks.slice(1).forEach((tr, k) => stops.push({ x: tr.off + CAM_TRUCK, name: 'TRUCK ' + (k + 2) }));
  if (G.trucks.length < TRUCK_SPOTS.length) stops.push({ x: TRUCK_SPOTS[G.trucks.length] + CAM_TRUCK, name: 'NEW TRUCK' });
  return stops;
}
function clampCam(x) { const s = camStops(); return Math.max(CAM_TRUCK, Math.min(s[s.length - 1].x, x)); }
function scrollCam(dx) { camTarget = clampCam(camTarget + dx); }
let navText = '';
function updateNavButtons() {
  const street = G.scene === 'street';
  const stops = camStops();
  const next = street && stops.find(s => s.x > camTarget + 4);
  const prev = street && [...stops].reverse().find(s => s.x < camTarget - 4);
  const txt = (prev ? prev.name : '') + '|' + (next ? next.name : '');
  if (txt === navText) return;
  navText = txt;
  navL.hidden = !prev; navR.hidden = !next;
  if (prev) { navL.textContent = '< ' + prev.name; navL.dataset.x = prev.x; }
  if (next) { navR.textContent = next.name + ' >'; navR.dataset.x = next.x; }
}
for (const btn of [navL, navR]) btn.addEventListener('click', () => { camTarget = clampCam(+btn.dataset.x); btn.blur(); });

function toGame(ev) {
  const r = cv.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H];
}
const inRect = (x, y, r, top = 0) => x >= r.x && x <= r.x + r.w && y >= r.y - top && y <= r.y + r.h;
function lotRect() {
  if (G.trucks.length >= TRUCK_SPOTS.length) return null;
  const off = TRUCK_SPOTS[G.trucks.length];
  return { x: off + 60, y: 110, w: 210, h: 40 };
}
// Everything you manage is clicked in the world: your trucks (hire cooks),
// the FOR SALE lot (buy a truck), and Leo (send him shopping).
function updateHover(gx, gy) {
  hover.market = false; hover.lot = false; hover.shelf = null; hover.exit = false; hover.truck = null; hover.leo = false;
  if (G.scene === 'street') {
    const wx = gx + camX, wy = gy - OY, lot = lotRect(), r = G.runner;
    hover.leo = r.hired && r.state === 'idle' && inRect(wx, wy, { x: r.x - 9, y: FEET - 34, w: 18, h: 36 });
    hover.market = !hover.leo && inRect(wx, wy, { x: MKT.x, y: MKT.y, w: MKT.w, h: MKT.h + 6 });
    hover.lot = !!lot && inRect(wx, wy, lot);
    if (!hover.leo && !hover.market && !hover.lot)
      hover.truck = G.trucks.find(tr => inRect(wx, wy, { x: tr.off + 72, y: 30, w: 196, h: 112 })) || null;
  } else {
    hover.shelf = SHELVES.find(s => inRect(gx, gy, s, 10)) || null;
    hover.exit = inRect(gx, gy, EXIT_DOOR, 10);
  }
  const clickable = hover.market || hover.lot || hover.shelf || hover.exit || hover.truck || hover.leo;
  cv.style.cursor = clickable ? 'pointer' : (G.scene === 'street' ? 'grab' : 'default');
}
let lastSceneChange = 0;
function clickGame() {
  if (G.paused || performance.now() - lastSceneChange < 350) return; // one click shouldn't enter and shop at once
  if (G.scene === 'street') {
    if (hover.leo) openBusiness('leo');
    else if (hover.market) enterMarket();
    else if (hover.lot) openBusiness('lot');
    else if (hover.truck) { bizTruck = hover.truck.i; openBusiness('workers'); }
  } else {
    if (hover.shelf) openShop(hover.shelf.id);
    else if (hover.exit) leaveMarket();
  }
}
let drag = null;
cv.addEventListener('wheel', ev => {
  if (G.scene !== 'street' || G.paused) return;
  ev.preventDefault();
  const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
  scrollCam(d * 0.35);
}, { passive: false });
cv.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, cam: camTarget, moved: false }; });
window.addEventListener('pointermove', ev => {
  const [gx, gy] = toGame(ev);
  updateHover(gx, gy);
  if (drag && G.scene === 'street' && !G.paused) {
    const dx = (ev.clientX - drag.x) / cv.getBoundingClientRect().width * W;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved) { camTarget = clampCam(drag.cam - dx); camX = camTarget; }
  }
});
window.addEventListener('pointerup', ev => {
  if (drag && !drag.moved && ev.target === cv) { updateHover(...toGame(ev)); clickGame(); }
  drag = null;
});

// ---- the market ----
function enterMarket() {
  G.scene = 'market';
  lastSceneChange = performance.now();
  wrap.classList.add('in-market');
  hover.market = false;
  sfx.bell();
  updateNavButtons();
  flashHint('CLICK A SHELF TO BUY SUPPLIES');
}
function leaveMarket() {
  closeShop();
  G.scene = 'street';
  lastSceneChange = performance.now();
  wrap.classList.remove('in-market');
  hover.shelf = null; hover.exit = false;
  updateNavButtons();
}

let shopId = null;
function openShop(id) {
  shopId = id;
  $('shopIcon').src = iconURL(id);
  $('shopName').textContent = ING_NAMES[id];
  $('shopMsg').textContent = '';
  shopEl.classList.remove('hidden');
  refreshShop();
}
function refreshShop() {
  if (!shopId) return;
  $('shopHave').textContent = `YOU HAVE ${G.stock[shopId]}  ·  MONEY $${G.money}`;
  $('buy').disabled = G.money < PACK_PRICE;
}
function closeShop() { shopEl.classList.add('hidden'); shopId = null; }
$('buy').addEventListener('click', () => {
  if (G.money < PACK_PRICE) { $('shopMsg').textContent = 'NOT ENOUGH MONEY'; sfx.bad(); return; }
  G.money -= PACK_PRICE;
  G.stock[shopId] += PACK_SIZE;
  saveGame(); updateHud(); refreshButtons();
  tone(990, 0.08, 'square', 0.04); tone(1320, 0.1, 'square', 0.04, 0, 0.07);
  $('shopMsg').textContent = `+${PACK_SIZE} ${ING_NAMES[shopId]}!`;
});
$('shopClose').addEventListener('click', closeShop);

// ---- managing the business: one pop-up with three faces ----
//  'workers' (click a truck), 'lot' (click the FOR SALE sign), 'leo' (click Leo)
let bizMode = 'workers', bizTruck = 0; // bizTruck: the truck you clicked to open the workers list
function openBusiness(mode) {
  bizMode = mode;
  G.menu = true; // the game waits while you manage things
  $('bizMsg').textContent = '';
  renderBusiness();
  bizEl.classList.remove('hidden');
}
function closeBusiness() { G.menu = false; bizEl.classList.add('hidden'); }
$('bizClose').addEventListener('click', closeBusiness);

const clock = s => `${Math.floor(Math.ceil(s) / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
function shiftText(w) { return w.onBreak ? `ON BREAK · BACK IN ${clock(w.shiftT)}` : `WORKING · BREAK IN ${clock(w.shiftT)}`; }
const truckName = i => i === 0 ? 'YOUR TRUCK' : `TRUCK ${i + 1}`;

function renderBusiness() {
  const r = G.runner;
  let h = '';
  if (bizMode === 'workers') {
    const isHired = w => w.job === 'runner' ? r.hired : G.staff[w.id].truck !== null;
    const hired = WORKERS.filter(isHired), free = WORKERS.filter(w => !isHired(w));
    $('bizTitle').textContent = `WORKERS: ${hired.length}`;
    const truckPicker = (w, sel) =>
      `<select data-assign="${w.id}">${G.trucks.map(t => `<option value="${t.i}" ${t.i === sel ? 'selected' : ''}>${truckName(t.i)}</option>`).join('')}</select>`;
    const card = (w, status, control, cls = '') =>
      `<div class="card ${cls}"><img class="face" src="${portraitURL(w)}" alt="">` +
      `<div class="info"><div class="name">${w.name}</div><div class="job">${w.job === 'runner' ? 'STORE RUNNER' : 'TRUCK COOK'}</div>` +
      `<div class="status">${status}</div></div><div class="ctrl">${control}</div></div>`;

    if (!hired.length) h += '<p class="dim">NO WORKERS YET. HIRE SOMEONE BELOW!</p>';
    for (const w of hired) {
      const s = w.job === 'runner' ? r : G.staff[w.id];
      const assigned = w.job === 'runner' ? '<span class="ok">STORE RUNS</span>' : truckPicker(w, s.truck);
      h += card(w, w.job === 'runner' ? 'ALWAYS READY TO RUN' : `<span class="live" data-shift="${w.id}">${shiftText(s)}</span>`,
        `<span class="assigned">ASSIGNED:</span>${assigned}`, 'hired');
    }
    if (free.length) {
      h += '<h3 class="sub">HIRE MORE</h3>';
      for (const w of free) {
        const price = w.job === 'runner' ? RUNNER_PRICE : COOK_PRICE;
        h += card(w, w.job === 'runner' ? 'RUNS TO THE MARKET FOR YOU' : 'COOKS AND SERVES ON THEIR OWN',
          `<button data-act="hire" data-w="${w.id}">HIRE $${price}</button>`);
      }
    }
  } else if (bizMode === 'lot') {
    $('bizTitle').textContent = 'NEW TRUCK';
    h += `<p>OPEN TRUCK ${G.trucks.length + 1} RIGHT HERE.<br>IT NEEDS A COOK BEFORE IT CAN SELL TACOS.</p>` +
      `<div class="btnrow"><button data-act="truck">BUY TRUCK $${TRUCK_PRICE}</button></div>`;
  } else {
    $('bizTitle').textContent = 'LEO’S SHOPPING LIST';
    h += `<div class="card hired"><img class="face" src="${portraitURL(RUNNER)}" alt=""><div class="info"><div class="name">LEO</div>` +
      `<div class="job">STORE RUNNER</div><div class="status">ALWAYS READY TO RUN</div></div></div>`;
    h += '<div class="orders">';
    for (const id of ORDER) {
      h += `<div class="biz-row"><span><img src="${iconURL(id)}" alt=""> ${ING_NAMES[id]} <span class="dim">(HAVE ${G.stock[id]})</span></span>` +
        `<span class="stepper"><button data-act="minus" data-id="${id}">-</button><span>${r.order[id]} PK</span>` +
        `<button data-act="plus" data-id="${id}">+</button></span></div>`;
    }
    const cost = runnerPacks() * PACK_PRICE;
    h += `<div class="biz-row"><label><input type="checkbox" data-act="auto" ${r.auto ? 'checked' : ''}> AUTO-RESTOCK WHEN LOW</label>` +
      `<button data-act="send" ${r.state !== 'idle' || r.onBreak || !cost ? 'disabled' : ''}>SEND LEO $${cost}</button></div>`;
    h += `<div class="biz-row"><span class="dim" id="runStatus">${runnerStatus()}</span></div></div>`;
  }
  $('bizBody').innerHTML = h;
}
function renderLeoIfOpen() { if (!bizEl.classList.contains('hidden') && bizMode === 'leo') renderBusiness(); }
function runnerStatus() {
  const r = G.runner;
  return 'LEO: ' + (r.msg || (r.state === 'idle' ? 'WAITING FOR ORDERS' : '')).toUpperCase();
}
// keep the timers and Leo's status ticking while a pop-up is open
function refreshBusinessLive() {
  const el = document.getElementById('runStatus');
  if (el) el.textContent = runnerStatus();
  document.querySelectorAll('#bizBody [data-shift]').forEach(s => {
    const id = s.dataset.shift;
    if (G.staff[id]) s.textContent = shiftText(G.staff[id]);
  });
}
function bizMsg(m) { $('bizMsg').textContent = m.toUpperCase(); }
function spend(price) {
  if (G.money < price) { bizMsg(`You need $${price}`); sfx.bad(); return false; }
  G.money -= price; saveGame(); updateHud();
  tone(990, 0.08, 'square', 0.04); tone(1320, 0.1, 'square', 0.04, 0, 0.07);
  return true;
}
$('bizBody').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act, r = G.runner;
  if (act === 'hire') {
    const w = workerById(btn.dataset.w);
    if (w.job === 'runner') {
      if (spend(RUNNER_PRICE)) {
        Object.assign(r, { hired: true, x: RUNNER_HOME, state: 'idle', onBreak: false, shiftT: WORK_TIME });
        bizMsg('Leo is hired! Click him by your truck to send him shopping.');
      }
    } else {
      // new cooks start at the truck you clicked; move them with the ASSIGNED picker
      const ti = bizTruck;
      if (spend(COOK_PRICE)) { hireCook(w.id, ti); bizMsg(`${w.name} is cooking at ${truckName(ti).toLowerCase()}!`); }
    }
  } else if (act === 'truck') {
    if (spend(TRUCK_PRICE)) {
      G.trucks.push(makeTruck(G.trucks.length));
      bizMode = 'workers'; bizTruck = G.trucks.length - 1;
      bizMsg(`Truck ${G.trucks.length} is open! Hire it a cook.`);
    }
  } else if (act === 'plus' || act === 'minus') {
    const id = btn.dataset.id;
    r.order[id] = Math.max(0, Math.min(9, r.order[id] + (act === 'plus' ? 1 : -1)));
  } else if (act === 'send') {
    bizMsg(sendRunner());
    if (r.state !== 'idle') setTimeout(closeBusiness, 700);
  } else if (act === 'auto') {
    r.auto = btn.checked;
    bizMsg(r.auto ? 'Leo restocks by himself when anything gets low' : 'Auto-restock off');
  } else return; // clicks on the truck picker etc.
  saveBusiness();
  renderBusiness();
});
// moving a cook to another truck
$('bizBody').addEventListener('change', ev => {
  const sel = ev.target.closest('select[data-assign]');
  if (!sel) return;
  const s = G.staff[sel.dataset.assign];
  if (s.cooking) { s.cooking.c.claimed = null; s.cooking = null; }
  s.truck = +sel.value; s.x = s.goal = 146;
  bizMsg(`${s.w.name} now works at ${truckName(s.truck).toLowerCase()}`);
  saveBusiness();
  renderBusiness();
});

window.addEventListener('keydown', ev => {
  audio();
  const k = ev.key.toLowerCase();
  if (k === 'p' || k === 'escape') {
    if (!bizEl.classList.contains('hidden')) closeBusiness();
    else if (!shopEl.classList.contains('hidden')) closeShop();
    else setPaused(!G.paused);
    return;
  }
  if (G.paused || G.menu) return;
  if (G.scene === 'street') {
    if (k === 'arrowright' || k === 'd') { scrollCam(48); return; }
    if (k === 'arrowleft' || k === 'a') { scrollCam(-48); return; }
  }
  const idx = '12345'.indexOf(k);
  if (idx >= 0) addIngredient(ORDER[idx]);
  else if (k === ' ' || k === 'enter') { ev.preventDefault(); serve(); }
  else if (k === 'x' || k === 'backspace' || k === 'delete') trashTaco();
});

function startGame() {
  Object.assign(G, { running: true, served: 0, taco: [], customers: [], flying: null });
  G.trucks.forEach(tr => { tr.spawnT = tr.i === 0 ? 1.2 : rr(2, 5); });
  for (const w of COOKS) G.staff[w.id].cooking = null;
  if (!COOKS.some(w => G.staff[w.id].truck !== null)) setTimeout(() => flashHint('TIP: CLICK YOUR TRUCK TO HIRE WORKERS'), 1500);
  refreshButtons(); updateHud();
}

function fit() {
  let s = Math.min(innerWidth / W, innerHeight / (H + 28)); // +28 rows for the button bar
  // fill the window as much as possible (fractional scaling keeps the pixels square)
  wrap.style.setProperty('--s', s);
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------------
//  boot
// ---------------------------------------------------------------------
buildGround();
buildHills();
buildTruck();
buildScenery();
buildMarket();
loadBusiness();
startGame(); // the truck is open as soon as the page loads

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render(G.time);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
