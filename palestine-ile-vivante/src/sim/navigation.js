// Grille de navigation + A* (8 voisins). Les bâtiments bloquent le passage,
// la mer aussi, sauf la jetée. Le relief raide coûte plus cher.

import { heightAt, WORLD } from '../world/heightmap.js';
import { ZONES } from '../world/layout.js';

const CELL = 2;

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n, f) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}

export class NavGrid {
  constructor(buildings) {
    this.n = Math.ceil((WORLD.half * 2) / CELL);
    this.cost = new Float32Array(this.n * this.n); // 0 = bloqué
    this.height = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const { x, z } = this.toWorld(i, j);
        const h = heightAt(x, z);
        this.height[j * this.n + i] = h;
        this.cost[j * this.n + i] = h > WORLD.sea + 0.3 ? 1 : 0;
      }
    }
    // Pente
    for (let j = 1; j < this.n - 1; j++) {
      for (let i = 1; i < this.n - 1; i++) {
        const k = j * this.n + i;
        if (!this.cost[k]) continue;
        const dh = Math.abs(this.height[k + 1] - this.height[k - 1]) + Math.abs(this.height[k + this.n] - this.height[k - this.n]);
        this.cost[k] = 1 + dh * 0.6;
      }
    }
    // Jetée praticable
    const jt = ZONES.jetee;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      this.setWalkable(jt.x + (jt.x2 - jt.x) * t, jt.z + (jt.z2 - jt.z) * t, 1);
    }
    for (const b of buildings) this.blockBuilding(b);
  }

  toCell(x, z) {
    return {
      i: Math.max(0, Math.min(this.n - 1, Math.floor((x + WORLD.half) / CELL))),
      j: Math.max(0, Math.min(this.n - 1, Math.floor((z + WORLD.half) / CELL))),
    };
  }
  toWorld(i, j) {
    return { x: -WORLD.half + (i + 0.5) * CELL, z: -WORLD.half + (j + 0.5) * CELL };
  }
  setWalkable(x, z, c) {
    const { i, j } = this.toCell(x, z);
    this.cost[j * this.n + i] = c;
  }

  blockBuilding(b) {
    if (b.type === 'halle') return; // un abri ouvert : on passe dessous
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const hw = b.w / 2 + 0.4, hd = b.d / 2 + 0.4;
    const R = Math.hypot(hw, hd);
    const a = this.toCell(b.x - R, b.z - R), z = this.toCell(b.x + R, b.z + R);
    for (let j = a.j; j <= z.j; j++) {
      for (let i = a.i; i <= z.i; i++) {
        const p = this.toWorld(i, j);
        const dx = p.x - b.x, dz = p.z - b.z;
        // repère local du bâtiment (rotation inverse)
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) < hw && Math.abs(lz) < hd) this.cost[j * this.n + i] = 0;
      }
    }
    // la porte reste accessible
    this.setWalkable(b.door.x, b.door.z, 1);
  }

  walkable(x, z) {
    const { i, j } = this.toCell(x, z);
    return this.cost[j * this.n + i] > 0;
  }

  nearestWalkable(x, z) {
    const c = this.toCell(x, z);
    if (this.cost[c.j * this.n + c.i] > 0) return c;
    for (let r = 1; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = c.i + di, j = c.j + dj;
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          if (this.cost[j * this.n + i] > 0) return { i, j };
        }
      }
    }
    return c;
  }

  // Renvoie une liste de points {x,z} de (sx,sz) à (tx,tz), ou null.
  findPath(sx, sz, tx, tz) {
    const n = this.n;
    const s = this.nearestWalkable(sx, sz);
    const t = this.nearestWalkable(tx, tz);
    const start = s.j * n + s.i, goal = t.j * n + t.i;
    if (start === goal) return [{ x: tx, z: tz }];
    const g = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const h = (k) => {
      const dx = Math.abs((k % n) - t.i), dz = Math.abs(((k / n) | 0) - t.j);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, h(start));
    let expanded = 0;
    while (heap.size) {
      const k = heap.pop();
      if (k === goal) break;
      if (closed[k]) continue;
      closed[k] = 1;
      if (++expanded > 9000) return null;
      const ki = k % n, kj = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ki + di, j = kj + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const nk = j * n + i;
          const c = this.cost[nk];
          if (!c || closed[nk]) continue;
          // pas de coupe de coin à travers un obstacle
          if (di && dj && (!this.cost[kj * n + i] || !this.cost[j * n + ki])) continue;
          const ng = g[k] + c * (di && dj ? 1.414 : 1);
          if (ng < g[nk]) {
            g[nk] = ng;
            came[nk] = k;
            heap.push(nk, ng + h(nk));
          }
        }
      }
    }
    if (came[goal] === -1) return null;
    const cells = [];
    for (let k = goal; k !== -1 && k !== start; k = came[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => this.toWorld(k % n, (k / n) | 0));
    return this.smooth([{ x: sx, z: sz }, ...pts.slice(0, -1), { x: tx, z: tz }]).slice(1);
  }

  // Lissage par lignes de vue : retire les points intermédiaires inutiles.
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 8);
      while (j > i + 1 && !this.lineClear(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
  lineClear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!this.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }
}
