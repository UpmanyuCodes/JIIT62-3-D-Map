import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import DATA from './data/campus-data.js';
import { PLACES, CATEGORIES, TOUR } from './places.js';
import { buildWorld, pointInPoly, distToSeg, ribbonGeometry, centroid } from './world.js';
import { NavGraph } from './nav.js';
import { setAnisotropy, makeGlow } from './textures.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (s) => document.querySelector(s);
hydrateIcons();
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const placeById = new Map(PLACES.map((p) => [p.id, p]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const loadStep = (msg, pct) => new Promise((r) => {
  $('#loadMsg').textContent = msg;
  $('#loadBar').style.width = pct + '%';
  requestAnimationFrame(() => setTimeout(r, 16));
});

// ---------------------------------------------------------------- renderer
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// Resolution scale adapts to the machine: start modest, step down if frames are slow, back up if there's headroom.
const DPR_MAX = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
const DPR_MIN = Math.min(DPR_MAX, mobile ? 0.7 : 0.8);
let dpr = DPR_MAX;
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // the scene is static: re-render shadows only when the sun or view centre moves
renderer.toneMapping = THREE.ACESFilmicToneMapping;
setAnisotropy(Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#cfd9e3', 380, 1900);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 9000);
camera.position.set(900, 800, 1100);

const sky = new Sky();
sky.scale.setScalar(20000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.82;

const hemi = new THREE.HemisphereLight('#dfe9ff', '#6d6450', 0.55);
const sun = new THREE.DirectionalLight('#fff1dc', 3);
sun.castShadow = true;
const SHADOW = mobile ? 1024 : 2048, SHADOW_R = mobile ? 150 : 200;
sun.shadow.mapSize.set(SHADOW, SHADOW);
Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 50, far: 1500 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
sun.shadow.radius = 2;
scene.add(hemi, sun, sun.target);
const sunDirNow = new THREE.Vector3(0, 1, 0);
const shadowCentre = new THREE.Vector3(1e9, 0, 0);
/** Keep the shadow box centred on what the user is looking at, snapped to a grid so shadows don't shimmer. */
function updateShadowCentre(force) {
  const p = walk.on ? camera.position : controls.target;
  const snap = 25, cx = Math.round(p.x / snap) * snap, cz = Math.round(p.z / snap) * snap;
  if (!force && cx === shadowCentre.x && cz === shadowCentre.z) return;
  shadowCentre.set(cx, 0, cz);
  sun.target.position.copy(shadowCentre);
  sun.position.copy(shadowCentre).addScaledVector(sunDirNow, 700);
  sun.target.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
}

// Image-based lighting: a small sky probe gives glass, water and cars believable reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
let envRT = null, envHour = -99;
function updateEnvironment(h) {
  const u = envSky.material.uniforms;
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = skyU[k].value;
  u.sunPosition.value.copy(skyU.sunPosition.value);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 2000);
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = rt.texture; envHour = h;
}

// stars + moon
const stars = (() => {
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random() * 0.95;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    pos.set([Math.sin(ph) * Math.cos(th) * 4000, Math.cos(ph) * 4000, Math.sin(ph) * Math.sin(th) * 4000], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
})();
scene.add(stars);
const moonDir = new THREE.Vector3(-0.45, 0.62, 0.35).normalize();
const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: '#f6f1e3', fog: false, transparent: true, opacity: 0 }));
moon.position.copy(moonDir).multiplyScalar(4200);
const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow('200,215,255'), fog: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
moonGlow.scale.set(700, 700, 1); moonGlow.position.copy(moon.position);
scene.add(moon, moonGlow);

// post-processing
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: mobile ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
// Bloom only runs at dusk/night (lamps, windows); during the day the pass is skipped entirely.
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.2, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const labelRenderer = new CSS2DRenderer({ element: $('#labels') });
labelRenderer.setSize(innerWidth, innerHeight);

const controls = new OrbitControls(camera, canvas);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08, minDistance: 12, maxDistance: 1200,
  maxPolarAngle: THREE.MathUtils.degToRad(84), screenSpacePanning: false, zoomToCursor: true,
  autoRotateSpeed: 0.45, panSpeed: 1.1,
});
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.target.set(0, 0, 0);

const HOME = { pos: new THREE.Vector3(205, 215, 290), target: new THREE.Vector3(-20, 0, 0) };

// ---------------------------------------------------------------- state
let world, nav;
const anchors = new Map();
const placeNode = new Map();
const labels = [];
const catOn = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, true]));
let labelsOn = true;
let selected = null;
let flight = null;
let hour = 14.5, hourTarget = 14.5, appliedHour = -1;
const TIMES = [{ k: 'Day', h: 14.5, i: 'sun' }, { k: 'Sunset', h: 17.75, i: 'sunset' }, { k: 'Night', h: 21.5, i: 'moon' }];
let timeIdx = 0;
let route = null; // { pts, length, mesh, from, to }

init();

async function init() {
  await loadStep('Reading OpenStreetMap footprints…', 15);
  let T = performance.now();
  world = buildWorld(scene, DATA, PLACES, { mobile });
  console.info('[campus] world', Math.round(performance.now() - T), 'ms'); T = performance.now();
  await loadStep('Planting trees & paving paths…', 55);
  for (const [k, v] of world.anchors) anchors.set(k, v);
  for (const p of PLACES) {
    if (p.node) {
      const n = DATA.nodes.find((n) => n.id === p.node);
      if (n) anchors.set(p.id, { x: n.x, z: n.z, y: 0, top: 4, size: 12 });
    }
    if (p.at && anchors.has(p.at)) {
      const a = anchors.get(p.at);
      anchors.set(p.id, { x: a.x + p.offset[0], z: a.z + p.offset[2], y: 0, top: 6, size: 30 });
    }
  }
  await loadStep('Mapping walking routes…', 75);
  nav = new NavGraph(DATA.ways);
  for (const p of PLACES) if (anchors.has(p.id)) placeNode.set(p.id, nav.attach(anchors.get(p.id)));
  console.info('[campus] nav', Math.round(performance.now() - T), 'ms', nav.nodes.length, 'nodes');
  await loadStep('Putting up signboards…', 90);
  buildLabels();
  buildChips();
  buildDirections();
  buildMinimap();
  applyTime(hour);
  onResize();
  await loadStep('Warming up the GPU…', 95);
  T = performance.now();
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older GPUs: compile on first frame */ }
  console.info('[campus] shaders', Math.round(performance.now() - T), 'ms');
  renderer.setAnimationLoop(loop);
  await loadStep('Welcome to campus!', 100);
  console.info('[campus] ready at', Math.round(performance.now()), 'ms');
  setTimeout(() => $('#loading').classList.add('done'), 250);
  flyTo(HOME.pos.clone(), HOME.target.clone(), 3.6);
  const hashId = decodeURIComponent(location.hash.slice(1));
  if (placeById.has(hashId)) setTimeout(() => select(hashId), 3700);
  else if (!localStorage.getItem('jiit3d-help')) setTimeout(() => $('#help').classList.add('open'), 3300);
  else setTimeout(() => toast('Tip: click any building to see what\'s inside'), 3800);
}

