// Procedurally generated textures (no external image assets needed).
import * as THREE from 'three';

let maxAniso = 8;
export function setAnisotropy(a) { maxAniso = a; }

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// Small deterministic RNG so the campus looks the same on every visit.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function noise(ctx, w, h, amount, rand, size = 2) {
  for (let i = 0; i < (w * h) / (size * size * 3); i++) {
    const v = (rand() - 0.5) * amount;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(rand() * w, rand() * h, size, size);
  }
}

/**
 * Facade texture: a tile of `bays` x `floors` windows. One tile covers
 * bays*bayW metres horizontally and floors*floorH metres vertically.
 */
export function makeFacade(style, seed = 7) {
  const S = {
    academic: { wall: '#b4553f', band: '#efe3cf', glass: ['#9fc4d8', '#3e5f78'], frame: '#f4ede2', win: [0.18, 0.2, 0.82, 0.72], bands: true },
    tower: { wall: '#c26a4f', band: '#f1e6d4', glass: ['#b9d6e6', '#456c88'], frame: '#e9e2d6', win: [0.12, 0.16, 0.88, 0.8], bands: true, pier: true },
    hostel: { wall: '#e7c9a4', band: '#b65a40', glass: ['#a7c3d3', '#4b6476'], frame: '#fff7ea', win: [0.26, 0.24, 0.74, 0.7], balcony: true },
    hostel2: { wall: '#d9b48c', band: '#9f4b37', glass: ['#a7c3d3', '#4b6476'], frame: '#fff7ea', win: [0.24, 0.22, 0.76, 0.72], balcony: true },
    business: { wall: '#ddd5c7', band: '#8e3f30', glass: ['#9cc3dc', '#34566f'], frame: '#5b4a42', win: [0.08, 0.18, 0.92, 0.8], bands: true },
    residence: { wall: '#efdcc0', band: '#a8573f', glass: ['#a9c0cc', '#536a78'], frame: '#ffffff', win: [0.3, 0.26, 0.7, 0.68], balcony: true },
    city: { wall: '#c9c2b8', band: '#aaa197', glass: ['#8fa6b5', '#3e4f5c'], frame: '#d9d4cc', win: [0.25, 0.25, 0.75, 0.7] },
    city2: { wall: '#b8b9bd', band: '#9a9ba0', glass: ['#9cb3c4', '#3b4d5c'], frame: '#cfd0d4', win: [0.15, 0.22, 0.85, 0.75] },
    lobby: { wall: '#e9e2d6', band: '#8e3f30', glass: ['#b5d3e2', '#2c4a60'], frame: '#34383d', win: [0.05, 0.08, 0.95, 0.97], lit: 0.9 },
  }[style];
  const bays = 4, floors = 4, cell = 128;
  const W = bays * cell, H = floors * cell;
  const rand = rng(seed);
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  const [cr, gr2] = canvas(W / 4, H / 4); // roughness: walls matte, glass glossy (quarter res is enough)
  gr2.scale(0.25, 0.25);
  gr2.fillStyle = 'rgb(232,232,232)'; gr2.fillRect(0, 0, W, H);
  g.fillStyle = S.wall; g.fillRect(0, 0, W, H);
  // brick courses
  if (style === 'academic' || style === 'tower') {
    g.strokeStyle = 'rgba(70,25,15,0.18)'; g.lineWidth = 1;
    for (let y = 0; y < H; y += 6) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      const off = (y / 6) % 2 ? 0 : 7;
      for (let x = off; x < W; x += 14) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 6); g.stroke(); }
    }
  }
  noise(g, W, H, 0.12, rand, 2);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let fy = 0; fy < floors; fy++) {
    for (let bx = 0; bx < bays; bx++) {
      const x0 = bx * cell, y0 = (floors - 1 - fy) * cell; // canvas y is flipped vs v
      const [a, b, cc, d] = S.win;
      const wx = x0 + a * cell, wy = y0 + b * cell, ww = (cc - a) * cell, wh = (d - b) * cell;
      if (S.pier) { g.fillStyle = 'rgba(255,240,225,0.25)'; g.fillRect(x0, y0, 6, cell); }
      // frame
      g.fillStyle = S.frame; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      gr2.fillStyle = 'rgb(150,150,150)'; gr2.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      gr2.fillStyle = 'rgb(28,28,28)'; gr2.fillRect(wx, wy, ww, wh);
      // glass with sky reflection gradient
      const gr = g.createLinearGradient(0, wy, 0, wy + wh);
      gr.addColorStop(0, S.glass[0]); gr.addColorStop(1, S.glass[1]);
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(wx, wy, ww, 7); g.fillRect(wx, wy, 5, wh);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(wx, wy + wh * 0.65); g.lineTo(wx + ww * 0.45, wy); g.lineTo(wx + ww * 0.6, wy); g.lineTo(wx, wy + wh * 0.9); g.fill();
      // mullions
      g.fillStyle = S.frame;
      g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      if (style !== 'hostel' && style !== 'hostel2') g.fillRect(wx, wy + wh * 0.35, ww, 3);
      // curtains / interior variation
      if (rand() < 0.35) { g.fillStyle = `rgba(${200 + rand() * 50},${170 + rand() * 60},${120 + rand() * 60},0.35)`; g.fillRect(wx + 2, wy + 2, ww * 0.3, wh - 4); }
      // sill / balcony
      if (S.balcony) {
        g.fillStyle = S.band; g.fillRect(wx - 10, wy + wh + 6, ww + 20, 9);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(wx - 10, wy + wh + 15, ww + 20, 4);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - 4, wy + wh + 4, ww + 8, 4);
      }
      // night lights
      const lit = rand();
      if (lit < (S.lit ?? 0.55)) {
        const warm = rand() < 0.75;
        const k = 0.55 + rand() * 0.45;
        ge.fillStyle = warm ? `rgba(255,${190 + rand() * 30},${110 + rand() * 40},${k})` : `rgba(205,230,255,${k})`;
        ge.fillRect(wx, wy, ww, wh);
        ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      }
    }
    // floor slab band
    if (S.bands) { g.fillStyle = S.band; g.fillRect(0, (floors - 1 - fy) * cell + cell - 10, W, 10); }
  }
  // weathering: soft streaks under sills and darker grime toward the base of each tile
  const wr = rng(seed + 5);
  for (let i = 0; i < 26; i++) {
    const x = wr() * W, y = wr() * H, h = 30 + wr() * 90;
    const st = g.createLinearGradient(0, y, 0, y + h);
    st.addColorStop(0, 'rgba(40,30,25,0.10)'); st.addColorStop(1, 'rgba(40,30,25,0)');
    g.fillStyle = st; g.fillRect(x, y, 3 + wr() * 8, h);
  }
  return { map: toTex(c), emissiveMap: toTex(ce), roughnessMap: toTex(cr, false), bays, floors, win: S.win };
}

