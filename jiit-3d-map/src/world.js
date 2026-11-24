// Builds the 3D campus from OpenStreetMap geometry plus hand-tuned details.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

// ---------- geometry helpers ----------
export function pointInPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function centroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const f = x0 * z1 - x1 * z0;
    a += f; cx += (x0 + x1) * f; cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-6) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return [cx / (3 * a), cz / (3 * a)];
}
export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; a += x0 * z1 - x1 * z0; }
  return Math.abs(a / 2);
}
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qz = az + t * dz;
  return [Math.hypot(px - qx, pz - qz), qx, qz, t];
}
function distToPolyEdge(x, z, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    best = Math.min(best, distToSeg(x, z, a[0], a[1], b[0], b[1])[0]);
  }
  return best;
}
function bbox(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, z0, x1, z1 };
}

/** [nx, nz, len] per edge (edge i runs from ring[i] to ring[i+1]); normals point away from the solid. */
function edgeNormals(ring, hole = false) {
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), l = len || 1;
    let nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;
    const inside = pointInPoly((a[0] + b[0]) / 2 + nx * 0.05, (a[1] + b[1]) / 2 + nz * 0.05, ring);
    if (hole ? !inside : inside) { nx = -nx; nz = -nz; }
    return [nx, nz, len];
  });
}

/** Ring moved d metres away from the solid (negative = into it), with mitred corners. */
function offsetRing(ring, d, hole = false) {
  const N = edgeNormals(ring, hole);
  return ring.map((p, i) => {
    const n0 = N[(i - 1 + ring.length) % ring.length], n1 = N[i];
    let mx = n0[0] + n1[0], mz = n0[1] + n1[1];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-3) return [p[0] + n1[0] * d, p[1] + n1[1] * d];
    mx /= ml; mz /= ml;
    const k = d / Math.max(0.35, mx * n1[0] + mz * n1[1]);
    return [p[0] + mx * k, p[1] + mz * k];
  });
}

/** Sutherland–Hodgman: keep the part of a convex polygon where f(p) >= 0. */
function clipPoly(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

/**
 * "[" plan: convex footprint (local u/v coords) minus the courtyard notch
 * { u > spine, v0 < v < v1 }, which opens through the footprint's high-u side.
 */
function bracketRing(F, spine, v0, v1) {
  const inNotch = (p) => p[0] > spine + 1e-6 && p[1] > v0 + 1e-6 && p[1] < v1 - 1e-6;
  const pts = [];
  for (let i = 0; i < F.length; i++) {
    const a = F[i], b = F[(i + 1) % F.length];
    pts.push({ p: a });
    const cuts = [];
    for (const [vl, line] of [[v0, 0], [v1, 1]]) {
      const da = a[1] - vl, db = b[1] - vl;
      if (da * db >= 0) continue;
      const t = da / (da - db), u = a[0] + (b[0] - a[0]) * t;
      if (u > spine) cuts.push({ t, p: [u, vl], line });
    }
    cuts.sort((x, y) => x.t - y.t).forEach((c) => pts.push(c));
  }
  const kept = pts.filter((q) => !inNotch(q.p)), out = [];
  kept.forEach((q, i) => {
    out.push(q.p);
    const n = kept[(i + 1) % kept.length];
    if (q.line !== undefined && n.line !== undefined && q.line !== n.line) out.push([spine, q.line ? v1 : v0], [spine, n.line ? v1 : v0]);
  });
  return out;
}

/**
 * Calls cb(x, z, nx, nz, ang, edgeIndex, s) at every point where the distance run along
 * the ring is phase + k*step, matching the u-coordinate wallGeometry gives the facade.
 */
function alongRing(ring, hole, phase, step, margin, cb) {
  const N = edgeNormals(ring, hole);
  let run = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], [nx, nz, len] = N[i];
    if (len < 0.05) return;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let s = (((phase - run) % step) + step) % step; s < len; s += step) {
      if (s >= margin && s <= len - margin) cb(a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len, nx, nz, ang, i, s);
    }
    run += len;
  });
}

/**
 * Vertical walls for every edge of the rings, UV-mapped in metres so windows line up.
 * Vertex colours carry a cheap ambient-occlusion band at the base (opts.ao metres tall)
 * and an optional per-building tint, so no extra render pass is needed.
 */
function wallGeometry(rings, y0, y1, tileW = 1, tileH = 1, outerCount = 1, opts = {}) {
  const pos = [], nor = [], uv = [], col = [];
  const tint = opts.tint || [1, 1, 1], ao = opts.ao || 0, dark = opts.dark ?? 0.55;
  const bands = ao && y1 - y0 > ao ? [[y0, y0 + ao], [y0 + ao, y1]] : [[y0, y1]];
  const shade = (y) => (ao && y <= y0 + 1e-6 ? dark : 1);
  rings.forEach((ring, ri) => {
    const isHole = ri >= outerCount;
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      let a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      let nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
      const probeIn = pointInPoly(mx + nx * 0.05, mz + nz * 0.05, ring);
      if (isHole ? !probeIn : probeIn) { nx = -nx; nz = -nz; }
      // winding normal is (-dz, dx); make it agree with outward n
      let u0 = run / tileW, u1 = (run + len) / tileW;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      if (-dz * nx + dx * nz < 0) { [a, b] = [b, a]; [u0, u1] = [u1, u0]; }
      for (const [ya, yb] of bands) {
        const v0 = ya / tileH, v1 = yb / tileH;
        const A0 = [a[0], ya, a[1]], B0 = [b[0], ya, b[1]], B1 = [b[0], yb, b[1]], A1 = [a[0], yb, a[1]];
        pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1);
        for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
        const s0 = shade(ya), s1 = shade(yb);
        for (const sv of [s0, s0, s1, s0, s1, s1]) col.push(tint[0] * sv, tint[1] * sv, tint[2] * sv);
      }
      run += len;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Polyline shifted sideways by d metres (positive = left of travel direction). */
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / l) * d, p[1] + (dx / l) * d];
  });
}

/** Flat polygon (with holes) lying in the XZ plane at height y, UVs in world metres / uvScale. */
function flatGeometry(poly, holes = [], y = 0, uvScale = 1) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvScale, -p.getZ(i) / uvScale);
  return g;
}

/** Turn an (indexed) upward-facing flat geometry into a downward-facing one (soffits, slab undersides). */
function flipDown(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, -1, 0);
  return g;
}

/** Non-indexed geometry with only position/normal/uv, so mixed parts can be merged. */
function plain(g) {
  const out = g.index ? g.toNonIndexed() : g;
  if (out.attributes.color) out.deleteAttribute('color');
  return out;
}

/** A projecting slab band (floor ledge / cornice) d metres proud of the ring, from y0 to y1. */
function ledgeGeoms(ring, hole, y0, y1, d) {
  const out = offsetRing(ring, d, hole);
  const [P, H] = hole ? [ring, [out]] : [out, [ring]];
  return [wallGeometry([out], y0, y1, 10, 10, hole ? 0 : 1), flatGeometry(P, H, y1, 4), flipDown(flatGeometry(P, H, y0, 4))];
}

/** Flat coping strip on top of a parapet wall. */
function copingGeom(ring, hole, y) {
  const outer = offsetRing(ring, hole ? -0.3 : 0.12, hole), inner = offsetRing(ring, hole ? 0.12 : -0.3, hole);
  return flatGeometry(outer, [inner], y, 4);
}

/** Map UVs across the polygon's oriented bounding box (courts, fields). */
function obbUV(g, poly) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of poly) { const u = x * ux + z * uz, v = x * vx + z * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    uv.setXY(i, (x * ux + z * uz - u0) / (u1 - u0), (x * vx + z * vz - v0) / (v1 - v0));
  }
  return { ang, len: u1 - u0, wid: v1 - v0, ux, uz, center: [((u0 + u1) / 2) * ux + ((v0 + v1) / 2) * vx, ((u0 + u1) / 2) * uz + ((v0 + v1) / 2) * vz] };
}

/** Ribbon along a polyline (roads, paths, route). width: metres, or an array with one width per point. */
export function ribbonGeometry(pts, width, y = 0, caps = true) {
  const pos = [], uv = [], idx = [];
  const widthAt = (i) => (Array.isArray(width) ? width[i] : width);
  let run = 0, hw = widthAt(0) / 2;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    hw = widthAt(i) / 2;
    const prev = pts[i - 1] || p, next = pts[i + 1] || p;
    let d1x = p[0] - prev[0], d1z = p[1] - prev[1];
    let d2x = next[0] - p[0], d2z = next[1] - p[1];
    const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    if (i === 0) { d1x = d2x; d1z = d2z; }
    if (i === pts.length - 1) { d2x = d1x; d2z = d1z; }
    let tx = d1x + d2x, tz = d1z + d2z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    const miter = Math.min(2.5, 1 / Math.max(0.2, nx * -d1z + nz * d1x));
    if (i > 0) run += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    pos.push(p[0] + nx * hw * miter, y, p[1] + nz * hw * miter, p[0] - nx * hw * miter, y, p[1] - nz * hw * miter);
    uv.push(0, run / (2 * hw), 1, run / (2 * hw));
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // make sure faces point up
  g.computeVertexNormals();
  const n = g.attributes.normal;
  if (n.count && n.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); }
  const parts = [g];
  if (caps && pts.length > 1) {
    for (const [p, r] of [[pts[0], widthAt(0) / 2], [pts[pts.length - 1], widthAt(pts.length - 1) / 2]]) {
      const c = new THREE.CircleGeometry(r, 12); c.rotateX(-Math.PI / 2); c.translate(p[0], y - 0.002, p[1]);
      const cu = c.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, 0.5, 0);
      parts.push(c);
    }
  }
  return parts.length > 1 ? mergeGeometries(parts.map((x) => x.toNonIndexed())) : g;
}

const ROAD_W = { motorway: 20, trunk: 16, trunk_link: 8, motorway_link: 8, primary: 14, secondary: 12, secondary_link: 7, tertiary: 9, tertiary_link: 6, residential: 6.5, unclassified: 6, service: 4.5, living_street: 5, pedestrian: 4, footway: 2.6, path: 2, steps: 2.4, cycleway: 2.4 };
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
// Campus driveways are wide avenues: up to 7.5 m of carriageway, a footpath on each side, trees and benches.
const AVE_HW = 3.75, WALK_W = 2.2, AVE_OUTER = AVE_HW + 0.3 + WALK_W;
// OSM tags some wide campus roads as footways; these are drawn as avenues anyway.
const WIDE_WAYS = new Set([
  608015622, // the east–west road between the mess row and Teachers' Residence / Rajendra / H4
]);
const isAvenue = (w) => w.inside && (w.hw === 'service' || WIDE_WAYS.has(w.id)) && !w.covered && !w.tunnel && !(w.layer < 0);
/** Half-width a way keeps clear (avenues include their footpaths). */
const clearHalf = (w) => (isAvenue(w) ? AVE_OUTER : ROAD_W[w.hw] / 2);