// ---------------------------------------------------------------- labels
function buildLabels() {
  for (const p of PLACES) {
    const a = anchors.get(p.id);
    if (!a) continue;
    const c = CATEGORIES[p.cat];
    const el = document.createElement('div');
    el.className = 'lbl' + (p.minor ? ' minor' : '');
    el.style.setProperty('--c', c.color);
    el.innerHTML = `<div class="in"><span class="ic">${icon(p.icon)}</span>${esc(p.name)}</div>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); select(p.id); });
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1);
    obj.position.set(a.x, a.top + (p.minor ? 2 : 5), a.z);
    scene.add(obj);
    labels.push({ p, el, obj });
  }
}
const occRay = new THREE.Raycaster(), occDir = new THREE.Vector3();
function updateLabels() {
  const walking = walk.on;
  for (const L of labels) {
    const d = camera.position.distanceTo(L.obj.position);
    const maxD = walking ? (L.p.minor ? 70 : 260) : L.p.minor ? 190 : 1300;
    const inTour = tour.on && TOUR[tour.i] !== L.p.id && L.p.minor;
    let show = labelsOn && catOn[L.p.cat] && d < maxD && !inTour;
    if (walking && show) {
      // hide labels that are behind buildings when walking (checked every few frames)
      if ((frame + L.obj.id) % 8 === 0) {
        occRay.set(camera.position, occDir.subVectors(L.obj.position, camera.position).normalize());
        occRay.far = d - 4;
        L.hidden = occRay.intersectObjects(world.pickables, false).some((h) => h.object.userData.place !== L.p.id);
      }
      if (L.hidden) show = false;
    } else L.hidden = false;
    L.obj.visible = show || selected === L.p.id;
    if (L.obj.visible) {
      L.el.style.opacity = selected === L.p.id ? 1 : clamp((maxD - d) / (maxD * 0.25), 0, 1);
      L.el.style.setProperty('--s', clamp(1.25 - d / 1000, 0.72, 1.12).toFixed(3));
    }
  }
}

// ---------------------------------------------------------------- selection
const selRing = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
selRing.renderOrder = 5; selRing.visible = false;
scene.add(selRing);
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#ffb36b') }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.25 * sin(uTime * 3.0)); gl_FragColor = vec4(uColor * 1.6, a); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 20, 1, true), beamMat);
beam.visible = false; beam.renderOrder = 6;
scene.add(beam);

function select(id, { fly = true, card = true } = {}) {
  const p = placeById.get(id);
  if (!p) return;
  selected = id;
  for (const L of labels) L.el.classList.toggle('sel', L.p.id === id);
  const a = anchors.get(id);
  const col = new THREE.Color(CATEGORIES[p.cat].color);
  selRing.material.color.copy(col);
  beamMat.uniforms.uColor.value.copy(col);
  if (a.poly) {
    const [cx, cz] = centroid(a.poly);
    const pts = a.poly.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * 1.6, z + (dz / l) * 1.6]; });
    pts.push(pts[0], pts[1]);
    selRing.geometry.dispose();
    selRing.geometry = ribbonGeometry(pts, 1.1, 0.5, false);
    selRing.visible = true;
    beam.visible = false;
  } else {
    selRing.visible = false;
    beam.visible = true;
    beam.scale.set(1, 40, 1);
    beam.position.set(a.x, 20, a.z);
  }
  // tint the selected building slightly
  for (const [pid, b] of world.buildingMeshes) b.wallMat.color.setScalar(pid === id ? 1.18 : 1);
  if (card && !tour.on) renderInfo(p);
  if (fly) flyToPlace(id);
  history.replaceState(null, '', '#' + id);
}
function deselect() {
  selected = null;
  selRing.visible = beam.visible = false;
  for (const L of labels) L.el.classList.remove('sel');
  for (const b of world.buildingMeshes.values()) b.wallMat.color.setScalar(1);
  $('#info').classList.remove('open');
  history.replaceState(null, '', location.pathname + location.search);
}

function hoursStatus(hours) {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const toM = (s) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  let cur = -1, next = null;
  hours.forEach(([a, b], i) => { if (m >= toM(a) && m < toM(b)) cur = i; if (next === null && toM(a) > m) next = i; });
  return { cur, next };
}

function renderInfo(p) {
  const c = CATEGORIES[p.cat];
  const info = $('#info');
  info.style.setProperty('--c', c.color);
  let hoursHtml = '';
  if (p.hours) {
    const { cur, next } = hoursStatus(p.hours);
    const status = cur >= 0
      ? `<span class="status open">Open now · ${esc(p.hours[cur][2])} until ${p.hours[cur][1]}</span>`
      : `<span class="status closed">Closed now${next !== null ? ` · ${esc(p.hours[next][2])} at ${p.hours[next][0]}` : ''}</span>`;
    hoursHtml = `<div class="hours">${status}${p.hours.map(([a, b, l], i) => `<div class="row ${i === cur ? 'now' : ''}"><span>${esc(l)}</span><span>${a} – ${b}</span></div>`).join('')}</div>`;
  }
  const tips = p.tips?.length ? `<div class="tips"><h4>${icon('bulb')} Fresher tips</h4><ul>${p.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
  const floors = p.floors ? ` · ${p.floors} floors${p.approx ? ' (approx.)' : ''}` : '';
  info.innerHTML = `
    <div class="hero">
      <button class="close" aria-label="Close">${icon('x')}</button>
      <div class="big">${icon(p.icon)}</div>
      <h2>${esc(p.name)}</h2>
      <div class="sub">${esc(p.full || c.label)}</div>
      <div class="badge">${icon(c.icon)} ${c.label}${floors}</div>
    </div>
    <div class="body">
      <p>${esc(p.desc)}</p>
      ${hoursHtml}${tips}
      <div class="actions">
        <button class="btn primary" data-act="to">${icon('route')} Route here</button>
        <button class="btn" data-act="walk">${icon('walk')} Walk here</button>
        <button class="btn" data-act="from">${icon('pin')} Route from here</button>
        <button class="btn" data-act="share">${icon('link')} Share link</button>
      </div>
      <div class="note">Info from OpenStreetMap and JIIT's public pages. Details may change, so check official notices.</div>
    </div>`;
  info.classList.add('open');
  info.querySelector('.close').onclick = deselect;
  info.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'to') openDirections(dirFrom.value && dirFrom.value !== p.id ? dirFrom.value : p.id === 'gate1' ? 'abb1' : 'gate1', p.id);
    if (act === 'from') openDirections(p.id, dirTo.value && dirTo.value !== p.id ? dirTo.value : p.id === 'abb1' ? 'mess' : 'abb1');
    if (act === 'walk') walkAt(p.id);
    if (act === 'share') {
      const url = location.href.split('#')[0] + '#' + p.id;
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast(icon('check') + ' Link copied. Send it to your friends!'), () => toast(url));
    }
  }));
}