/**
 * Glass curtain wall: `bays` x `floors` panels (each bay split into two lites) with
 * mullions, slab spandrels and an emissive map of lit lift lobbies for the night view.
 */
export function makeCurtain(seed = 21) {
  const bays = 4, floors = 8, cw = 64, ch = 64;
  const W = bays * cw, H = floors * ch;
  const rand = rng(seed);
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#9fc2d6'); gr.addColorStop(0.45, '#5d8199'); gr.addColorStop(1, '#2f4a5e');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let fy = 0; fy < floors; fy++) {
    const y0 = fy * ch;
    for (let bx = 0; bx < bays; bx++) {
      const x0 = bx * cw;
      // sky reflection streak varies a little per panel
      g.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.1})`; g.fillRect(x0 + 2, y0 + 2, cw / 2 - 3, ch - 12);
      if (rand() < 0.7) { ge.fillStyle = `rgba(255,${205 + rand() * 30},${140 + rand() * 50},${0.55 + rand() * 0.4})`; ge.fillRect(x0, y0, cw, ch - 10); }
    }
    g.fillStyle = '#26323c'; g.fillRect(0, y0 + ch - 10, W, 10); // spandrel at slab
    g.fillStyle = '#c9cdd1'; g.fillRect(0, y0 + ch - 11, W, 2);
  }
  g.fillStyle = '#c9cdd1';
  for (let x = 0; x <= W; x += cw / 2) g.fillRect(x - 1, 0, x % cw ? 2 : 3, H);
  return { map: toTex(c), emissiveMap: toTex(ce), bays, floors };
}

export function makeGround() {
  const [c, g] = canvas(512);
  const rand = rng(3);
  g.fillStyle = '#87916a'; g.fillRect(0, 0, 512, 512);
  // large soft patches (wrapped so the tile repeats seamlessly)
  for (let i = 0; i < 70; i++) {
    const x = rand() * 512, y = rand() * 512, r = 30 + rand() * 80;
    const tone = rand();
    const col = tone < 0.4 ? '150,140,100' : tone < 0.75 ? '96,122,70' : '120,132,84';
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${col},0.35)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 2200; i++) {
    const r = 1 + rand() * 4;
    g.fillStyle = `rgba(${80 + rand() * 70},${100 + rand() * 50},${55 + rand() * 30},${0.12 + rand() * 0.18})`;
    g.beginPath(); g.arc(rand() * 512, rand() * 512, r, 0, 7); g.fill();
  }
  noise(g, 512, 512, 0.08, rand, 1);
  return toTex(c);
}

export function makePaving() {
  const [c, g] = canvas(256);
  const rand = rng(11);
  g.fillStyle = '#d8cfbf'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    const v = 200 + rand() * 30;
    g.fillStyle = `rgb(${v + 10},${v + 2},${v - 12})`;
    g.fillRect(x + 1, y + 1, 30, 30);
  }
  noise(g, 256, 256, 0.08, rand, 1);
  return toTex(c);
}

export function makeGrassField() {
  const [c, g] = canvas(512);
  const rand = rng(5);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#5a8f41' : '#64a049'; g.fillRect(i * 64, 0, 64, 512); }
  // worn patches in the goal mouths and centre
  for (const [x, y, r] of [[30, 256, 60], [482, 256, 60], [256, 256, 70]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(150,130,90,0.45)'); gr.addColorStop(1, 'rgba(150,130,90,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(g, 512, 512, 0.14, rand, 1);
  g.strokeStyle = 'rgba(245,245,235,0.75)'; g.lineWidth = 3;
  g.strokeRect(10, 14, 492, 484); g.beginPath(); g.moveTo(256, 14); g.lineTo(256, 498); g.stroke();
  g.beginPath(); g.arc(256, 256, 46, 0, 7); g.stroke();
  g.strokeRect(10, 170, 60, 172); g.strokeRect(442, 170, 60, 172);
  return toTex(c);
}

export function makeAsphalt() {
  const [c, g] = canvas(256);
  const rand = rng(9);
  g.fillStyle = '#4b4e53'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i++) { // repair patches and oil stains
    const x = rand() * 256, y = rand() * 256, r = 8 + rand() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const d = rand() < 0.5;
    gr.addColorStop(0, d ? 'rgba(20,20,22,0.25)' : 'rgba(120,120,120,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  noise(g, 256, 256, 0.2, rand, 1);
  return toTex(c);
}

export function makeWater() {
  const [c, g] = canvas(256);
  const rand = rng(13);
  g.fillStyle = '#2bb3d6'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256, y = rand() * 256, r = 6 + rand() * 18;
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, rand() * 3, 0, Math.PI * (0.6 + rand())); g.stroke();
  }
  return toTex(c);
}

export function makeSolar() {
  const [c, g] = canvas(128);
  g.fillStyle = '#c9ced6'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) {
    const gr = g.createLinearGradient(0, y * 32, 0, y * 32 + 30);
    gr.addColorStop(0, '#2a4f8a'); gr.addColorStop(1, '#13264a');
    g.fillStyle = gr; g.fillRect(x * 64 + 2, y * 32 + 2, 60, 28);
    g.strokeStyle = 'rgba(160,190,230,0.35)';
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x * 64 + 2 + k * 10, y * 32 + 2); g.lineTo(x * 64 + 2 + k * 10, y * 32 + 30); g.stroke(); }
  }
  return toTex(c);
}

/** Text sign rendered to a texture (used for gate arches). */
export function makeSignTexture(text, { bg = '#7d2a1d', fg = '#fff3d9', w = 512, h = 128 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg;
  g.font = `700 ${Math.floor(h * 0.42)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return toTex(c, true, false);
}

