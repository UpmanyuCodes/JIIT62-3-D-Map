// Converts raw OpenStreetMap JSON into compact local-metre geometry for the 3D map.
// Map data © OpenStreetMap contributors, available under the ODbL.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('../src/data/osm-raw.json', import.meta.url), 'utf8'));
const CAMPUS_ID = 71847594;

// Local tangent-plane projection centred on the campus.
const LAT0 = 28.63005, LON0 = 77.37252;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110574;
const r1 = (v) => Math.round(v * 10) / 10;
const P = (p) => [r1((p.lon - LON0) * KX), r1((LAT0 - p.lat) * KZ)]; // x = east, z = south

const ring = (geom) => {
  const pts = geom.map(P);
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  return pts;
};
const isClosed = (g) => g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

function pointInPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// Join open member ways of a multipolygon into closed rings.
function joinRings(members) {
  const segs = members.map((m) => m.geometry.map(P));
  const rings = [];
  while (segs.length) {
    let cur = segs.shift();
    let guard = 0;
    while (guard++ < 200) {
      const a = cur[0], b = cur[cur.length - 1];
      if (cur.length > 2 && a[0] === b[0] && a[1] === b[1]) break;
      const i = segs.findIndex((s) => {
        const s0 = s[0], s1 = s[s.length - 1];
        return (s0[0] === b[0] && s0[1] === b[1]) || (s1[0] === b[0] && s1[1] === b[1]);
      });
      if (i < 0) break;
      let s = segs.splice(i, 1)[0];
      if (!(s[0][0] === b[0] && s[0][1] === b[1])) s = s.reverse();
      cur = cur.concat(s.slice(1));
    }
    const a = cur[0], b = cur[cur.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) cur.pop();
    if (cur.length >= 3) rings.push(cur);
  }
  return rings;
}

const campusEl = raw.elements.find((e) => e.id === CAMPUS_ID && e.type === 'way');
const campus = ring(campusEl.geometry);
const inCampus = (pts) => {
  const [cx, cz] = centroid(pts);
  return pointInPoly(cx, cz, campus);
};

const out = {
  origin: { lat: LAT0, lon: LON0 },
  campus,
  buildings: [],
  areas: [],
  ways: [],
  nodes: [],
};

const seen = new Set();
const relMemberWays = new Set();
for (const e of raw.elements) if (e.type === 'relation' && e.tags?.building) for (const m of e.members || []) if (m.type === 'way') relMemberWays.add(m.ref);

for (const e of raw.elements) {
  const key = e.type + e.id;
  if (seen.has(key)) continue;
  seen.add(key);
  const t = e.tags || {};
  if (e.id === CAMPUS_ID) continue;

  if (e.type === 'relation' && t.building) {
    const outers = (e.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry);
    const inners = (e.members || []).filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry);
    const oRings = joinRings(outers), iRings = joinRings(inners);
    for (const poly of oRings) {
      out.buildings.push({ id: e.id, type: 'r', name: t.name || '', levels: +t['building:levels'] || 0, h: +t.height || 0, kind: t.building, poly, holes: iRings.filter((h) => pointInPoly(h[0][0], h[0][1], poly)), inside: inCampus(poly) });
    }
    continue;
  }

  if (e.type === 'way' && e.geometry) {
    if (t.building && !relMemberWays.has(e.id) && isClosed(e.geometry)) {
      const poly = ring(e.geometry);
      out.buildings.push({ id: e.id, type: 'w', name: t.name || '', levels: +t['building:levels'] || 0, h: +t.height || 0, kind: t.building, poly, holes: [], inside: inCampus(poly), tags: pick(t) });
      continue;
    }
    if (t.highway && !t.area) {
      const pts = e.geometry.map(P);
      out.ways.push({ id: e.id, hw: t.highway, name: t.name || '', layer: +t.layer || 0, tunnel: t.tunnel || '', covered: /covered/i.test(t.description || '') ? 1 : 0, pts, inside: pts.some(([x, z]) => pointInPoly(x, z, campus)) ? 1 : 0 });
      continue;
    }
    const areaKind = t.leisure || t.landuse || t.amenity || t.natural;
    if (areaKind && isClosed(e.geometry) && !relMemberWays.has(e.id)) {
      const poly = ring(e.geometry);
      out.areas.push({ id: e.id, kind: areaKind, cls: t.leisure ? 'leisure' : t.landuse ? 'landuse' : t.amenity ? 'amenity' : 'natural', sport: t.sport || '', name: t.name || '', layer: +t.layer || 0, poly, inside: inCampus(poly) ? 1 : 0 });
    }
    continue;
  }

  if (e.type === 'node') {
    const [x, z] = P(e);
    out.nodes.push({ id: e.id, x, z, inside: pointInPoly(x, z, campus) ? 1 : 0, tags: pick(t) });
  }
}

function pick(t) {
  const keep = ['name', 'amenity', 'shop', 'leisure', 'barrier', 'tourism', 'highway', 'sport', 'opening_hours', 'description', 'cuisine', 'natural'];
  const o = {};
  for (const k of keep) if (t[k]) o[k] = t[k];
  return o;
}

const js = `// Generated by scripts/build-data.mjs — map data © OpenStreetMap contributors (ODbL)\nexport default ${JSON.stringify(out)};\n`;
writeFileSync(new URL('../src/data/campus-data.js', import.meta.url), js);
console.log(`buildings ${out.buildings.length} (campus ${out.buildings.filter((b) => b.inside).length}), areas ${out.areas.length}, ways ${out.ways.length}, nodes ${out.nodes.length}, ${(js.length / 1024).toFixed(1)} KB`);
const xs = out.buildings.flatMap((b) => b.poly.map((p) => p[0])), zs = out.buildings.flatMap((b) => b.poly.map((p) => p[1]));
console.log('extent x', Math.min(...xs), Math.max(...xs), 'z', Math.min(...zs), Math.max(...zs));
console.log('campus', JSON.stringify(campus));
for (const b of out.buildings.filter((b) => b.inside)) console.log(b.id, b.name, b.levels, JSON.stringify(centroid(b.poly).map(r1)));