// ---------------------------------------------------------------- camera flights
function flyTo(pos, target, dur = 1.6) {
  const d = camera.position.distanceTo(pos);
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur: dur * 1000, lift: Math.min(d * 0.25, 120) };
}
function flyToPlace(id, { dist, elev = 0.6 } = {}) {
  const a = anchors.get(id);
  const tgt = new THREE.Vector3(a.x, Math.min(a.top * 0.35, 18), a.z);
  const D = dist || clamp(a.size * 1.9 + a.top * 1.3, 55, 280);
  const off = camera.position.clone().sub(controls.target); off.y = 0;
  if (off.lengthSq() < 1) off.set(1, 0, 1);
  off.normalize();
  const pos = tgt.clone().addScaledVector(off, D * Math.cos(elev)).setY(tgt.y + D * Math.sin(elev));
  if (tour.on || (mobile && $('#info').classList.contains('open'))) tgt.y -= D * 0.16;
  flyTo(pos, tgt);
}
function updateFlight(now) {
  const t = clamp((now - flight.start) / flight.dur, 0, 1), k = ease(t);
  camera.position.lerpVectors(flight.p0, flight.p1, k);
  camera.position.y += Math.sin(Math.PI * k) * flight.lift;
  controls.target.lerpVectors(flight.t0, flight.t1, k);
  camera.lookAt(controls.target);
  if (t >= 1) flight = null;
}
controls.addEventListener('start', () => {
  flight = null;
  if (tour.on && tour.playing) setTourPlaying(false);
});

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null, hoverId = null, hoverPending = false;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(world.pickables, false)[0];
  return hit?.object.userData.place || null;
}
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || walk.on) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved < 6 && performance.now() - down.t < 600) {
    const id = pick(e);
    if (id) select(id); else if (selected) deselect();
  }
  down = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (walk.on || mobile || hoverPending) return;
  hoverPending = true;
  requestAnimationFrame(() => {
    hoverPending = false;
    const id = pick(e);
    if (id !== hoverId) {
      hoverId = id;
      canvas.style.cursor = id ? 'pointer' : '';
      for (const L of labels) L.el.classList.toggle('hov', L.p.id === id);
    }
  });
});

// ---------------------------------------------------------------- search
const ALIASES = {
  abb1: 'classes lectures labs lab classroom tutorial faculty academic block cabins', abb3: 'admin administration office fees accounts id card tower registrar hostel', lrc: 'library books study read computer lab',
  abb2: 'auditorium jbs business school seminar orientation event hall', oat: 'stage fest concert events open air theatre cultural', sac: 'clubs hubs activity society μcr ucr',
  ground: 'football cricket sports field play run', pool: 'swim swimming', mess: 'canteen food dining breakfast lunch dinner eat meal', cafe: 'coffee snacks canteen tea food eat',
  a2z: 'shop store stationery buy convenience', gym: 'fitness workout', parking: 'car bike vehicle park', gate1: 'entry main entrance', gate2: 'entry entrance', backgate: 'exit back gate gate 3 three',
  sarojini: 'hostel girls', rajendra: 'hostel', h4: 'hostel', h5: 'hostel', n7: 'hostel', mandir: 'temple pray', faculty: 'staff housing teachers teacher faculty residence park',
};
const searchEl = $('#search'), resultsEl = $('#results');
let resIdx = 0, resList = [];
function doSearch() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) { resultsEl.classList.remove('open'); return; }
  resList = PLACES.map((p) => {
    const n = p.name.toLowerCase(), f = (p.full || '').toLowerCase();
    let s = 0;
    if (n.startsWith(q)) s = 100; else if (n.includes(q)) s = 70; else if (f.includes(q)) s = 55;
    else if ((ALIASES[p.id] || '').includes(q)) s = 45; else if (CATEGORIES[p.cat].label.toLowerCase().includes(q)) s = 30; else if (p.desc.toLowerCase().includes(q)) s = 20;
    return { p, s: s - (p.minor ? 5 : 0) };
  }).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((r) => r.p);
  resIdx = 0;
  resultsEl.innerHTML = resList.length ? resList.map((p, i) => `<div class="res ${i === 0 ? 'act' : ''}" data-id="${p.id}" style="--c:${CATEGORIES[p.cat].color}"><div class="ic">${icon(p.icon)}</div><div><b>${esc(p.name)}</b><small>${esc(p.full || CATEGORIES[p.cat].label)}</small></div></div>`).join('') : '<div class="res"><small>No match. Try "library", "mess" or "hostel".</small></div>';
  resultsEl.classList.add('open');
  resultsEl.querySelectorAll('[data-id]').forEach((el) => (el.onclick = () => chooseResult(el.dataset.id)));
}
function chooseResult(id) {
  if (walk.on) exitWalk();
  select(id);
  searchEl.value = '';
  resultsEl.classList.remove('open');
  searchEl.blur();
}
searchEl.addEventListener('input', doSearch);
searchEl.addEventListener('focus', doSearch);
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    resIdx = clamp(resIdx + (e.key === 'ArrowDown' ? 1 : -1), 0, resList.length - 1);
    resultsEl.querySelectorAll('.res').forEach((el, i) => el.classList.toggle('act', i === resIdx));
  } else if (e.key === 'Enter' && resList[resIdx]) chooseResult(resList[resIdx].id);
  else if (e.key === 'Escape') { searchEl.blur(); resultsEl.classList.remove('open'); }
});
document.addEventListener('pointerdown', (e) => { if (!$('#searchWrap').contains(e.target)) resultsEl.classList.remove('open'); });