/** Glow sprite texture (lamp halos, markers). */
export function makeGlow(color = '255,210,140') {
  const [c, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${color},1)`);
  gr.addColorStop(0.25, `rgba(${color},0.55)`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return toTex(c, true, false);
}

/** Court surface with markings, stretched over the court's oriented bounding box. */
export function makeCourt(sport) {
  const [c, g] = canvas(512, 256);
  const C = {
    basketball: ['#c0623a', '#2f6f9e'],
    badminton: ['#3f8f5a', '#2e7347'],
    volleyball: ['#c96f43', '#e09a5f'],
    multi: ['#3a6fa3', '#2f5c88'],
    dirt: ['#c9a27a', '#b88f66'],
  }[sport] || ['#4c7fa8', '#3c6b92'];
  g.fillStyle = C[0]; g.fillRect(0, 0, 512, 256);
  g.fillStyle = C[1]; g.fillRect(28, 24, 456, 208);
  g.strokeStyle = '#f7f7f2'; g.lineWidth = 4;
  g.strokeRect(28, 24, 456, 208);
  g.beginPath(); g.moveTo(256, 24); g.lineTo(256, 232); g.stroke();
  if (sport === 'basketball' || sport === 'multi') {
    g.beginPath(); g.arc(256, 128, 34, 0, 7); g.stroke();
    g.fillStyle = C[0];
    g.fillRect(28, 92, 80, 72); g.strokeRect(28, 92, 80, 72);
    g.fillRect(404, 92, 80, 72); g.strokeRect(404, 92, 80, 72);
    g.beginPath(); g.arc(28, 128, 110, -Math.PI / 2.3, Math.PI / 2.3); g.stroke();
    g.beginPath(); g.arc(484, 128, 110, Math.PI - Math.PI / 2.3, Math.PI + Math.PI / 2.3); g.stroke();
  } else if (sport === 'badminton') {
    g.beginPath(); g.moveTo(28, 128); g.lineTo(484, 128); g.stroke();
    g.strokeRect(170, 24, 172, 208);
  } else {
    g.strokeRect(180, 24, 152, 208);
  }
  noise(g, 512, 256, 0.08, rng(17), 2);
  return toTex(c, true, false);
}