function randomPointsInPoly(poly, holes, n, rand, margin = 1.5) {
  const b = bbox(poly), out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const x = b.x0 + rand() * (b.x1 - b.x0), z = b.z0 + rand() * (b.z1 - b.z0);
    if (!pointInPoly(x, z, poly) || holes.some((h) => pointInPoly(x, z, h))) continue;
    if (distToPolyEdge(x, z, poly) < margin) continue;
    if (out.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
    out.push([x, z]);
  }
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------- world ----------
export function buildWorld(scene, data, places, { mobile = false } = {}) {
  const rand = TX.rng(42);
  const root = new THREE.Group();
  scene.add(root);
  const nightMats = []; // { mat, base } emissive window materials
  const lampMats = [];
  const pickables = [];
  const anchors = new Map();
  const colliders = [];
  const buildingMeshes = new Map();
  const animated = [];

  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const placeByOsm = new Map(places.filter((p) => p.osm).map((p) => [p.osm, p]));

  // --- ground ---
  const groundTex = TX.makeGround(); groundTex.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), std({ map: groundTex, color: '#c9cdb4' }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  root.add(ground);

  const landCol = { residential: '#c5bfb2', industrial: '#bdb6ad', commercial: '#c9b9b0', education: '#d3c9b1', grass: '#86a862', grassland: '#93ad6b', park: '#7fa95c', garden: '#7fa95c', parking: '#8b8d90', recreation_ground: '#8fb26a' };
  const landGeoms = {};
  for (const a of data.areas) {
    if (a.inside) continue;
    const col = landCol[a.kind];
    if (!col) continue;
    const y = a.kind === 'parking' ? 0.07 : a.cls === 'landuse' ? 0.03 : 0.05;
    (landGeoms[col] ||= []).push(flatGeometry(a.poly, [], y, 10));
  }
  for (const [col, gs] of Object.entries(landGeoms)) {
    const m = new THREE.Mesh(mergeGeometries(gs), std({ color: col, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.receiveShadow = true; root.add(m);
  }

  // campus base (paved)
  const paveTex = TX.makePaving();
  const campusBase = new THREE.Mesh(flatGeometry(data.campus, [], 0.09, 6), std({ map: paveTex, color: '#efe6d6', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  campusBase.receiveShadow = true; root.add(campusBase);

  // --- roads ---
  const asphalt = TX.makeAsphalt();
  const roadGeoms = { kerb: [], asphalt: [], campus: [], foot: [], marks: [] };
  const KERB = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'trunk_link', 'secondary_link', 'tertiary_link', 'unclassified']);
  for (const w of data.ways) {
    if (w.layer < 0 && !w.inside) continue;
    const width = ROAD_W[w.hw];
    if (!width || w.pts.length < 2 || isAvenue(w)) continue; // avenues are built after the buildings
    const foot = ['footway', 'path', 'steps', 'pedestrian', 'cycleway'].includes(w.hw);
    const bucket = foot ? 'foot' : w.inside && w.hw === 'service' ? 'campus' : 'asphalt';
    const y = foot ? 0.16 : w.inside ? 0.14 : MAJOR.has(w.hw) ? 0.12 : 0.11;
    roadGeoms[bucket].push(ribbonGeometry(w.pts, width, y));
    if (!w.inside && KERB.has(w.hw)) roadGeoms.kerb.push(ribbonGeometry(w.pts, width + (MAJOR.has(w.hw) ? 5 : 3), y - 0.004));
    if (MAJOR.has(w.hw) && w.pts.length > 1) {
      for (const sd of [-1, 1]) roadGeoms.marks.push(ribbonGeometry(offsetLine(w.pts, sd * (width / 2 - 0.6)), 0.18, y + 0.02, false));
    }
    if (MAJOR.has(w.hw) || w.hw === 'tertiary') {
      // dashed centre line
      let acc = 0, on = true;
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let s = 0;
        while (s < L) {
          const seg = Math.min((on ? 3 : 5) - acc, L - s);
          if (on && seg > 0.3) {
            const t0 = s / L, t1 = (s + seg) / L;
            roadGeoms.marks.push(ribbonGeometry([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]], 0.25, y + 0.02, false));
          }
          s += seg; acc += seg;
          if (acc >= (on ? 3 : 5) - 1e-6) { acc = 0; on = !on; }
        }
      }
    }
  }
  const roadMat = {
    kerb: std({ map: paveTex, color: '#b8b2a6', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    asphalt: std({ map: asphalt, color: '#ffffff', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    campus: std({ map: asphalt, color: '#b9b2aa', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    foot: std({ map: paveTex, color: '#c8a98a', polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
    marks: std({ color: '#f2efe6', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  };
  asphalt.repeat.set(1, 1);
  for (const [k, gs] of Object.entries(roadGeoms)) {
    if (!gs.length) continue;
    const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)));
    if (k !== 'marks') { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8); }
    const m = new THREE.Mesh(g, roadMat[k]); m.receiveShadow = true; root.add(m);
  }

  // --- campus areas: courts, ground, pool ---
  const grassTex = TX.makeGrassField();
  const waterTex = TX.makeWater();
  for (const a of data.areas) {
    if (!a.inside) continue;
    const place = placeByOsm.get(a.id);
    let mesh = null;
    if (a.kind === 'grass') {
      const g = flatGeometry(a.poly, [], 0.2, 1); obbUV(g, a.poly);
      const t = grassTex.clone(); t.needsUpdate = true; t.repeat.set(1, 1);
      mesh = new THREE.Mesh(g, std({ map: t, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }));
      // goal posts at both ends of the field
      const ob = obbUV(flatGeometry(a.poly), a.poly);
      const postMat = std({ color: '#ffffff', roughness: 0.4 });
      for (const s of [-1, 1]) {
        const gp = new THREE.Group();
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 5), postMat); bar.position.y = 2.2; gp.add(bar);
        for (const e of [-2.5, 2.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), postMat); p.position.set(0, 1.1, e); gp.add(p); }
        gp.position.set(ob.center[0] + ob.ux * s * (ob.len / 2 - 2), 0.2, ob.center[1] + ob.uz * s * (ob.len / 2 - 2));
        gp.rotation.y = -ob.ang; gp.traverse((o) => (o.castShadow = true));
        root.add(gp);
      }
    } else if (a.kind === 'pitch') {
      const sport = a.sport === 'volleyball' && a.id === 1487218162 ? 'dirt' : a.sport;
      const g = flatGeometry(a.poly, [], 0.22, 1); const ob = obbUV(g, a.poly);
      mesh = new THREE.Mesh(g, std({ map: TX.makeCourt(sport), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
      // nets / hoops
      const netMat = std({ color: '#f5f5f5', transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const poleMat = std({ color: '#30343a', metalness: 0.6, roughness: 0.4 });
      if (a.sport === 'basketball') {
        for (const s of [-1, 1]) {
          const h = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), poleMat); pole.position.y = 1.7; h.add(pole);
          const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 1.8), std({ color: '#ffffff' })); board.position.set(-0.5 * s, 3.3, 0); h.add(board);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 16), std({ color: '#ff5a1f' })); ring.rotation.x = Math.PI / 2; ring.position.set(-0.8 * s, 3.05, 0); h.add(ring);
          h.position.set(ob.center[0] + ob.ux * s * (ob.len / 2 + 0.4), 0.2, ob.center[1] + ob.uz * s * (ob.len / 2 + 0.4));
          h.rotation.y = -ob.ang; h.traverse((o) => (o.castShadow = true)); root.add(h);
        }
      } else if (a.sport === 'volleyball' || a.sport === 'badminton') {
        const hgt = a.sport === 'volleyball' ? 2.4 : 1.55;
        const net = new THREE.Mesh(new THREE.PlaneGeometry(ob.wid * 0.9, 0.8), netMat);
        net.position.set(ob.center[0], hgt - 0.4, ob.center[1]); net.rotation.y = -ob.ang + Math.PI / 2; root.add(net);
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, hgt, 6), poleMat);
          p.position.set(ob.center[0] - ob.uz * s * ob.wid * 0.46, hgt / 2 + 0.2, ob.center[1] + ob.ux * s * ob.wid * 0.46); p.castShadow = true; root.add(p);
        }
      }
      // floodlights ("lit=yes")
      for (const s of [-1, 1]) {
        const fl = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 8), poleMat); pole.position.y = 4.5; fl.add(pole);
        const headMat = std({ color: '#fffbe8', emissive: '#fff3c4', emissiveIntensity: 0 }); lampMats.push(headMat);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.3), headMat); head.position.y = 9; fl.add(head);
        fl.position.set(ob.center[0] - ob.uz * s * (ob.wid / 2 + 0.8), 0, ob.center[1] + ob.ux * s * (ob.wid / 2 + 0.8));
        fl.traverse((o) => (o.castShadow = true)); root.add(fl);
      }
    } else if (a.kind === 'swimming_pool') {
      const deck = new THREE.Mesh(flatGeometry(a.poly, [], 0.24, 2), std({ color: '#e9e4da' }));
      deck.receiveShadow = true; root.add(deck);
      const [cx, cz] = centroid(a.poly);
      const inner = a.poly.map(([x, z]) => [cx + (x - cx) * 0.82, cz + (z - cz) * 0.78]);
      const g = flatGeometry(inner, [], 0.28, 6);
      const mat = new THREE.MeshStandardMaterial({ map: waterTex, color: '#7fe0ff', roughness: 0.08, metalness: 0.1, emissive: '#0a6f8f', emissiveIntensity: 0.35 });
      mesh = new THREE.Mesh(g, mat);
      animated.push((t) => { waterTex.offset.set(t * 0.02, t * 0.013); });
    } else if (a.kind === 'parking') {
      continue; // underground
    } else continue;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (place) {
      mesh.userData.place = place.id;
      pickables.push(mesh);
      const [cx, cz] = centroid(a.poly);
      anchors.set(place.id, { x: cx, z: cz, y: 0, top: 3, poly: a.poly, size: Math.sqrt(polyArea(a.poly)) });
    }
  }

  // --- buildings ---
  const facadeCache = {};
  const facade = (style) => (facadeCache[style] ||= TX.makeFacade(style, style.length * 31));
  const roofTex = TX.makePaving(); const roofMat = std({ map: roofTex, color: '#c4beb5', roughness: 0.95 });
  const trimMats = {};
  const trimMat = (c) => (trimMats[c] ||= std({ color: c, roughness: 0.8 }));
  const TRIM = { academic: '#efe3cf', tower: '#f1e6d4', hostel: '#b65a40', hostel2: '#9f4b37', business: '#8e3f30', residence: '#a8573f', city: '#d8d2c8', city2: '#c9cacd' };
  const tankSpots = [], acSpots = [];
  const cityGeoms = {};
  // architectural detail, merged per colour at the end: ledges, pilasters, coping, canopies...
  const det = {};
  const addDet = (color, g) => (det[color] ||= []).push(plain(g));
  const chajjas = []; // window sunshades [x, y, z, ang, width] (instanced)
  const cityRand = TX.rng(777); // separate stream so campus trees keep their places
  const extraTrees = [], benches = [], extraLamps = []; // avenue & park furniture: benches [x, z, ang]
  const doorGeoms = [];
  const campusWays = data.ways.filter((w) => w.inside && ROAD_W[w.hw] && w.pts.length > 1);
  const distToWays = (x, z, pad = 0) => {
    let d = Infinity;
    for (const w of campusWays) for (let j = 1; j < w.pts.length; j++) {
      const a = w.pts[j - 1], b = w.pts[j];
      d = Math.min(d, distToSeg(x, z, a[0], a[1], b[0], b[1])[0] - (pad ? clearHalf(w) : 0));
    }
    return d;
  };
  const doorMat = std({ color: '#3b4148', roughness: 0.25, metalness: 0.4, emissive: '#ffd59a', emissiveIntensity: 0 });
  nightMats.push(doorMat);

  const BAY = 3.6;

  /** Floor ledges, corner pilasters, parapet coping, window sunshades and an entrance canopy. */
  function addBuildingDetail(b, style, floors, floorH, h, place, f) {
    const trim = TRIM[style];
    const rings = [[b.poly, false], ...b.holes.map((r) => [r, true])];
    for (const [r, hole] of rings) addDet('#e8dfd0', copingGeom(r, hole, h + 1.1));
    if (style === 'academic' || style === 'business') {
      for (const [r, hole] of rings) for (let k = 1; k < floors; k++) ledgeGeoms(r, hole, k * floorH - 0.12, k * floorH + 0.1, 0.22).forEach((g) => addDet(trim, g));
      b.poly.forEach((p, i) => {
        const q = b.poly[(i + 1) % b.poly.length];
        const g = new THREE.BoxGeometry(0.9, h + 1.1, 0.9);
        g.rotateY(-Math.atan2(q[1] - p[1], q[0] - p[0])); g.translate(p[0], (h + 1.1) / 2, p[1]);
        addDet(trim, g);
      });
    } else if (style === 'hostel' || style === 'hostel2' || style === 'residence') {
      const w = (f.win[2] - f.win[0]) * BAY + 0.35, y1 = (1 - f.win[1]) * floorH + 0.1;
      for (const [r, hole] of rings) {
        alongRing(r, hole, BAY / 2, BAY, 1.0, (x, z, nx, nz, ang) => {
          for (let k = 0; k < floors; k++) chajjas.push([x + nx * 0.3, k * floorH + y1, z + nz * 0.3, ang, w]);
        });
      }
    }
    if (place) addEntrance(b.poly, trim, 3.4);
  }

  /**
   * Small parks in a building's open bays: any run of four corners whose middle two are concave
   * is a notch (the Teachers' Residence has one on each side). Courtyards (holes) get a lawn too.
   */
  const parkGrass = [];
  function addParks(b, rimH = 0.7) {
    const P = b.poly, n = P.length;
    let area2 = 0;
    for (let i = 0; i < n; i++) { const a = P[i], c = P[(i + 1) % n]; area2 += a[0] * c[1] - c[0] * a[1]; }
    const reflex = P.map((p, i) => {
      const a = P[(i - 1 + n) % n], c = P[(i + 1) % n];
      return Math.sign((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) === -Math.sign(area2);
    });
    const lawns = [];
    for (let i = 0; i < n; i++) if (!reflex[i] && reflex[(i + 1) % n] && reflex[(i + 2) % n] && !reflex[(i + 3) % n]) lawns.push({ q: [0, 1, 2, 3].map((k) => P[(i + k) % n]), open: true });
    for (const h of b.holes) lawns.push({ q: h, open: false });
    for (const { q, open } of lawns) {
      const [cx, cz] = centroid(q);
      parkGrass.push(flatGeometry(q, [], 0.21, 3));
      // flower bed along the back wall (q1 to q2), hedge with an entry gap on the open side (q3 to q0)
      const edgeBox = (a, c, h, d, inset, color, gap = 0) => {
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]), ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
        const ix = cx - (a[0] + c[0]) / 2, iz = cz - (a[1] + c[1]) / 2, il = Math.hypot(ix, iz) || 1;
        const segs = gap ? [[-L / 2 + 0.4, -gap / 2], [gap / 2, L / 2 - 0.4]] : [[-L / 2 + 0.6, L / 2 - 0.6]];
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.5) continue;
          const g = new THREE.BoxGeometry(s1 - s0, h, d); g.rotateY(-ang);
          const sm = (s0 + s1) / 2;
          g.translate((a[0] + c[0]) / 2 + Math.cos(ang) * sm + (ix / il) * inset, 0.2 + h / 2, (a[1] + c[1]) / 2 + Math.sin(ang) * sm + (iz / il) * inset);
          addDet(color, g);
        }
      };
      if (open) {
        edgeBox(q[1], q[2], 0.35, 0.9, 0.6, '#d9677b');
        edgeBox(q[3], q[0], rimH, 0.6, 0.4, '#3f6b32', 2.4);
        for (const [a, c] of [[q[0], q[1]], [q[2], q[3]]]) {
          // benches against the side walls, facing the middle of the park
          const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, ix = cx - mx, iz = cz - mz, il = Math.hypot(ix, iz) || 1;
          benches.push([mx + (ix / il) * 1.0, mz + (iz / il) * 1.0, Math.atan2(ix / il, iz / il)]);
        }
        extraTrees.push([cx, cz, 0.62]);
      } else {
        for (let k = 0; k < q.length; k++) edgeBox(q[k], q[(k + 1) % q.length], 0.35, 0.8, 0.5, k % 2 ? '#e0a33c' : '#d9677b');
        extraTrees.push([cx, cz, 0.7]);
        const L0 = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), L1 = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
        const [a, c] = L0 > L1 ? [q[0], q[1]] : [q[1], q[2]];
        const ux = (c[0] - a[0]) / Math.max(L0, L1), uz = (c[1] - a[1]) / Math.max(L0, L1);
        for (const s of [-1, 1]) benches.push([cx + ux * s * 4, cz + uz * s * 4, Math.atan2(-ux * s, -uz * s)]);
      }
    }
  }

  /** Canopy with columns, steps and a glazed door on the edge that faces the nearest campus path. */
  function addEntrance(P, trim, ch, forceEdge = null) {
    const N = edgeNormals(P);
    let e = forceEdge, bestD = Infinity;
    if (!e) P.forEach((a, i) => {
      const c = P[(i + 1) % P.length], [nx, nz, len] = N[i];
      if (len < 9) return;
      const d = distToWays((a[0] + c[0]) / 2 + nx * 5, (a[1] + c[1]) / 2 + nz * 5) - len * 0.02;
      if (d < bestD) { bestD = d; e = { a, c, nx, nz, len }; }
    });
    if (!e) return;
    const { a, c, nx, nz } = e;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, cw = Math.min(9, len * 0.35), dp = 3.2;
    const box = (w, hh, d, off, y, side = 0) => {
      const g = new THREE.BoxGeometry(w, hh, d); g.rotateY(-ang);
      g.translate(mx + nx * off + Math.cos(ang) * side, y, mz + nz * off + Math.sin(ang) * side);
      return g;
    };
    addDet(trim, box(cw, 0.28, dp, dp / 2, ch));
    addDet('#f1e6d4', box(cw + 0.3, 0.5, 0.35, dp, ch + 0.05)); // fascia
    addDet('#cfc6b8', box(cw, 0.16, dp, dp / 2, 0.16)); // steps
    for (const s of [-1, 1]) {
      const col = new THREE.CylinderGeometry(0.18, 0.18, ch, 10);
      col.translate(mx + nx * (dp - 0.4) + Math.cos(ang) * s * (cw / 2 - 0.4), ch / 2, mz + nz * (dp - 0.4) + Math.sin(ang) * s * (cw / 2 - 0.4));
      addDet('#f1e6d4', col);
    }
    const door = new THREE.PlaneGeometry(Math.min(3.4, cw * 0.6), 2.8);
    door.rotateY(Math.atan2(nx, nz)); door.translate(mx + nx * 0.06, 1.72, mz + nz * 0.06);
    doorGeoms.push(door);
  }
  for (const b of data.buildings) {
    const place = placeByOsm.get(b.id);
    if (place?.special) continue; // drawn separately
    if (b.id === 1256690152) continue; // solar roof, drawn separately
    const isCampus = b.inside || !!place;
    let floors, floorH, style;
    if (place) { floors = place.floors || b.levels || 3; style = place.style || 'academic'; }
    else if (isCampus) { floors = b.levels || 2; style = 'hostel2'; }
    else {
      const r = ((b.id * 9301 + 49297) % 233280) / 233280;
      const big = polyArea(b.poly) > 1200;
      floors = b.levels || (big ? 3 + Math.floor(r * 7) : 2 + Math.floor(r * 3));
      style = r > 0.5 ? 'city' : 'city2';
    }
    floorH = style === 'hostel' || style === 'hostel2' || style === 'residence' ? 3.2 : style.startsWith('city') ? 3.3 : 3.8;
    const h = floors * floorH;
    const f = facade(style);
    const rings = [b.poly, ...b.holes];
    let tint = [1, 1, 1];
    if (!isCampus) {
      const TINTS = [[1, 1, 1], [1, 0.96, 0.88], [0.96, 0.91, 0.86], [1, 0.93, 0.84], [0.9, 0.93, 0.97], [0.98, 0.89, 0.82], [0.86, 0.86, 0.86], [1, 0.98, 0.94]];
      tint = TINTS[Math.abs(b.id * 7919) % TINTS.length];
    }
    const walls = wallGeometry(rings, 0, h, f.bays * BAY, f.floors * floorH, 1, { ao: Math.min(3.5, h * 0.4), tint });
    const parapet = wallGeometry(rings, h, h + 1.1, 10, 10, 1);
    const roof = flatGeometry(b.poly, b.holes, h + 0.15, 4);
    colliders.push({ poly: b.poly, bb: bbox(b.poly), h });

    if (!isCampus) {
      (cityGeoms[style] ||= { walls: [], trim: [], roof: [] });
      cityGeoms[style].walls.push(walls); cityGeoms[style].trim.push(parapet); cityGeoms[style].roof.push(roof);
      // floor ledges, parapet coping, a stair room and black water tanks on the roof
      addDet('#ddd7cd', copingGeom(b.poly, false, h + 1.1));
      for (let k = 1; k < floors; k++) ledgeGeoms(b.poly, false, k * floorH - 0.1, k * floorH + 0.08, 0.16).forEach((g) => addDet('#d6cfc4', g));
      const area = polyArea(b.poly);
      if (area > 60) {
        const pts = randomPointsInPoly(b.poly, b.holes, area > 400 ? 4 : 2, cityRand, 1.6);
        pts.forEach(([x, z], i) => {
          if (i === 0 && area > 120) {
            const g = new THREE.BoxGeometry(3, 2.6, 2.6); g.rotateY(-Math.atan2(b.poly[1][1] - b.poly[0][1], b.poly[1][0] - b.poly[0][0]));
            g.translate(x, h + 1.45, z); addDet('#cfc8bd', g);
          } else tankSpots.push([x, h + 0.15, z]);
        });
      }
      continue;
    }
    const wallMat = std({ map: f.map, emissiveMap: f.emissiveMap, roughnessMap: f.roughnessMap, roughness: 1, vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0 });
    nightMats.push(wallMat);
    const grp = new THREE.Group();
    const wm = new THREE.Mesh(walls, wallMat);
    const tm = new THREE.Mesh(parapet, trimMat(TRIM[style]));
    tm.material.side = THREE.DoubleSide;
    const rm = new THREE.Mesh(roof, roofMat);
    for (const m of [wm, tm, rm]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    // plinth band
    const plinth = new THREE.Mesh(wallGeometry(rings, 0, 0.9, 10, 10, 1), trimMat('#7b5b4b'));
    plinth.scale.set(1, 1, 1); grp.add(plinth);
    root.add(grp);

    // rooftop: stair room + black water tanks + AC units
    const area = polyArea(b.poly);
    const spots = randomPointsInPoly(b.poly, b.holes, Math.min(10, 2 + Math.floor(area / 400)), rand, 2.5);
    spots.forEach(([x, z], i) => {
      if (i === 0 && area > 600) {
        const sr = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), trimMat(TRIM[style]));
        sr.position.set(x, h + 1.6, z); sr.castShadow = true; grp.add(sr);
      } else if (i % 3 === 0) acSpots.push([x, h + 0.15, z]);
      else tankSpots.push([x, h + 0.15, z]);
    });

    addBuildingDetail(b, style, floors, floorH, h, place, f);
    if (place?.id === 'faculty') addParks(b);

    if (place) {
      wm.userData.place = place.id; rm.userData.place = place.id; tm.userData.place = place.id;
      pickables.push(wm, rm, tm);
      const [cx, cz] = centroid(b.poly);
      anchors.set(place.id, { x: cx, z: cz, y: 0, top: h + 1.1, poly: b.poly, size: Math.sqrt(area) });
      buildingMeshes.set(place.id, { group: grp, wallMat, h, poly: b.poly, holes: b.holes });
    }
  }
  // merged surrounding city
  for (const [style, gs] of Object.entries(cityGeoms)) {
    const f = facade(style);
    const wallMat = std({ map: f.map, emissiveMap: f.emissiveMap, roughnessMap: f.roughnessMap, roughness: 1, vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0, color: '#ece8e2' });
    nightMats.push(wallMat);
    const parts = [[gs.walls, wallMat], [gs.trim, trimMat(TRIM[style])], [gs.roof, std({ color: '#b9b4ac' })]];
    for (const [list, mat] of parts) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = true; m.receiveShadow = true;
      if (mat === trimMats[TRIM[style]]) mat.side = THREE.DoubleSide;
      root.add(m);
    }
  }
  // rooftop clutter (instanced)
  if (tankSpots.length) {
    const tg = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12); tg.translate(0, 0.9, 0);
    const tanks = new THREE.InstancedMesh(tg, std({ color: '#1d1f22', roughness: 0.6 }), tankSpots.length);
    const m4 = new THREE.Matrix4();
    tankSpots.forEach(([x, y, z], i) => tanks.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    tanks.castShadow = true; root.add(tanks);
  }
  if (acSpots.length) {
    const ag = new THREE.BoxGeometry(1.2, 0.9, 0.8); ag.translate(0, 0.45, 0);
    const acs = new THREE.InstancedMesh(ag, std({ color: '#e6e8ea' }), acSpots.length);
    const m4 = new THREE.Matrix4();
    acSpots.forEach(([x, y, z], i) => acs.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    acs.castShadow = true; root.add(acs);
  }

  // --- special structures ---
  const groundArea = data.areas.find((a) => a.id === 608015613);
  const groundC = groundArea ? centroid(groundArea.poly) : [0, 0];
  for (const b of data.buildings) {
    const place = placeByOsm.get(b.id);
    if (place?.special === 'oat') buildOAT(b, place);
    if (place?.special === 'mandir') buildMandir(b, place);
    if (place?.special === 'tower') buildTower(b, place);
    if (b.id === 1256690152) buildSolar(b);
  }

  /**
   * ABB-3: a 19-storey "[" block. Its back (the spine) faces the Gate 1 road, which runs between
   * the tower and the campus wall; wings at both ends reach toward the Main Ground, framing a
   * courtyard that opens onto it. An end of the block whose ground floor a path runs through
   * (the "Portico" passage) stands on columns instead of having a closed lobby.
   */
  function buildTower(b, place) {
    // OSM draws the footprint over the road: keep only the part on the ground side of it
    let F = b.poly;
    {
      let road = null, most = 20;
      for (const w of data.ways.filter(isAvenue)) for (let j = 1; j < w.pts.length; j++) {
        const a = w.pts[j - 1], c = w.pts[j], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        let inside = 0;
        for (let t = 0.05; t < 1; t += 0.1) if (pointInPoly(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, F)) inside += L / 10;
        if (inside > most) { most = inside; road = [a, c, L]; }
      }
      if (road) {
        const [a, c, L] = road;
        let nx = -(c[1] - a[1]) / L, nz = (c[0] - a[0]) / L;
        if ((groundC[0] - a[0]) * nx + (groundC[1] - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
        F = clipPoly(F, (p) => (p[0] - a[0]) * nx + (p[1] - a[1]) * nz - (AVE_HW + 0.6));
      }
    }
    const grp = new THREE.Group();
    // local frame: v runs along the spine (pointing south), u across it toward the ground
    let best = 0, dir = [0, 1];
    F.forEach((a, i) => {
      const c = F[(i + 1) % F.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > best) { best = l; dir = [(c[0] - a[0]) / l, (c[1] - a[1]) / l]; }
    });
    if (dir[1] < 0) dir = [-dir[0], -dir[1]];
    let perp = [-dir[1], dir[0]];
    const [fcx, fcz] = centroid(F);
    if ((groundC[0] - fcx) * perp[0] + (groundC[1] - fcz) * perp[1] < 0) perp = [-perp[0], -perp[1]];
    const U = (p) => p[0] * perp[0] + p[1] * perp[1], V = (p) => p[0] * dir[0] + p[1] * dir[1];
    const u0 = Math.min(...F.map(U)), v0 = Math.min(...F.map(V));
    const toUV = (p) => [U(p) - u0, V(p) - v0];
    const toW = ([u, v]) => [perp[0] * (u + u0) + dir[0] * (v + v0), perp[1] * (u + u0) + dir[1] * (v + v0)];
    const angDir = Math.atan2(dir[1], dir[0]);
    const Fuv = F.map(toUV);
    const L = Math.max(...Fuv.map((p) => p[1]));

    const SPINE = 11.5, WING_N = 18, WING_S = 21; // metres: spine depth, north / south wing depth
    const FH = 3.5, PODIUM = 5.5, NF = (place.floors || 19) - 1;
    const H = PODIUM + NF * FH;
    const ring = bracketRing(Fuv, SPINE, WING_N, L - WING_S).map(toW);
    // ground floor in three bands: north end, middle of the spine, south end
    const bandsUV = [
      clipPoly(Fuv, (p) => WING_N - p[1]),
      clipPoly(clipPoly(clipPoly(Fuv, (p) => p[1] - WING_N), (p) => L - WING_S - p[1]), (p) => SPINE - p[0]),
      clipPoly(Fuv, (p) => p[1] - (L - WING_S)),
    ].filter((w) => w.length > 2);
    const pathThrough = (polyW) => data.ways.some((w) => w.inside && ROAD_W[w.hw] && w.pts.some((c, j) => {
      if (!j) return false;
      const a = w.pts[j - 1], n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]));
      for (let k = 0; k <= n; k++) if (pointInPoly(a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n, polyW)) return true;
      return false;
    }));
    const bands = bandsUV.map((uv, i) => { const w = uv.map(toW); return { uv, w, open: i !== 1 && pathThrough(w) }; });
    const openUV = bands.filter((x) => x.open).map((x) => x.uv), openW = bands.filter((x) => x.open).map((x) => x.w);
    const closedW = bands.filter((x) => !x.open).map((x) => x.w);
    const wingsUV = [WING_N / 2, L - WING_S / 2].map((v) => clipPoly(clipPoly(Fuv, (p) => p[0] - SPINE), (p) => (v < L / 2 ? WING_N - p[1] : p[1] - (L - WING_S)))).filter((w) => w.length > 2);
    b.outline = ring; // minimap draws the real plan
    const CREAM = '#efe6d6';

    // --- facades ---
    const f = facade('tower');
    const upper = wallGeometry([ring], 0, NF * FH, f.bays * BAY, f.floors * FH, 1);
    upper.translate(0, PODIUM, 0); // keep the window grid aligned with the floor ledges
    const wallMat = std({ map: f.map, emissiveMap: f.emissiveMap, roughnessMap: f.roughnessMap, roughness: 1, vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0 });
    nightMats.push(wallMat);
    const lob = facade('lobby');
    const lobbyMat = std({ map: lob.map, emissiveMap: lob.emissiveMap, roughnessMap: lob.roughnessMap, roughness: 1, vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0 });
    nightMats.push(lobbyMat);
    const podium = wallGeometry(closedW, 0, PODIUM, lob.bays * 4.5, lob.floors * PODIUM, closedW.length, { ao: 1.2, dark: 0.7 });
    const soffit = !openW.length ? null : mergeGeometries(openW.map((w) => flipDown(flatGeometry(w, [], PODIUM - 0.35, 4)).toNonIndexed()));
    const roof = flatGeometry(ring, [], H + 0.15, 4);
    const parapet = wallGeometry([ring], H, H + 1.2, 10, 10, 1);
    const pick = [
      new THREE.Mesh(upper, wallMat), new THREE.Mesh(podium, lobbyMat),
      ...(soffit ? [new THREE.Mesh(soffit, std({ color: '#ddd3c4' }))] : []), new THREE.Mesh(roof, roofMat),
      new THREE.Mesh(parapet, std({ color: CREAM, side: THREE.DoubleSide })),
    ];
    addDet('#e8dfd0', copingGeom(ring, false, H + 1.2));

    // --- named faces: courtyard side of the spine, street side, and the two wing ends ---
    const N = edgeNormals(ring);
    const edges = ring.map((a, i) => {
      const c = ring[(i + 1) % ring.length], [nx, nz, len] = N[i];
      const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      return { i, a, c, nx, nz, len, m, muv: toUV(m), nu: nx * perp[0] + nz * perp[1], ang: Math.atan2(c[1] - a[1], c[0] - a[0]) };
    });
    const longest = (list) => list.sort((p, q) => q.len - p.len)[0];
    const court = longest(edges.filter((e) => Math.abs(e.muv[0] - SPINE) < 0.5 && e.nu > 0.9));
    const street = longest(edges.filter((e) => e.nu < -0.9));
    const tipN = longest(edges.filter((e) => e.muv[1] < WING_N && e.muv[0] > SPINE && e.nu > 0.3));
    const tipS = longest(edges.filter((e) => e.muv[1] > L - WING_S && e.muv[0] > SPINE && e.nu > 0.3));
    const strips = [];
    if (court) strips.push({ e: court, w: 9, top: H + 4.5 });
    if (street) strips.push({ e: street, w: 9, top: H + 1.2 });
    for (const t of [tipN, tipS]) if (t && t.len > 6) strips.push({ e: t, w: Math.min(7, t.len - 3), top: H + 4.5 });

    // glass curtain-wall strips (lift lobbies), lit at night
    const cwTex = TX.makeCurtain();
    const glassMat = std({ map: cwTex.map, emissiveMap: cwTex.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.12, metalness: 0.55 });
    nightMats.push(glassMat);
    const stripG = [];
    for (const { e, w, top } of strips) {
      const hgt = top - PODIUM;
      const g = new THREE.BoxGeometry(w, hgt, 0.7);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / (cwTex.bays * BAY), (uv.getY(i) * hgt) / (cwTex.floors * FH));
      g.rotateY(-e.ang); g.translate(e.m[0] + e.nx * 0.25, PODIUM + hgt / 2, e.m[1] + e.nz * 0.25);
      stripG.push(g);
      if (top > H + 2) {
        const cap = new THREE.BoxGeometry(w + 0.8, 0.45, 1.4);
        cap.rotateY(-e.ang); cap.translate(e.m[0] + e.nx * 0.3, top + 0.22, e.m[1] + e.nz * 0.3);
        addDet(CREAM, cap);
      }
    }
    pick.push(new THREE.Mesh(mergeGeometries(stripG), glassMat));
    for (const m of pick) { m.castShadow = true; m.receiveShadow = true; m.userData.place = place.id; pickables.push(m); grp.add(m); }

    // --- facade relief: podium cornice, a ledge at every floor slab, fins between window bays, corner piers ---
    ledgeGeoms(ring, false, PODIUM - 0.35, PODIUM + 0.2, 0.6).forEach((g) => addDet(CREAM, g));
    for (let k = 1; k < NF; k++) ledgeGeoms(ring, false, PODIUM + k * FH - 0.1, PODIUM + k * FH + 0.12, 0.24).forEach((g) => addDet(CREAM, g));
    const finH = H + 1.2 - PODIUM - 0.2;
    alongRing(ring, false, 0, BAY, 0.9, (x, z, nx, nz, ang, i, s) => {
      if (strips.some(({ e, w }) => e.i === i && Math.abs(s - e.len / 2) < w / 2 + 0.4)) return;
      const g = new THREE.BoxGeometry(0.22, finH, 0.5);
      g.rotateY(-ang); g.translate(x + nx * 0.25, PODIUM + 0.2 + finH / 2, z + nz * 0.25);
      addDet(CREAM, g);
    });
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const g = new THREE.BoxGeometry(1.1, H + 1.2 - PODIUM, 1.1);
      g.rotateY(-Math.atan2(q[1] - p[1], q[0] - p[0])); g.translate(p[0], PODIUM + (H + 1.2 - PODIUM) / 2, p[1]);
      addDet(CREAM, g);
    });
    // spine piers at ground level (lobby glazing sits between them)
    for (const piece of closedW) alongRing(piece, false, 0, 4.5, 0.6, (x, z, nx, nz, ang) => {
      const g = new THREE.BoxGeometry(0.6, PODIUM - 0.35, 0.6); g.rotateY(-ang); g.translate(x + nx * 0.2, (PODIUM - 0.35) / 2, z + nz * 0.2);
      addDet('#d9cdb9', g);
    });
    // cantilevered canopy over the courtyard entrance
    if (court) {
      const g = new THREE.BoxGeometry(12, 0.35, 3.6); g.rotateY(-court.ang); g.translate(court.m[0] + court.nx * 1.8, 4.1, court.m[1] + court.nz * 1.8);
      addDet('#8e3f30', g);
      const door = new THREE.PlaneGeometry(6, 3.4); door.rotateY(Math.atan2(court.nx, court.nz)); door.translate(court.m[0] + court.nx * 0.08, 1.9, court.m[1] + court.nz * 0.08);
      doorGeoms.push(door);
    }

    // --- open ground floor (where a path runs through): columns + soffit downlights ---
    const colG = [], lightPts = [];
    openUV.forEach((w) => {
      const bb = bbox(w);
      for (let u = bb.x0 + 3; u < bb.x1; u += 6.5) for (let v = bb.z0 + 3; v < bb.z1; v += 6) {
        if (!pointInPoly(u, v, w) || distToPolyEdge(u, v, w) < 0.9) continue;
        const [x, z] = toW([u, v]);
        if (distToWays(x, z, true) > 0.8) { const c = new THREE.CylinderGeometry(0.42, 0.42, PODIUM - 0.35, 12); c.translate(x, (PODIUM - 0.35) / 2, z); colG.push(c); }
        const [lx, lz] = toW([u + 3.25, v + 3]);
        if (pointInPoly(u + 3.25, v + 3, w)) lightPts.push([lx, lz]);
      }
    });
    if (colG.length) colG.forEach((g) => addDet('#e9e2d6', g));
    if (lightPts.length) {
      const lg = new THREE.PlaneGeometry(1.2, 1.2); lg.rotateX(Math.PI / 2);
      const lm = std({ color: '#fff6e0', emissive: '#ffe2b0', emissiveIntensity: 0, side: THREE.DoubleSide }); lampMats.push(lm);
      const lights = new THREE.InstancedMesh(lg, lm, lightPts.length);
      const m4 = new THREE.Matrix4();
      lightPts.forEach(([x, z], i) => lights.setMatrixAt(i, m4.makeTranslation(x, PODIUM - 0.37, z)));
      grp.add(lights);
    }

    // --- roof: lift machine room + mast on the spine, stair rooms on the wings, tanks, AC units ---
    const lbox = (u, v, su, sv, y0, h) => {
      const g = new THREE.BoxGeometry(sv, h, su); g.rotateY(-angDir);
      const [x, z] = toW([u, v]); g.translate(x, y0 + h / 2, z); return g;
    };
    const coreV = court ? court.muv[1] : L / 2;
    addDet(CREAM, lbox(SPINE / 2, coreV, SPINE - 2.5, 16, H, 6));
    addDet('#8e3f30', lbox(SPINE / 2, coreV, SPINE - 1.8, 16.7, H + 6, 0.5));
    for (const w of wingsUV) { const [cu, cv] = centroid(w); addDet(CREAM, lbox(cu, cv, 6, 5, H, 3.4)); addDet('#8e3f30', lbox(cu, cv, 6.6, 5.6, H + 3.4, 0.35)); }
    const tankG = [];
    for (const v of [WING_N + 5, WING_N + 9, L - WING_S - 9, L - WING_S - 5]) for (const u of [3.2, 8.2]) {
      const t = new THREE.CylinderGeometry(0.85, 0.85, 1.8, 14); const [x, z] = toW([u, v]); t.translate(x, H + 1.05, z); tankG.push(t);
    }
    const tanks = new THREE.Mesh(mergeGeometries(tankG), std({ color: '#1d1f22', roughness: 0.6 }));
    tanks.castShadow = true; grp.add(tanks);
    for (const [u, v] of [[5, coreV - 14], [5, coreV + 14], [SPINE + 8, WING_N / 2], [SPINE + 8, L - WING_S / 2]]) addDet('#e6e8ea', lbox(u, v, 1.0, 1.4, H + 0.15, 1.0));
    const [mx, mz] = toW([SPINE / 2, coreV]);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, 12, 8), std({ color: '#d0d0d0', metalness: 0.7, roughness: 0.3 }));
    mast.position.set(mx, H + 6.5 + 6, mz); mast.castShadow = true; grp.add(mast);
    const beaconMat = std({ color: '#ff3b30', emissive: '#ff2d20', emissiveIntensity: 2 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), beaconMat);
    beacon.position.set(mx, H + 6.5 + 12.3, mz); grp.add(beacon);
    animated.push((t) => { beaconMat.emissiveIntensity = 0.6 + 2.4 * (Math.sin(t * 3) > 0.6 ? 1 : 0.1); });

    root.add(grp);
    // closed parts block walking; open ends can be walked under but keep trees and lamps out
    for (const w of closedW) colliders.push({ poly: w, bb: bbox(w), h: H });
    for (const w of openW) colliders.push({ poly: w, bb: bbox(w), h: H, pass: true });
    anchors.set(place.id, { x: fcx, z: fcz, y: 0, top: H + 5, poly: F, size: Math.sqrt(polyArea(F)) });
    buildingMeshes.set(place.id, { group: grp, wallMat, h: H, poly: ring, holes: [] });
  }

  // --- campus avenues: wide carriageway, kerbs, footpaths both sides, centre dashes, trees, benches, lamps ---
  {
    const solid = colliders.filter((c) => !c.pass);
    const courts = data.areas.filter((a) => a.inside && a.kind !== 'parking').map((a) => a.poly);
    const avenues = data.ways.filter(isAvenue);
    const others = data.ways.filter((w) => w.inside && ROAD_W[w.hw] && !isAvenue(w) && !(w.layer < 0));
    const gateGaps = [...places.filter((p) => p.cat === 'gate' && p.node).map((p) => data.nodes.find((n) => n.id === p.node)), ...data.nodes.filter((n) => n.inside && n.tags.barrier === 'gate')].filter(Boolean);
    /** Free distance from (x, z) to buildings, courts and the campus wall (0 when inside one). */
    const clearAt = (x, z) => {
      if (!pointInPoly(x, z, data.campus)) return 0;
      let d = distToPolyEdge(x, z, data.campus);
      for (const c of solid) {
        if (x < c.bb.x0 - d || x > c.bb.x1 + d || z < c.bb.z0 - d || z > c.bb.z1 + d) continue;
        if (pointInPoly(x, z, c.poly)) return 0;
        d = Math.min(d, distToPolyEdge(x, z, c.poly));
      }
      for (const p of courts) { if (pointInPoly(x, z, p)) return 0; d = Math.min(d, distToPolyEdge(x, z, p)); }
      return d;
    };
    const distWay = (x, z, w) => {
      let d = Infinity;
      for (let j = 1; j < w.pts.length; j++) d = Math.min(d, distToSeg(x, z, w.pts[j - 1][0], w.pts[j - 1][1], w.pts[j][0], w.pts[j][1])[0]);
      return d;
    };
    const nearGate = (x, z, r) => gateGaps.some((n) => Math.hypot(n.x - x, n.z - z) < r);
    const carG = [], walkG = [], kerbG = [], dashG = [];
    for (const w of avenues) {
      // resample every 2 m so the width can follow the space available
      const P = [w.pts[0]];
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 2));
        for (let j = 1; j <= k; j++) P.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
      }
      if (P.length < 2) continue;
      const N = P.map((p, i) => {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      });
      let hw = P.map(([x, z]) => Math.min(AVE_HW, Math.max(2.5, clearAt(x, z) - 0.4)));
      hw = hw.map((_, i) => Math.min(...hw.slice(Math.max(0, i - 2), i + 3)));
      hw = hw.map((_, i) => { const s = hw.slice(Math.max(0, i - 2), i + 3); return s.reduce((p, q) => p + q, 0) / s.length; });
      carG.push(ribbonGeometry(P, hw.map((h) => h * 2), 0.14));
      for (let i = 0; i + 1 < P.length; i += 4) if (hw[i] > 3) dashG.push(ribbonGeometry([P[i], P[i + 1]], 0.18, 0.165, false));

      for (const s of [-1, 1]) {
        let run = [], kerb = [], acc = 0, nextTree = 4, nextBench = 9, nextLamp = s > 0 ? 3 : 12;
        const flush = () => {
          if (run.length > 2) { walkG.push(ribbonGeometry(run, WALK_W, 0.2, false)); kerbG.push(ribbonGeometry(kerb, 0.3, 0.215, false)); }
          run = []; kerb = [];
        };
        P.forEach(([x, z], i) => {
          const [nx, nz] = N[i], at = (off) => [x + nx * off * s, z + nz * off * s];
          if (i) acc += Math.hypot(x - P[i - 1][0], z - P[i - 1][1]);
          const [fx, fz] = at(hw[i] + 0.3 + WALK_W / 2);
          const ok = clearAt(fx, fz) > WALK_W / 2 + 0.15 && !nearGate(fx, fz, 6) && !avenues.some((o) => o !== w && distWay(fx, fz, o) < AVE_HW + 0.4);
          if (!ok) { flush(); return; }
          run.push([fx, fz]); kerb.push(at(hw[i] + 0.15));
          if (acc >= nextTree) { // avenue tree just behind the footpath, every 10 m
            nextTree = acc + 10;
            // behind the footpath if there is room, otherwise in a tree pit at its outer edge
            const free = ([tx, tz], need) => clearAt(tx, tz) > need && !nearGate(tx, tz, 9) && !avenues.some((o) => o !== w && distWay(tx, tz, o) < AVE_HW + 1.2) && !others.some((o) => distWay(tx, tz, o) < ROAD_W[o.hw] / 2 + 0.9);
            const spot = [at(hw[i] + 0.3 + WALK_W + 1.0), at(hw[i] + 0.3 + WALK_W - 0.45)].find((p, k) => free(p, k ? 0.9 : 1.5));
            if (spot) extraTrees.push([spot[0], spot[1], 0.8 + rand() * 0.3]);
          }
          if (acc >= nextBench) { // green bench on the footpath's outer edge, facing the road, between two trees
            nextBench = acc + 25; nextTree = Math.max(nextTree, acc + 4);
            const [bx, bz] = at(hw[i] + 0.3 + WALK_W - 0.4);
            if (clearAt(bx, bz) > 0.6) benches.push([bx, bz, Math.atan2(-nx * s, -nz * s)]);
          }
          if (acc >= nextLamp) { nextLamp = acc + 18; const [lx, lz] = at(hw[i] + 0.45); extraLamps.push([lx, lz, Math.atan2(-nz * s, -nx * s)]); }
        });
        flush();
      }
    }
    const xzUV = (g) => { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8); return g; };
    const flat = (gs) => mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)));
    const parts = [
      [carG, roadMat.campus, true], [walkG, std({ map: paveTex, color: '#c7a48a', polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), true],
      [kerbG, std({ color: '#d8d4cc', polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), false], [dashG, roadMat.marks, false],
    ];
    for (const [gs, mat, uv] of parts) {
      if (!gs.length) continue;
      const g = flat(gs); if (uv) xzUV(g);
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m);
    }
  }
  console.info('[campus] avenues', extraTrees.length, 'trees', benches.length, 'benches', extraLamps.length, 'lamps');
  if (parkGrass.length) {
    const g = mergeGeometries(parkGrass.map((x) => x.toNonIndexed()));
    const t = TX.makeGround(); t.repeat.set(1, 1);
    const m = new THREE.Mesh(g, std({ map: t, color: '#9fd07a', polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }));
    m.receiveShadow = true; root.add(m);
  }

  // --- merged architectural detail ---
  for (const [color, gs] of Object.entries(det)) {
    const m = new THREE.Mesh(mergeGeometries(gs), std({ color, roughness: 0.8 }));
    m.castShadow = true; m.receiveShadow = true; root.add(m);
  }
  if (doorGeoms.length) { const m = new THREE.Mesh(mergeGeometries(doorGeoms.map(plain)), doorMat); root.add(m); }
  if (chajjas.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ color: '#e6dccb', roughness: 0.85 }), chajjas.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    chajjas.forEach(([x, y, z, ang, w], i) => im.setMatrixAt(i, m4.compose(p3.set(x, y, z), q.setFromAxisAngle(up, -ang), s3.set(w, 0.1, 0.6))));
    im.castShadow = true; im.receiveShadow = true; root.add(im);
  }
  // green slatted benches (one instanced mesh; the front faces local +z)
  if (benches.length) {
    const GREEN = [0.13, 0.42, 0.2], IRON = [0.17, 0.18, 0.19];
    const box = (w, h, d, x, y, z, c, tilt = 0) => {
      const g = new THREE.BoxGeometry(w, h, d); if (tilt) g.rotateX(tilt); g.translate(x, y, z);
      const cc = []; for (let i = 0; i < g.attributes.position.count; i++) cc.push(...c);
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); return g.toNonIndexed();
    };
    const parts = [];
    for (const z of [-0.16, 0, 0.16]) parts.push(box(1.8, 0.05, 0.13, 0, 0.45, z, GREEN));
    for (const y of [0.62, 0.8]) parts.push(box(1.8, 0.12, 0.04, 0, y, -0.27, GREEN, -0.18));
    for (const x of [-0.75, 0.75]) {
      parts.push(box(0.06, 0.42, 0.06, x, 0.21, 0.2, IRON), box(0.06, 0.88, 0.06, x, 0.44, -0.24, IRON), box(0.06, 0.05, 0.5, x, 0.41, -0.02, IRON));
    }
    const bm = new THREE.InstancedMesh(mergeGeometries(parts), std({ color: '#ffffff', vertexColors: true, roughness: 0.55 }), benches.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    benches.forEach(([x, z, a], i) => bm.setMatrixAt(i, m4.compose(p3.set(x, 0.2, z), q.setFromAxisAngle(up, a), one)));
    bm.castShadow = true; bm.receiveShadow = true; root.add(bm);
  }

  function buildOAT(b, place) {
    const grp = new THREE.Group();
    const stage = new THREE.Mesh(flatGeometry(b.poly, [], 1.2, 2), std({ color: '#8a5a44' }));
    const sides = new THREE.Mesh(wallGeometry([b.poly], 0, 1.2, 10, 10, 1), std({ color: '#d9c6a8' }));
    grp.add(stage, sides);
    // back wall on the edge farthest from the ground
    let best = -1, edge = null;
    for (let i = 0; i < b.poly.length; i++) {
      const a = b.poly[i], c = b.poly[(i + 1) % b.poly.length];
      const d = Math.hypot((a[0] + c[0]) / 2 - groundC[0], (a[1] + c[1]) / 2 - groundC[1]);
      if (d > best && Math.hypot(c[0] - a[0], c[1] - a[1]) > 8) { best = d; edge = [a, c]; }
    }
    if (edge) {
      const [a, c] = edge;
      const back = new THREE.Mesh(wallGeometry([[a, c, [c[0] + 0.01, c[1] + 0.01]]], 1.2, 9, 10, 10, 1), std({ color: '#b24a33', side: THREE.DoubleSide }));
      grp.add(back);
      // curved canopy shell
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, L, 24, 1, true, 0, Math.PI / 2.2), std({ color: '#f3ead9', side: THREE.DoubleSide, roughness: 0.6 }));
      shell.rotation.z = Math.PI / 2;
      const ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
      const holder = new THREE.Group();
      holder.add(shell);
      holder.position.set((a[0] + c[0]) / 2, 1.2, (a[1] + c[1]) / 2);
      holder.rotation.y = -ang;
      // orient the shell so it opens toward the ground
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      const nx = -(c[1] - a[1]) / L, nz = (c[0] - a[0]) / L;
      const toward = (groundC[0] - mx) * nx + (groundC[1] - mz) * nz > 0;
      shell.rotation.x = toward ? -Math.PI / 2 + 0.25 : Math.PI / 2 - 0.25 - Math.PI / 2.2;
      grp.add(holder);
      // stage lights
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5;
        const lm = std({ color: '#fff', emissive: ['#ff5e7e', '#ffd166', '#4cc9f0', '#b388ff', '#7bed9f'][i], emissiveIntensity: 0 });
        lampMats.push(lm);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lm);
        bulb.position.set(a[0] + (c[0] - a[0]) * t + nx * (toward ? 1.5 : -1.5), 8.5, a[1] + (c[1] - a[1]) * t + nz * (toward ? 1.5 : -1.5));
        grp.add(bulb);
      }
    }
    grp.traverse((o) => { o.castShadow = true; o.receiveShadow = true; if (o.isMesh) { o.userData.place = place.id; pickables.push(o); } });
    root.add(grp);
    const [cx, cz] = centroid(b.poly);
    anchors.set(place.id, { x: cx, z: cz, y: 0, top: 10, poly: b.poly, size: Math.sqrt(polyArea(b.poly)) });
    colliders.push({ poly: b.poly, bb: bbox(b.poly), h: 1.2 });
  }

  function buildMandir(b, place) {
    const grp = new THREE.Group();
    const [cx, cz] = centroid(b.poly);
    const white = std({ color: '#fbf6ee', roughness: 0.6 });
    const saffron = std({ color: '#ff8c1a', roughness: 0.6 });
    const base = new THREE.Mesh(wallGeometry([b.poly], 0, 3.2, 10, 10, 1), white);
    const plat = new THREE.Mesh(flatGeometry(b.poly, [], 3.2, 2), white);
    const plinth = new THREE.Mesh(wallGeometry([b.poly], 0, 0.6, 10, 10, 1), saffron);
    plinth.scale.set(1.0, 1, 1);
    const s = Math.sqrt(polyArea(b.poly)) * 0.38;
    const shikhara = new THREE.Mesh(new THREE.CylinderGeometry(0.15, s, 5.5, 8, 4), white);
    shikhara.position.set(cx, 3.2 + 2.75, cz);
    const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), std({ color: '#ffcc33', metalness: 0.8, roughness: 0.25 }));
    kalash.position.set(cx, 9.0, cz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), std({ color: '#888' }));
    pole.position.set(cx, 10.3, cz);
    const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.8, 0), new THREE.Vector3(1.2, -0.4, 0)]), std({ color: '#ff7a00', side: THREE.DoubleSide }));
    flag.geometry.computeVertexNormals();
    flag.position.set(cx, 11.4, cz);
    animated.push((t) => { flag.rotation.y = Math.sin(t * 1.7) * 0.5; });
    grp.add(base, plat, plinth, shikhara, kalash, pole, flag);
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.place = place.id; pickables.push(o); } });
    root.add(grp);
    anchors.set(place.id, { x: cx, z: cz, y: 0, top: 11, poly: b.poly, size: 8 });
    colliders.push({ poly: b.poly, bb: bbox(b.poly), h: 3 });
  }

  function buildSolar(b) {
    const tex = TX.makeSolar(); tex.repeat.set(0.25, 0.25);
    const grp = new THREE.Group();
    const g = flatGeometry(b.poly, [], 0, 1); obbUV(g, b.poly);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
    tex.repeat.set(1, 1);
    const panel = new THREE.Mesh(g, std({ map: tex, metalness: 0.5, roughness: 0.25, side: THREE.DoubleSide }));
    panel.position.y = 4.4;
    grp.add(panel);
    for (const [x, z] of b.poly) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 6), std({ color: '#9aa0a6', metalness: 0.6 }));
      p.position.set(x, 2.2, z); grp.add(p);
    }
    grp.traverse((o) => (o.castShadow = true));
    root.add(grp);
  }

  // --- covered corridors around the ground ---
  {
    const postPts = [];
    const roofG = [];
    for (const w of data.ways) {
      if (!w.covered) continue;
      roofG.push(ribbonGeometry(w.pts, 3.6, 3.3, false));
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let s = 0; s <= L; s += 4.5) {
          const x = a[0] + ((b[0] - a[0]) * s) / L, z = a[1] + ((b[1] - a[1]) * s) / L;
          postPts.push([x + nx * 1.6, z + nz * 1.6], [x - nx * 1.6, z - nz * 1.6]);
        }
      }
    }
    if (roofG.length) {
      const m = new THREE.Mesh(mergeGeometries(roofG.map((g) => g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g)), std({ color: '#b5533c', side: THREE.DoubleSide, roughness: 0.7 }));
      m.castShadow = true; m.receiveShadow = true; root.add(m);
      const pg = new THREE.CylinderGeometry(0.12, 0.12, 3.3, 6); pg.translate(0, 1.65, 0);
      const posts = new THREE.InstancedMesh(pg, std({ color: '#f1e6d4' }), postPts.length);
      const m4 = new THREE.Matrix4();
      postPts.forEach(([x, z], i) => posts.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
      posts.castShadow = true; root.add(posts);
    }
  }

  // --- campus boundary wall & gates ---
  const gateNodes = places.filter((p) => p.cat === 'gate' && p.node && p.id !== 'parking').map((p) => ({ p, n: data.nodes.find((n) => n.id === p.node) })).filter((g) => g.n);
  const extraGates = data.nodes.filter((n) => n.inside && n.tags.barrier === 'gate');
  const gaps = [...gateNodes.map((g) => [g.n.x, g.n.z]), ...extraGates.map((n) => [n.x, n.z])];
  {
    const parts = [], caps = [];
    const C = data.campus;
    for (let i = 0; i < C.length; i++) {
      const a = C[i], b = C[(i + 1) % C.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const step = 0.5;
      let runStart = null;
      const flush = (s0, s1) => {
        const len = s1 - s0; if (len < 0.6) return;
        const mid = (s0 + s1) / 2 / L;
        const x = a[0] + (b[0] - a[0]) * mid, z = a[1] + (b[1] - a[1]) * mid;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const w = new THREE.BoxGeometry(len, 2.3, 0.3); w.rotateY(-ang); w.translate(x, 1.15, z); parts.push(w);
        const c = new THREE.BoxGeometry(len, 0.15, 0.45); c.rotateY(-ang); c.translate(x, 2.35, z); caps.push(c);
        for (let s = s0; s <= s1; s += 6) {
          const t = s / L; const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
          const p = new THREE.BoxGeometry(0.55, 2.7, 0.55); p.rotateY(-ang); p.translate(px, 1.35, pz); caps.push(p);
        }
      };
      for (let s = 0; s <= L; s += step) {
        const t = s / L; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const blocked = gaps.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 5.5);
        if (!blocked && runStart === null) runStart = s;
        if (blocked && runStart !== null) { flush(runStart, s); runStart = null; }
      }
      if (runStart !== null) flush(runStart, L);
    }
    const wall = new THREE.Mesh(mergeGeometries(parts), std({ color: '#efe1c8' }));
    const cap = new THREE.Mesh(mergeGeometries(caps), std({ color: '#a8503a' }));
    for (const m of [wall, cap]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  }
  for (const { p, n } of gateNodes) {
    // orient along nearest campus edge
    let best = Infinity, ang = 0;
    const C = data.campus;
    for (let i = 0; i < C.length; i++) {
      const a = C[i], b = C[(i + 1) % C.length];
      const [d] = distToSeg(n.x, n.z, a[0], a[1], b[0], b[1]);
      if (d < best) { best = d; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
    const grp = new THREE.Group();
    const pil = std({ color: '#b24a33' });
    const span = p.id === 'backgate' ? 7 : 10;
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), pil); pillar.position.set((s * span) / 2, 2.6, 0); grp.add(pillar);
      const capm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.4), std({ color: '#f1e6d4' })); capm.position.set((s * span) / 2, 5.35, 0); grp.add(capm);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.2, 1.2, 0.6), std({ color: '#f1e6d4' })); beam.position.y = 5.0; grp.add(beam);
    const label = p.name.toUpperCase();
    const signTex = TX.makeSignTexture(label);
    for (const s of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.75, span * 0.75 / 4), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.05 }));
      nightMats.push(sign.material);
      sign.position.set(0, 5.0, s * 0.31); if (s < 0) sign.rotation.y = Math.PI; grp.add(sign);
    }
    grp.position.set(n.x, 0, n.z); grp.rotation.y = -ang;
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.place = p.id; pickables.push(o); } });
    root.add(grp);
  }

  // --- trees ---
  // spatial hash grids so tree/lamp placement stays fast
  const CELL = 24;
  const grid = () => new Map();
  const gkey = (i, j) => i * 100003 + j;
  const gadd = (g, x0, z0, x1, z1, item) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = gkey(i, j); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(item);
      }
  };
  const gget = (g, x, z) => g.get(gkey(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
  const roadGrid = grid();
  data.ways.forEach((w, wi) => {
    if (!ROAD_W[w.hw]) return; const width = clearHalf(w) * 2;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i], pad = width / 2 + 4;
      gadd(roadGrid, Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, [a, b, width / 2, wi]);
    }
  });
  const bGrid = grid();
  for (const c of colliders) gadd(bGrid, c.bb.x0 - 4, c.bb.z0 - 4, c.bb.x1 + 4, c.bb.z1 + 4, c);
  const blockedAreas = data.areas.filter((a) => a.inside || ['parking', 'industrial'].includes(a.kind)).map((a) => a.poly);
  const nearRoad = (x, z, pad) => gget(roadGrid, x, z).some(([a, b, hw]) => distToSeg(x, z, a[0], a[1], b[0], b[1])[0] < hw + pad);
  const inBuilding = (x, z, pad) => gget(bGrid, x, z).some((c) => x > c.bb.x0 - pad && x < c.bb.x1 + pad && z > c.bb.z0 - pad && z < c.bb.z1 + pad && (pointInPoly(x, z, c.poly) || distToPolyEdge(x, z, c.poly) < pad));
  const roundTrees = [...extraTrees], tallTrees = [];
  // Ashoka trees lining the boundary wall (inside)
  {
    const C = data.campus;
    const [ccx, ccz] = centroid(C);
    for (let i = 0; i < C.length; i++) {
      const a = C[i], b = C[(i + 1) % C.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (!pointInPoly(mx + nx * 2, mz + nz * 2, C)) { nx = -nx; nz = -nz; }
      for (let s = 3; s < L - 2; s += 5.5) {
        const x = a[0] + ((b[0] - a[0]) * s) / L + nx * 2.4, z = a[1] + ((b[1] - a[1]) * s) / L + nz * 2.4;
        if (gaps.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 9)) continue;
        if (inBuilding(x, z, 1.2) || nearRoad(x, z, 0.8)) continue;
        tallTrees.push([x, z, 0.85 + rand() * 0.35]);
      }
    }
    void ccx; void ccz;
  }
  // scattered campus trees
  for (let x = -170; x < 170; x += 8) for (let z = -125; z < 125; z += 8) {
    const px = x + (rand() - 0.5) * 6, pz = z + (rand() - 0.5) * 6;
    if (!pointInPoly(px, pz, data.campus) || distToPolyEdge(px, pz, data.campus) < 5) continue;
    if (rand() > 0.6) continue;
    if (inBuilding(px, pz, 3) || nearRoad(px, pz, 1.5) || blockedAreas.some((p) => pointInPoly(px, pz, p) || distToPolyEdge(px, pz, p) < 1.5)) continue;
    roundTrees.push([px, pz, 0.75 + rand() * 0.6]);
  }
  // outside: avenue trees along major roads + scattered greenery
  for (const w of data.ways) {
    if (!['trunk', 'secondary', 'tertiary', 'residential', 'primary'].includes(w.hw) || w.inside) continue;
    const off = ROAD_W[w.hw] / 2 + 2.2;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (let s = 4; s < L; s += mobile ? 18 : 11) for (const side of [-1, 1]) {
        const x = a[0] + ((b[0] - a[0]) * s) / L + nx * off * side, z = a[1] + ((b[1] - a[1]) * s) / L + nz * off * side;
        if (Math.hypot(x, z) > 650 || pointInPoly(x, z, data.campus)) continue;
        if (inBuilding(x, z, 1.5) || nearRoad(x, z, 0.6)) continue;
        roundTrees.push([x, z, 0.8 + rand() * 0.5]);
      }
    }
  }
  for (let i = 0; i < (mobile ? 450 : 1000); i++) {
    const ang = rand() * Math.PI * 2, r = 180 + Math.sqrt(rand()) * 480;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (pointInPoly(x, z, data.campus) || inBuilding(x, z, 2.5) || nearRoad(x, z, 1.5)) continue;
    roundTrees.push([x, z, 0.7 + rand() * 0.7]);
  }
  {
    const trunkG = new THREE.CylinderGeometry(0.14, 0.26, 3, 6); trunkG.translate(0, 1.5, 0);
    // crown = overlapping lumpy spheres, darker underneath (ambient occlusion baked into vertex colours)
    const lobe = (r, x, y, z, seed) => {
      let g = new THREE.IcosahedronGeometry(r, 1);
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g = mergeVertices(g); // shared corners move together, so the jitter leaves no cracks
      const p = g.attributes.position, r2 = TX.rng(seed);
      for (let i = 0; i < p.count; i++) { const k = 0.82 + r2() * 0.36; p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.86 + y, p.getZ(i) * k + z); }
      return g.toNonIndexed();
    };
    const shadeCrown = (g, y0, y1) => {
      const p = g.attributes.position, c = [], r3 = TX.rng(91);
      for (let i = 0; i < p.count; i++) {
        const t = clamp01((p.getY(i) - y0) / (y1 - y0));
        const v = (0.42 + 0.58 * t * t * (3 - 2 * t)) * (0.92 + r3() * 0.16);
        c.push(v, v, v);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      g.computeVertexNormals();
      return g;
    };
    const crownG = shadeCrown(mergeGeometries([lobe(2.0, 0, 4.1, 0, 77), lobe(1.45, 1.25, 3.55, 0.55, 78), lobe(1.35, -0.95, 4.65, -0.7, 79), lobe(1.2, -0.3, 3.4, 1.1, 80)]), 2.2, 6.2);
    let tallG = new THREE.CylinderGeometry(0.25, 1.0, 7.5, 8, 4); tallG.deleteAttribute('normal'); tallG.deleteAttribute('uv'); tallG = mergeVertices(tallG);
    { const p = tallG.attributes.position, r2 = TX.rng(55); for (let i = 0; i < p.count; i++) { const k = 0.85 + r2() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); } }
    tallG = tallG.toNonIndexed(); tallG.translate(0, 5.2, 0); shadeCrown(tallG, 1.5, 9);
    const tallTrunk = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 5); tallTrunk.translate(0, 0.8, 0);
    const leafMat = std({ color: '#ffffff', vertexColors: true, roughness: 0.92 });
    const trunks = new THREE.InstancedMesh(trunkG, std({ color: '#5e4330' }), roundTrees.length);
    const crowns = new THREE.InstancedMesh(crownG, leafMat, roundTrees.length);
    const tTr = new THREE.InstancedMesh(tallTrunk, std({ color: '#5b3d2a' }), tallTrees.length);
    const tCr = new THREE.InstancedMesh(tallG, leafMat, tallTrees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), col = new THREE.Color();
    const greens = ['#58843c', '#628f43', '#4a7a36', '#6e9a48', '#7d9a45', '#557f3a', '#6b8a3f'];
    roundTrees.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m4.compose(v3.set(x, 0, z), q, s3.set(s, s * (0.9 + rand() * 0.3), s));
      trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.set(greens[Math.floor(rand() * greens.length)]).offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.06));
    });
    tallTrees.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m4.compose(v3.set(x, 0, z), q, s3.set(s, s, s));
      tTr.setMatrixAt(i, m4); tCr.setMatrixAt(i, m4);
      tCr.setColorAt(i, col.set('#3a6e2f').offsetHSL(0, 0, (rand() - 0.5) * 0.05));
    });
    for (const m of [trunks, crowns, tTr, tCr]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  }

  // --- parked cars along streets outside campus (one instanced mesh, ~48 triangles each) ---
  {
    const spots = [];
    data.ways.forEach((w, wi) => {
      if (w.inside || !['residential', 'service', 'tertiary', 'unclassified'].includes(w.hw)) return;
      const hw = ROAD_W[w.hw] / 2;
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 12) continue;
        const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let s = 6; s < L - 6; s += 5.6) {
          if (rand() > (mobile ? 0.18 : 0.32)) continue;
          const side = rand() < 0.5 ? -1 : 1;
          const x = a[0] + ((b[0] - a[0]) * s) / L + nx * side * (hw - 1.05), z = a[1] + ((b[1] - a[1]) * s) / L + nz * side * (hw - 1.05);
          if (Math.hypot(x, z) > 600 || pointInPoly(x, z, data.campus) || inBuilding(x, z, 1.2)) continue;
          // keep junctions clear: no other road within its half-width + 3 m
          if (gget(roadGrid, x, z).some(([p, q2, h2, wj]) => wj !== wi && distToSeg(x, z, p[0], p[1], q2[0], q2[1])[0] < h2 + 3)) continue;
          spots.push([x, z, ang + (rand() < 0.5 ? 0 : Math.PI)]);
        }
      }
    });
    if (spots.length) {
      const box = (w, h, d, x, y, c) => {
        const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, 0);
        const n = g.attributes.position.count, cc = []; for (let i = 0; i < n; i++) cc.push(...c);
        g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); return g;
      };
      const carG = mergeGeometries([
        box(4.1, 0.7, 1.72, 0, 0.62, [1, 1, 1]),               // body (takes the instance colour)
        box(2.2, 0.58, 1.58, -0.25, 1.24, [0.12, 0.14, 0.17]), // glass cabin
        box(2.0, 0.06, 1.5, -0.25, 1.55, [1, 1, 1]),           // roof
        box(3.3, 0.5, 1.8, 0, 0.3, [0.05, 0.05, 0.05]),        // wheels / underside
      ].map((g) => g.toNonIndexed()));
      const cars = new THREE.InstancedMesh(carG, std({ color: '#ffffff', vertexColors: true, roughness: 0.35, metalness: 0.3 }), spots.length);
      const CC = ['#f2f2f0', '#f2f2f0', '#c9ccd1', '#9aa0a8', '#2b2e33', '#1c1d20', '#8c1c22', '#2c4f86', '#6e6a62', '#b8b0a2'];
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
      spots.forEach(([x, z, a], i) => {
        m4.compose(new THREE.Vector3(x, 0.1, z), q.setFromAxisAngle(up, -a), one);
        cars.setMatrixAt(i, m4); cars.setColorAt(i, col.set(CC[Math.floor(rand() * CC.length)]));
      });
      cars.castShadow = true; cars.receiveShadow = true; root.add(cars);
    }
  }

  // --- street lamps along campus roads ---
  {
    const lamps = [...extraLamps];
    for (const w of data.ways) {
      if (!w.inside || !['service', 'footway'].includes(w.hw) || w.covered || isAvenue(w)) continue;
      const off = ROAD_W[w.hw] / 2 + 0.5;
      let acc = 6;
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
        const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let s = acc; s < L; s += 16) {
          const x = a[0] + ((b[0] - a[0]) * s) / L + nx * off, z = a[1] + ((b[1] - a[1]) * s) / L + nz * off;
          if (!inBuilding(x, z, 0.6) && pointInPoly(x, z, data.campus)) lamps.push([x, z, Math.atan2(-nz, -nx)]);
          acc = s + 16 - L;
        }
        if (acc < 0) acc = 0;
      }
    }
    const poleG = new THREE.CylinderGeometry(0.07, 0.1, 5, 6); poleG.translate(0, 2.5, 0);
    const armG = new THREE.BoxGeometry(1.1, 0.08, 0.08); armG.translate(0.45, 5, 0);
    const bulbG = new THREE.SphereGeometry(0.22, 8, 6); bulbG.translate(0.95, 4.85, 0);
    const pole = new THREE.InstancedMesh(mergeGeometries([poleG, armG]), std({ color: '#3a3f46', metalness: 0.5, roughness: 0.5 }), lamps.length);
    const bulbMat = std({ color: '#fff6dd', emissive: '#ffd89a', emissiveIntensity: 0 }); lampMats.push(bulbMat);
    const bulb = new THREE.InstancedMesh(bulbG, bulbMat, lamps.length);
    const glowTex = TX.makeGlow();
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowGroup = new THREE.Group();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    lamps.forEach(([x, z, r], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -r);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(i, m4); bulb.setMatrixAt(i, m4);
      const sp = new THREE.Sprite(glowMat);
      const lp = new THREE.Vector3(0.95, 4.85, 0).applyQuaternion(q);
      sp.position.set(x + lp.x, 4.85, z + lp.z); sp.scale.set(3.2, 3.2, 1);
      glowGroup.add(sp);
    });
    pole.castShadow = true; root.add(pole, bulb, glowGroup);
    lampMats.push({ isGlow: true, mat: glowMat });
  }

  return {
    root, pickables, anchors, colliders, buildingMeshes,
    setNight(n) {
      for (const m of nightMats) m.emissiveIntensity = n * 1.25;
      for (const m of lampMats) {
        if (m.isGlow) m.mat.opacity = n * 0.85;
        else m.emissiveIntensity = n * 4;
      }
    },
    update(t) { for (const f of animated) f(t); },
  };
}
