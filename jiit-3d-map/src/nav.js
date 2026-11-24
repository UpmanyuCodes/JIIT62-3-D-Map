// Walking-route graph built from OpenStreetMap paths and service roads inside the campus.
import { distToSeg } from './world.js';

const WALKABLE = new Set(['service', 'footway', 'path', 'steps', 'pedestrian', 'living_street', 'residential', 'cycleway']);

export class NavGraph {
  constructor(ways) {
    this.nodes = [];
    this.adj = [];
    this.keyMap = new Map();
    for (const w of ways) {
      if (!w.inside || !WALKABLE.has(w.hw)) continue;
      let prev = -1;
      for (const [x, z] of w.pts) {
        const id = this.node(x, z);
        if (prev >= 0 && prev !== id) this.link(prev, id);
        prev = id;
      }
    }
    this.joinComponents(45);
  }
  node(x, z) {
    const k = Math.round(x * 2) + ',' + Math.round(z * 2);
    let id = this.keyMap.get(k);
    if (id === undefined) {
      id = this.nodes.length;
      this.nodes.push({ x, z });
      this.adj.push(new Map());
      this.keyMap.set(k, id);
    }
    return id;
  }
  link(a, b) {
    const d = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
    this.adj[a].set(b, d);
    this.adj[b].set(a, d);
  }
  unlink(a, b) { this.adj[a].delete(b); this.adj[b].delete(a); }
  edges() {
    const out = [];
    this.adj.forEach((m, a) => m.forEach((_, b) => { if (a < b) out.push([a, b]); }));
    return out;
  }
  components() {
    const comp = new Array(this.nodes.length).fill(-1);
    let c = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      if (comp[i] >= 0) continue;
      const st = [i]; comp[i] = c;
      while (st.length) { const v = st.pop(); for (const u of this.adj[v].keys()) if (comp[u] < 0) { comp[u] = c; st.push(u); } }
      c++;
    }
    return { comp, count: c };
  }
  // Connect separate path networks with short virtual links (e.g. a footway ending near a road).
  joinComponents(maxGap) {
    for (let iter = 0; iter < 30; iter++) {
      const { comp, count } = this.components();
      if (count <= 1) return;
      const sizes = new Array(count).fill(0); comp.forEach((c) => sizes[c]++);
      const main = sizes.indexOf(Math.max(...sizes));
      let best = { d: Infinity };
      const edges = this.edges();
      for (let i = 0; i < this.nodes.length; i++) {
        if (comp[i] === main) continue;
        const p = this.nodes[i];
        for (const [a, b] of edges) {
          if (comp[a] !== main) continue;
          const A = this.nodes[a], B = this.nodes[b];
          const [d, qx, qz] = distToSeg(p.x, p.z, A.x, A.z, B.x, B.z);
          if (d < best.d) best = { d, i, a, b, qx, qz };
        }
      }
      if (best.d > maxGap) return;
      const q = this.splitEdge(best.a, best.b, best.qx, best.qz);
      this.link(best.i, q);
    }
  }
  splitEdge(a, b, x, z) {
    const id = this.node(x, z);
    if (id === a || id === b) return id;
    this.unlink(a, b);
    this.link(a, id); this.link(id, b);
    return id;
  }
  nearestOnGraph(x, z, edges = this.edges()) {
    let best = { d: Infinity };
    for (const [a, b] of edges) {
      const A = this.nodes[a], B = this.nodes[b];
      const [d, qx, qz] = distToSeg(x, z, A.x, A.z, B.x, B.z);
      if (d < best.d) best = { d, a, b, qx, qz };
    }
    return best;
  }
  /** Adds a destination node. For buildings, the "door" is the point on the outline closest to a path. */
  attach(anchor) {
    let door = [anchor.x, anchor.z];
    let best = this.nearestOnGraph(anchor.x, anchor.z);
    if (anchor.poly && anchor.poly.length > 2) {
      best = { d: Infinity };
      const P = anchor.poly, edges = this.edges();
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0; s <= L; s += 2) {
          const x = a[0] + ((b[0] - a[0]) * s) / L, z = a[1] + ((b[1] - a[1]) * s) / L;
          const n = this.nearestOnGraph(x, z, edges);
          if (n.d < best.d) { best = n; door = [x, z]; }
        }
      }
    }
    const q = this.splitEdge(best.a, best.b, best.qx, best.qz);
    if (best.d < 0.6) return q;
    const d = this.node(door[0], door[1]);
    this.link(q, d);
    return d;
  }
  route(from, to) {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[from] = 0;
    for (;;) {
      let v = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; v = i; }
      if (v < 0 || v === to) break;
      done[v] = 1;
      for (const [u, w] of this.adj[v]) if (dist[v] + w < dist[u]) { dist[u] = dist[v] + w; prev[u] = v; }
    }
    if (!isFinite(dist[to])) return null;
    const path = [];
    for (let v = to; v >= 0; v = prev[v]) path.push([this.nodes[v].x, this.nodes[v].z]);
    path.reverse();
    return { pts: path, length: dist[to] };
  }
}