// ---------------------------------------------------------------- category chips
function buildChips() {
  const wrap = $('#chips');
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.style.setProperty('--c', c.color);
    b.innerHTML = `<span class="dot"></span>${c.label}`;
    b.onclick = () => { catOn[k] = !catOn[k]; b.classList.toggle('off', !catOn[k]); };
    wrap.appendChild(b);
  }
}

// ---------------------------------------------------------------- directions
const dirFrom = $('#dirFrom'), dirTo = $('#dirTo');
const routeMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#4cc9f0') } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
      float c = fract(vUv.y * 0.55 + abs(vUv.x - 0.5) * 0.9 - uTime * 1.1);
      float arrow = smoothstep(0.0, 0.06, c) * smoothstep(0.36, 0.26, c);
      vec3 col = mix(uColor * 0.9, vec3(1.0), arrow * 0.9);
      gl_FragColor = vec4(col * 1.4, (0.6 + arrow * 0.4) * edge);
    }`,
  transparent: true, depthWrite: false,
});
routeMat.uniforms.uAlpha = { value: 1 };
routeMat.fragmentShader = routeMat.fragmentShader.replace('uniform float uTime;', 'uniform float uTime; uniform float uAlpha;').replace('* edge);', '* edge * uAlpha);');
const routeGhost = routeMat.clone();
routeGhost.uniforms = { uTime: routeMat.uniforms.uTime, uColor: routeMat.uniforms.uColor, uAlpha: { value: 0.35 } };
routeGhost.depthTest = false;
const pinA = makePin('#1dd1a1'), pinB = makePin('#ff6b6b');
function makePin(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.3 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), m); head.position.y = 6.5;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.35, 4.2, 20), m); tip.rotation.x = Math.PI; tip.position.y = 4.1;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); dot.position.set(0, 6.5, 0); dot.scale.set(1, 1, 1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.4, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45;
  g.add(head, tip, ring); g.visible = false; g.userData.ring = ring; g.userData.head = [head, tip];
  head.castShadow = tip.castShadow = true;
  scene.add(g);
  return g;
}
function buildDirections() {
  const opts = [...PLACES].sort((a, b) => (a.minor ? 1 : 0) - (b.minor ? 1 : 0) || a.name.localeCompare(b.name))
    .filter((p) => placeNode.has(p.id))
    .map((p) => `<option value="${p.id}">${esc(p.name)}${p.full ? ' · ' + esc(p.full) : ''}</option>`).join('');
  dirFrom.innerHTML = opts; dirTo.innerHTML = opts;
  dirFrom.value = 'gate1'; dirTo.value = 'abb1';
  dirFrom.onchange = dirTo.onchange = () => computeRoute(true);
  $('#dirSwap').onclick = () => { const f = dirFrom.value; dirFrom.value = dirTo.value; dirTo.value = f; computeRoute(true); };
  $('#dirClose').onclick = closeDirections;
}
function openDirections(from, to) {
  if (tour.on) stopTour();
  if (from) dirFrom.value = from;
  if (to) dirTo.value = to;
  $('#dir').classList.add('open');
  $('#tbDir').classList.add('on');
  if (mobile) $('#info').classList.remove('open');
  computeRoute(true);
}
function closeDirections() {
  $('#dir').classList.remove('open');
  $('#tbDir').classList.remove('on');
  clearRoute();
}
function clearRoute() {
  if (route?.mesh) { scene.remove(route.mesh, route.ghost); route.mesh.geometry.dispose(); }
  route = null; pinA.visible = pinB.visible = false;
}
function computeRoute(frame) {
  clearRoute();
  const a = dirFrom.value, b = dirTo.value;
  const res = $('#dirResult');
  if (a === b) { res.innerHTML = '<span style="color:var(--muted)">Pick two different places.</span>'; return; }
  const r = nav.route(placeNode.get(a), placeNode.get(b));
  if (!r) { res.innerHTML = 'No walking path found in the map data.'; return; }
  const pts = simplify(r.pts);
  const mesh = new THREE.Mesh(ribbonGeometry(pts, 4, 0.6, true), routeMat);
  mesh.renderOrder = 4;
  const ghost = new THREE.Mesh(mesh.geometry, routeGhost);
  ghost.renderOrder = 3;
  scene.add(ghost, mesh);
  route = { pts, length: r.length, mesh, ghost, from: a, to: b };
  pinA.position.set(pts[0][0], 0, pts[0][1]); pinB.position.set(pts.at(-1)[0], 0, pts.at(-1)[1]);
  pinA.visible = pinB.visible = true;
  // landmarks along the way
  const via = PLACES.filter((p) => p.id !== a && p.id !== b && !p.minor && anchors.has(p.id) && p.cat !== 'gate').filter((p) => {
    const an = anchors.get(p.id);
    const R = an.poly ? 6 : 14;
    for (let i = 1; i < pts.length; i++) {
      const [d] = distToSeg(an.x, an.z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (an.poly ? distPolySeg(an.poly, pts[i - 1], pts[i]) < R : d < R) return true;
    }
    return false;
  }).slice(0, 4);
  const mins = Math.max(1, Math.round(r.length / 1.25 / 60));
  res.innerHTML = `
    <div style="display:flex;gap:16px;align-items:baseline"><span class="big">${mins} min</span><span style="color:var(--muted)">${Math.round(r.length)} m walk</span></div>
    ${via.length ? `<div style="margin-top:6px;color:#d9deea">Passes ${via.map((p) => `<span class="via">${icon(p.icon)}${esc(p.name)}</span>`).join(' ')}</div>` : ''}
    <div class="actions" style="margin-top:10px">
      <button class="btn primary" id="walkRoute">${icon('play')} Walk it in 3D</button>
      <button class="btn" id="viewRoute">${icon('frame')} Overview</button>
    </div>`;
  $('#walkRoute').onclick = () => walkRoute();
  $('#viewRoute').onclick = () => frameRoute();
  if (frame) frameRoute();
}
function distPolySeg(poly, a, b) {
  let best = Infinity;
  for (const [x, z] of poly) best = Math.min(best, distToSeg(x, z, a[0], a[1], b[0], b[1])[0]);
  for (const p of [a, b]) for (let i = 0; i < poly.length; i++) { const q = poly[i], r = poly[(i + 1) % poly.length]; best = Math.min(best, distToSeg(p[0], p[1], q[0], q[1], r[0], r[1])[0]); }
  return best;
}
function simplify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = out.at(-1);
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.8 || i === pts.length - 1) out.push(p);
  }
  return out;
}
function frameRoute() {
  if (!route) return;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of route.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = Math.max(x1 - x0, z1 - z0, 60);
  const D = span * (mobile ? 2.1 : 1.4) + 60;
  const o = new THREE.Vector3(0.25, 0, 0.55).normalize();
  // push the route to the right of the screen on desktop so the directions panel doesn't cover it
  const shift = mobile ? 0 : span * 0.32;
  const tx = cx - (-(-o.z)) * shift, tz = cz - (-o.x) * shift;
  flyTo(new THREE.Vector3(tx + o.x * D * 0.6, D * 0.85, tz + o.z * D * 0.6), new THREE.Vector3(tx, 0, tz), 1.5);
}

// ---------------------------------------------------------------- walk mode
function lockPointer() { try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch (e) { /* needs a user gesture */ } }
const walk = { on: false, yaw: 0, pitch: 0, vel: new THREE.Vector3(), keys: {}, joy: { x: 0, y: 0 }, auto: null, bob: 0, drag: null };
const hud = $('#walkHud');
function hudText() {
  if (walk.auto) return `${icon('walk')} Walking to <b>${esc(placeById.get(route.to).name)}</b>… <button class="btn sm" id="stopAuto">${icon('stop')} Stop</button>`;
  if (mobile) return `Joystick to move · drag to look <button class="btn sm" id="exitWalkBtn">${icon('x')} Exit</button>`;
  const locked = document.pointerLockElement === canvas;
  return `${locked ? '' : '<b>Click</b> to look around · '}<kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · ${locked ? '<kbd>Esc</kbd> release mouse' : '<kbd>Esc</kbd> / <kbd>V</kbd> exit'} <button class="btn sm" id="exitWalkBtn">${icon('x')} Exit</button>`;
}
function refreshHud() {
  hud.innerHTML = hudText();
  $('#exitWalkBtn')?.addEventListener('click', exitWalk);
  $('#stopAuto')?.addEventListener('click', () => { walk.auto = null; refreshHud(); });
}
function enterWalk(x, z, yaw) {
  if (tour.on) stopTour();
  flight = null;
  walk.on = true;
  controls.enabled = false;
  controls.autoRotate = false;
  const p = new THREE.Vector3(x, 1.7, z);
  collide(p);
  camera.position.copy(p);
  if (yaw === undefined) {
    const d = controls.target.clone().sub(camera.position);
    yaw = Math.atan2(-d.x, -d.z);
  }
  walk.yaw = yaw; walk.pitch = -0.02;
  walk.vel.set(0, 0, 0);
  camera.near = 0.1; camera.updateProjectionMatrix();
  hud.classList.add('open');
  $('#cross').style.display = mobile ? 'none' : 'block';
  $('#joy').style.display = mobile ? 'block' : 'none';
  $('#tbWalk').classList.add('on');
  $('#info').classList.remove('open');
  refreshHud();
  if (!mobile && !walk.auto) lockPointer();
}
function exitWalk() {
  if (!walk.on) return;
  walk.on = false; walk.auto = null;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.classList.remove('open');
  $('#cross').style.display = 'none';
  $('#joy').style.display = 'none';
  $('#tbWalk').classList.remove('on');
  camera.near = 0.5; camera.updateProjectionMatrix();
  const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  const tgt = camera.position.clone().addScaledVector(f, 25).setY(0);
  controls.target.copy(camera.position).setY(0);
  controls.enabled = true;
  flyTo(tgt.clone().addScaledVector(f, -90).setY(75), tgt, 1.4);
}
function walkAt(id) {
  const a = anchors.get(id);
  const n = nav.nodes[placeNode.get(id)];
  let x = n.x, z = n.z;
  const dx = a.x - x, dz = a.z - z, l = Math.hypot(dx, dz) || 1;
  if (a.poly) { x -= (dx / l) * 7; z -= (dz / l) * 7; }
  else { x -= 8; }
  enterWalk(x, z, Math.atan2(-(a.x - x), -(a.z - z)));
}
function walkRoute() {
  if (!route) return;
  const pts = route.pts, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  walk.auto = { pts, cum, s: 0 };
  const [p1] = pointAt(walk.auto, 4);
  enterWalk(pts[0][0], pts[0][1], Math.atan2(-(p1[0] - pts[0][0]), -(p1[1] - pts[0][1])));
}
function pointAt(auto, s) {
  const { pts, cum } = auto;
  s = clamp(s, 0, cum.at(-1));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [[pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]];
}
function collide(p, r = 0.45) {
  for (const c of world.colliders) {
    if (c.pass) continue; // open ground floor (ABB-3 wings)
    if (p.x < c.bb.x0 - r || p.x > c.bb.x1 + r || p.z < c.bb.z0 - r || p.z > c.bb.z1 + r) continue;
    let best = Infinity, qx = 0, qz = 0;
    const P = c.poly;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const [d, x, z] = distToSeg(p.x, p.z, a[0], a[1], b[0], b[1]);
      if (d < best) { best = d; qx = x; qz = z; }
    }
    const inside = pointInPoly(p.x, p.z, P);
    if (inside) {
      const dx = qx - p.x, dz = qz - p.z, l = Math.hypot(dx, dz) || 1;
      p.x = qx + (dx / l) * r; p.z = qz + (dz / l) * r;
    } else if (best < r) {
      const dx = p.x - qx, dz = p.z - qz, l = best || 1;
      p.x = qx + (dx / l) * r; p.z = qz + (dz / l) * r;
    }
  }
  const R = Math.hypot(p.x, p.z);
  if (R > 700) { p.x *= 700 / R; p.z *= 700 / R; }
}
function updateWalk(dt) {
  if (walk.auto) {
    const A = walk.auto;
    A.s += dt * 6.5;
    const [p] = pointAt(A, A.s), [ahead] = pointAt(A, A.s + 7);
    camera.position.set(p[0], 1.75, p[1]);
    const want = Math.atan2(-(ahead[0] - p[0]), -(ahead[1] - p[1]));
    let d = want - walk.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    walk.yaw += d * Math.min(1, dt * 3);
    walk.pitch = lerp(walk.pitch, -0.05, dt * 2);
    if (A.s >= A.cum.at(-1)) {
      walk.auto = null;
      const dest = route.to;
      exitWalk();
      setTimeout(() => select(dest), 200);
      toast(`${icon('flagEnd')} You've reached ${esc(placeById.get(dest).name)}`);
    }
  } else {
    const k = walk.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + walk.joy.y;
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + walk.joy.x;
    const speed = k.ShiftLeft || k.ShiftRight ? 9.5 : 4.3;
    const f = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
    const r = new THREE.Vector3(Math.cos(walk.yaw), 0, -Math.sin(walk.yaw));
    const want = f.multiplyScalar(fwd).addScaledVector(r, side);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    walk.vel.lerp(want, Math.min(1, dt * 8));
    const p = camera.position.clone().addScaledVector(walk.vel, dt);
    collide(p);
    const v = walk.vel.length();
    walk.bob += dt * v * 1.9;
    p.y = 1.7 + Math.sin(walk.bob) * 0.045 * Math.min(1, v / 4);
    camera.position.copy(p);
  }
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
}
document.addEventListener('keydown', (e) => { if (walk.on && !isTyping()) { walk.keys[e.code] = true; if (walk.auto && /Key[WASD]|Arrow/.test(e.code)) { walk.auto = null; refreshHud(); } } });
document.addEventListener('keyup', (e) => { walk.keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (walk.on && document.pointerLockElement === canvas && !walk.auto) {
    walk.yaw -= e.movementX * 0.0022;
    walk.pitch = clamp(walk.pitch - e.movementY * 0.0022, -1.3, 1.3);
  }
});
document.addEventListener('pointerlockchange', () => { if (walk.on) refreshHud(); });
canvas.addEventListener('click', () => { if (walk.on && !mobile && !walk.auto && document.pointerLockElement !== canvas) lockPointer(); });
canvas.addEventListener('pointerdown', (e) => { if (walk.on && (mobile || !document.pointerLockElement)) walk.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
window.addEventListener('pointermove', (e) => {
  if (!walk.on || !walk.drag || walk.drag.id !== e.pointerId || walk.auto) return;
  walk.yaw -= (e.clientX - walk.drag.x) * 0.005;
  walk.pitch = clamp(walk.pitch - (e.clientY - walk.drag.y) * 0.005, -1.3, 1.3);
  walk.drag.x = e.clientX; walk.drag.y = e.clientY;
});
window.addEventListener('pointerup', (e) => { if (walk.drag?.id === e.pointerId) walk.drag = null; });
// virtual joystick
{
  const joy = $('#joy'), knob = joy.querySelector('i');
  let jid = null;
  const move = (e) => {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy), max = r.width / 2 - 10;
    if (l > max) { dx *= max / l; dy *= max / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    walk.joy.x = dx / max; walk.joy.y = -dy / max;
  };
  joy.addEventListener('pointerdown', (e) => { e.stopPropagation(); jid = e.pointerId; joy.setPointerCapture(jid); move(e); if (walk.auto) { walk.auto = null; refreshHud(); } });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) move(e); });
  const end = (e) => { if (e.pointerId !== jid) return; jid = null; knob.style.transform = ''; walk.joy.x = walk.joy.y = 0; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- guided tour
const tour = { on: false, i: 0, playing: true, timer: 0 };
const TOUR_STOP = 9;
function startTour() {
  if (walk.on) exitWalk();
  closeDirections();
  $('#info').classList.remove('open');
  tour.on = true; tour.i = 0;
  $('#tour').classList.add('open');
  $('#tbTour').classList.add('on');
  setTourPlaying(true);
  goTour(0);
}
function stopTour() {
  tour.on = false;
  controls.autoRotate = false;
  $('#tour').classList.remove('open');
  $('#tbTour').classList.remove('on');
}
function setTourPlaying(v) { tour.playing = v; $('#tourPlay').innerHTML = icon(v ? 'pause' : 'play'); $('#tourPlay').title = v ? 'Pause' : 'Play'; }
function goTour(i) {
  tour.i = clamp(i, 0, TOUR.length - 1);
  tour.timer = 0;
  const p = placeById.get(TOUR[tour.i]);
  select(p.id, { fly: false, card: false });
  const a = anchors.get(p.id);
  flyToPlace(p.id, { elev: 0.5, dist: clamp(a.size * 2.4 + a.top * 1.5, 70, 300) });
  $('#tourStep').textContent = `Stop ${tour.i + 1} of ${TOUR.length} · ${CATEGORIES[p.cat].label}`;
  $('#tourTitle').innerHTML = `${icon(p.icon)} ${esc(p.full || p.name)}`;
  $('#tourText').textContent = p.tour || p.desc;
  $('#tourBar').style.width = ((tour.i + 1) / TOUR.length) * 100 + '%';
  $('#tourNext').innerHTML = tour.i === TOUR.length - 1 ? `Finish ${icon('check')}` : `Next ${icon('right')}`;
}
$('#tourNext').onclick = () => { if (tour.i === TOUR.length - 1) { stopTour(); toast(icon('check') + ' Tour complete. Now explore on your own!'); flyTo(HOME.pos.clone(), HOME.target.clone(), 2.2); } else goTour(tour.i + 1); };
$('#tourPrev').onclick = () => goTour(tour.i - 1);
$('#tourPlay').onclick = () => setTourPlaying(!tour.playing);
$('#tourClose').onclick = stopTour;

// ---------------------------------------------------------------- time of day
const C = (h) => new THREE.Color(h);
const FOG = { day: C('#cbd8e6'), dusk: C('#e9b48e'), night: C('#0c1424') };
const tmpC = new THREE.Color();
function applyTime(h) {
  const elevDeg = 58 * Math.sin((Math.PI * (h - 6)) / 12); // ~28°N: the sun never gets fully overhead
  const el = THREE.MathUtils.degToRad(elevDeg), az = (Math.PI * (h - 6)) / 12;
  const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.85 + 0.15).normalize();
  const night = smooth(3, -7, elevDeg);
  const dusk = (1 - smooth(4, 26, elevDeg)) * (1 - night);
  skyU.sunPosition.value.copy(sunDir);
  skyU.turbidity.value = lerp(3.5, 9, dusk);
  skyU.rayleigh.value = lerp(1.1, 2.6, dusk) * (1 - night * 0.7);
  const dayI = 3.4 * smooth(-2, 12, elevDeg);
  const moonI = 0.55 * night;
  if (dayI > moonI) {
    sunDirNow.copy(sunDir);
    sun.color.copy(C('#fff1dc')).lerp(C('#ffa860'), dusk);
    sun.intensity = dayI;
  } else {
    sunDirNow.copy(moonDir);
    sun.color.set('#9fb6ff');
    sun.intensity = moonI;
  }
  updateShadowCentre(true);
  hemi.intensity = lerp(0.5, 0.3, night);
  hemi.color.copy(C('#dfe9ff')).lerp(C('#ffd2ae'), dusk).lerp(C('#5b6fa8'), night);
  hemi.groundColor.copy(C('#7a6e55')).lerp(C('#1b1d29'), night);
  tmpC.copy(FOG.day).lerp(FOG.dusk, dusk).lerp(FOG.night, night);
  scene.fog.color.copy(tmpC);
  renderer.toneMappingExposure = lerp(0.6, 0.9, night) + dusk * 0.05;
  scene.environmentIntensity = lerp(0.16, 0.05, night);
  bloom.strength = lerp(0.12, 0.85, night) + dusk * 0.1;
  bloom.threshold = lerp(0.92, 0.55, night);
  bloom.enabled = night + dusk > 0.15;
  stars.material.opacity = night;
  moon.material.opacity = night; moonGlow.material.opacity = night * 0.5;
  sky.visible = night < 0.999;
  scene.background = night > 0.98 ? FOG.night : null;
  world.setNight(night);
  // re-bake the reflection probe only every ~half hour of sun movement (it costs a few ms)
  if (Math.abs(h - envHour) > 0.5 || (Math.abs(h - hourTarget) < 0.01 && h !== envHour)) updateEnvironment(h);
}
function cycleTime() {
  timeIdx = (timeIdx + 1) % TIMES.length;
  hourTarget = TIMES[timeIdx].h;
  $('#tbTime .icn').outerHTML = icon(TIMES[timeIdx].i);
  $('#timeLbl').textContent = TIMES[timeIdx].k;
}

// ---------------------------------------------------------------- minimap & compass
const mini = $('#mini');
const mctx = mini.getContext('2d');
let miniStatic, miniS = 1;
function w2m(x, z) { return [mini.width / 2 + (x + 0) * miniS, mini.height / 2 + (z - 0) * miniS]; }
function buildMinimap() {
  const dpr = Math.min(devicePixelRatio, 2);
  mini.width = mini.clientWidth * dpr; mini.height = mini.clientHeight * dpr;
  miniS = mini.width / 400;
  miniStatic = document.createElement('canvas');
  miniStatic.width = mini.width; miniStatic.height = mini.height;
  const g = miniStatic.getContext('2d');
  g.fillStyle = '#121624'; g.fillRect(0, 0, mini.width, mini.height);
  const poly = (pts, fill, stroke) => {
    g.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = w2m(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = dpr; g.stroke(); }
  };
  for (const w of DATA.ways) {
    g.strokeStyle = w.inside ? '#5b6077' : '#2c3245';
    g.lineWidth = (w.inside ? 1.6 : ['trunk', 'motorway', 'secondary'].includes(w.hw) ? 4 : 2) * dpr;
    g.beginPath(); w.pts.forEach(([x, z], i) => { const [a, b] = w2m(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
  }
  poly(DATA.campus, 'rgba(255,159,67,0.07)', 'rgba(255,159,67,0.7)');
  for (const a of DATA.areas) if (a.inside) poly(a.poly, a.kind === 'swimming_pool' ? '#2bb3d6' : a.kind === 'grass' ? '#4e8a3c' : a.kind === 'pitch' ? '#2f7d6a' : null);
  const byOsm = new Map(PLACES.filter((p) => p.osm).map((p) => [p.osm, p]));
  for (const b of DATA.buildings) {
    const p = byOsm.get(b.id);
    poly(b.outline || b.poly, p ? CATEGORIES[p.cat].color : b.inside ? '#8a8fa3' : '#3a4055');
  }
}
function drawMinimap() {
  if (!miniStatic) return;
  const g = mctx, dpr = mini.width / mini.clientWidth;
  g.drawImage(miniStatic, 0, 0);
  if (route) {
    g.strokeStyle = '#4cc9f0'; g.lineWidth = 2.5 * dpr; g.lineJoin = 'round';
    g.beginPath(); route.pts.forEach(([x, z], i) => { const [a, b] = w2m(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
  }
  if (selected) {
    const a = anchors.get(selected); const [mx, my] = w2m(a.x, a.z);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my, 3 * dpr, 0, 7); g.fill();
  }
  const f = new THREE.Vector3(); camera.getWorldDirection(f);
  const heading = Math.atan2(f.x, -f.z);
  const p = walk.on ? camera.position : controls.target;
  const [cx, cy] = w2m(p.x, p.z);
  g.save(); g.translate(cx, cy); g.rotate(heading);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 34 * dpr);
  grad.addColorStop(0, 'rgba(76,201,240,0.55)'); grad.addColorStop(1, 'rgba(76,201,240,0)');
  g.fillStyle = grad; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 34 * dpr, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
  g.fillStyle = '#4cc9f0'; g.strokeStyle = '#fff'; g.lineWidth = 1.5 * dpr;
  g.beginPath(); g.arc(0, 0, 4 * dpr, 0, 7); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,.8)'; g.font = `700 ${10 * dpr}px system-ui`; g.fillText('N', 7 * dpr, 14 * dpr);
  $('#compass .rose').style.transform = `rotate(${-heading}rad)`;
}
mini.addEventListener('click', (e) => {
  const r = mini.getBoundingClientRect();
  const x = ((e.clientX - r.left) * (mini.width / r.width) - mini.width / 2) / miniS;
  const z = ((e.clientY - r.top) * (mini.height / r.height) - mini.height / 2) / miniS;
  if (walk.on) { const p = new THREE.Vector3(x, 1.7, z); collide(p); camera.position.copy(p); return; }
  const off = camera.position.clone().sub(controls.target);
  const t = new THREE.Vector3(x, 0, z);
  flyTo(t.clone().add(off), t, 1.2);
});
$('#compass').onclick = () => {
  if (walk.on) { walk.yaw = 0; return; }
  const off = camera.position.clone().sub(controls.target);
  const hd = Math.hypot(off.x, off.z);
  flyTo(controls.target.clone().add(new THREE.Vector3(0, off.y, hd)), controls.target.clone(), 1);
};

// ---------------------------------------------------------------- toolbar & keys
let topDown = false;
$('#tbTour').onclick = () => (tour.on ? stopTour() : startTour());
$('#tbDir').onclick = () => ($('#dir').classList.contains('open') ? closeDirections() : openDirections(dirFrom.value, selected && selected !== dirFrom.value ? selected : dirTo.value));
$('#tbWalk').onclick = () => {
  if (walk.on) return exitWalk();
  if (selected) return walkAt(selected);
  enterWalk(controls.target.x, controls.target.z);
};
$('#tbTime').onclick = cycleTime;
$('#tbLabels').onclick = () => { labelsOn = !labelsOn; $('#tbLabels').classList.toggle('on', labelsOn); };
$('#tbTop').onclick = () => {
  if (walk.on) exitWalk();
  topDown = !topDown;
  const t = controls.target.clone();
  if (topDown) flyTo(new THREE.Vector3(t.x, 430, t.z + 1), new THREE.Vector3(t.x, 0, t.z), 1.4);
  else flyTo(HOME.pos.clone().sub(HOME.target).add(t), t, 1.4);
  $('#tbTop').classList.toggle('on', topDown);
};
$('#tbReset').onclick = () => { if (walk.on) exitWalk(); topDown = false; $('#tbTop').classList.remove('on'); flyTo(HOME.pos.clone(), HOME.target.clone(), 1.8); };
$('#tbHelp').onclick = () => $('#help').classList.add('open');
const closeHelp = () => { $('#help').classList.remove('open'); localStorage.setItem('jiit3d-help', '1'); };
$('#helpClose').onclick = closeHelp;
$('#helpTour').onclick = () => { closeHelp(); startTour(); };
$('#help').addEventListener('click', (e) => { if (e.target.id === 'help') closeHelp(); });

function isTyping() { const t = document.activeElement; return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }
document.addEventListener('keydown', (e) => {
  if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    if ($('#help').classList.contains('open')) return closeHelp();
    if (walk.on) return exitWalk();
    if (tour.on) return stopTour();
    if ($('#dir').classList.contains('open')) return closeDirections();
    if (selected) return deselect();
  }
  if (k === 'v') return walk.on ? exitWalk() : $('#tbWalk').click();
  if (walk.on) return;
  if (k === '/') { e.preventDefault(); searchEl.focus(); }
  else if (k === 't') $('#tbTour').click();
  else if (k === 'd') $('#tbDir').click();
  else if (k === 'n') cycleTime();
  else if (k === 'l') $('#tbLabels').click();
  else if (k === 'r') $('#tbReset').click();
  else if (k === 'h' || k === '?') $('#tbHelp').click();
  else if (tour.on && k === 'arrowright') $('#tourNext').click();
  else if (tour.on && k === 'arrowleft') $('#tourPrev').click();
});

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------------------------------------------------------------- resize & loop
function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  labelRenderer.setSize(w, h);
  if (world) buildMinimap();
}
addEventListener('resize', onResize);

// ---- render scheduling: full frame rate only while something moves, otherwise a trickle ----
const clock = new THREE.Clock();
let frame = 0, lastRender = 0, activeUntil = 0;
const wake = (ms = 700) => { activeUntil = Math.max(activeUntil, performance.now() + ms); };
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) addEventListener(ev, () => wake(), { passive: true, capture: true });
addEventListener('resize', () => wake());
const IDLE_MS = 1000 / 8, ANIM_MS = 1000 / 30;
// adaptive resolution
const perf = { ema: 16.7, since: 0, lastDrop: 0 };
function setDpr(v) {
  dpr = clamp(Math.round(v * 100) / 100, DPR_MIN, DPR_MAX);
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
}
function tunePerformance(frameMs, now) {
  perf.ema += (frameMs - perf.ema) * 0.08;
  if (now - perf.since < 1500) return;
  perf.since = now;
  if (perf.ema > 24 && dpr > DPR_MIN) { setDpr(dpr - 0.15); perf.lastDrop = now; perf.ema = 16.7; }
  else if (perf.ema < 17.5 && dpr < DPR_MAX && now - perf.lastDrop > 8000) setDpr(dpr + 0.1);
}
document.addEventListener('visibilitychange', () => { clock.getDelta(); wake(); });

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, now = performance.now();
  let moving = walk.on || !!flight || (tour.on && tour.playing);
  if (walk.on) updateWalk(dt);
  else {
    if (flight) updateFlight(now);
    controls.autoRotate = tour.on && !flight && tour.playing;
    if (!flight && controls.update()) moving = true;
    const tg = controls.target;
    tg.x = clamp(tg.x, -650, 650); tg.z = clamp(tg.z, -650, 650); tg.y = clamp(tg.y, 0, 60);
    if (camera.position.y < 3) camera.position.y = 3;
  }
  if (hour !== hourTarget) {
    hour += (hourTarget - hour) * Math.min(1, dt * 1.6);
    if (Math.abs(hourTarget - hour) < 0.01) hour = hourTarget;
    moving = true;
  }
  if (Math.abs(hour - appliedHour) > 0.002) { applyTime(hour); appliedHour = hour; }
  if (tour.on && tour.playing && !flight) {
    tour.timer += dt;
    if (tour.timer > TOUR_STOP) { if (tour.i < TOUR.length - 1) goTour(tour.i + 1); else setTourPlaying(false); }
  }
  const active = moving || now < activeUntil;
  const interval = active ? 0 : route || selected ? ANIM_MS : IDLE_MS;
  const since = now - lastRender;
  if (since < interval - 2) return;
  if (active && since < 100) tunePerformance(since, now);
  lastRender = now;

  updateShadowCentre(false);
  world.update(t);
  routeMat.uniforms.uTime.value = t;
  beamMat.uniforms.uTime.value = t;
  selRing.material.opacity = 0.55 + 0.35 * Math.sin(t * 3);
  for (const pin of [pinA, pinB]) if (pin.visible) {
    const ps = walk.on ? 0.6 : clamp(camera.position.distanceTo(pin.position) / 110, 1, 5);
    pin.scale.setScalar(ps);
    for (const m of pin.userData.head) m.position.y = (m.geometry.type === 'SphereGeometry' ? 6.5 : 4.1) + Math.sin(t * 2.5) * 0.5;
    const s = 1 + ((t * 0.8) % 1) * 1.8; pin.userData.ring.scale.set(s, s, s); pin.userData.ring.material.opacity = 0.7 * (1 - ((t * 0.8) % 1));
  }
  updateLabels();
  composer.render();
  labelRenderer.render(scene, camera);
  if (frame++ % 2 === 0 || !active) drawMinimap();
}

// debug handle (harmless; handy for tweaking from the browser console)
window.__campus = { camera, controls, flyTo, select, scene, renderer, getDpr: () => dpr, exitWalk, getRoute: () => route, V3: (x, y, z) => new THREE.Vector3(x, y, z) };
