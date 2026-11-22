import * as THREE from 'three';

/*
 * Procedural "soft architecture" helpers.
 * Everything is built in the XZ plane (plan view) and extruded along Y,
 * with analytic normals so curved surfaces stay perfectly smooth.
 */

const HALF_PI = Math.PI / 2;

/**
 * Rounded rectangle outline (closed) in the XZ plane, centred on the origin.
 * radii = [frontRight, frontLeft, backLeft, backRight]   (front = +Z)
 * Each point carries its outward normal.
 */
export function outline(w, d, radii, density = 18) {
  const hw = w / 2;
  const hd = d / 2;
  const r = radii.map((v) => Math.min(Math.max(v, 0.002), hw, hd));
  const corners = [
    [hw - r[0], hd - r[0], r[0], 0],
    [-hw + r[1], hd - r[1], r[1], HALF_PI],
    [-hw + r[2], -hd + r[2], r[2], Math.PI],
    [hw - r[3], -hd + r[3], r[3], Math.PI * 1.5],
  ];
  const pts = [];
  for (const [cx, cz, rr, a0] of corners) {
    const segs = Math.max(4, Math.ceil(rr * density));
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (i / segs) * HALF_PI;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      pts.push({ x: cx + nx * rr, z: cz + nz * rr, nx, nz });
    }
  }
  return pts;
}

/** Make every triangle face the same way as its vertex normals. */
function orient(P, N, I) {
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3;
    const b = I[t + 1] * 3;
    const c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    const nx = N[a] + N[b] + N[c];
    const ny = N[a + 1] + N[b + 1] + N[c + 1];
    const nz = N[a + 2] + N[b + 2] + N[c + 2];
    if (fx * nx + fy * ny + fz * nz < 0) {
      const tmp = I[t + 1];
      I[t + 1] = I[t + 2];
      I[t + 2] = tmp;
    }
  }
}

function build(P, N, I, uv) {
  orient(P, N, I);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(I);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * A soft slab: rounded rectangle in plan, quarter-round bevel on the top & bottom edges.
 * Centred on the origin, total height = h.
 */
export function slab(w, d, h, radii, bevel = 0.08, bevelSegs = 6) {
  const b = Math.min(bevel, h * 0.49, w * 0.49, d * 0.49);
  const rr = (Array.isArray(radii) ? radii : [radii, radii, radii, radii]).map((r) => Math.max(r, b + 0.015));
  const pts = outline(w, d, rr);
  const n = pts.length;
  const P = [];
  const N = [];
  const I = [];

  const prof = [];
  for (let k = 0; k <= bevelSegs; k++) prof.push([-HALF_PI + (k / bevelSegs) * HALF_PI, -h / 2 + b]);
  for (let k = 0; k <= bevelSegs; k++) prof.push([(k / bevelSegs) * HALF_PI, h / 2 - b]);

  for (const [phi, cy] of prof) {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (const p of pts) {
      P.push(p.x - p.nx * b * (1 - c), cy + b * s, p.z - p.nz * b * (1 - c));
      N.push(p.nx * c, s, p.nz * c);
    }
  }
  for (let j = 0; j < prof.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i;
      const bb = j * n + i2;
      const c = (j + 1) * n + i2;
      const dd = (j + 1) * n + i;
      I.push(a, c, bb, a, dd, c);
    }
  }

  // caps
  const contour = pts.map((p) => new THREE.Vector2(p.x - p.nx * b, p.z - p.nz * b));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [sign, y] of [[1, h / 2], [-1, -h / 2]]) {
    const base = P.length / 3;
    for (const v of contour) {
      P.push(v.x, y, v.y);
      N.push(0, sign, 0);
    }
    for (const t of tris) I.push(base + t[0], base + t[1], base + t[2]);
  }
  return build(P, N, I);
}

/** Uniformly resample a closed outline (keeps interpolated normals). */
export function resample(pts, step = 0.05) {
  const out = [];
  const n = pts.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len < 1e-6) continue;
    let t = carry;
    while (t < len) {
      const f = t / len;
      let nx = p.nx + (q.nx - p.nx) * f;
      let nz = p.nz + (q.nz - p.nz) * f;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      out.push({ x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, nx, nz });
      t += step;
    }
    carry = t - len;
  }
  return out;
}

/** Split a closed sample loop into contiguous runs where pred() is constant. */
export function runs(samples, pred) {
  const n = samples.length;
  const flags = samples.map(pred);
  const start = flags.findIndex((f, i) => f !== flags[(i - 1 + n) % n]);
  if (start < 0) return [{ on: flags[0], pts: [...samples, samples[0]] }];
  const res = [];
  let cur = { on: flags[start], pts: [] };
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (flags[i] !== cur.on) {
      cur.pts.push(samples[i]);
      res.push(cur);
      cur = { on: flags[i], pts: [] };
    }
    cur.pts.push(samples[i]);
  }
  cur.pts.push(samples[start]);
  res.push(cur);
  return res;
}

/** Offset a path along its normals. */
export function offsetPath(path, d) {
  return path.map((p) => ({ ...p, x: p.x + p.nx * d, z: p.z + p.nz * d }));
}

/** Vertical strip following a path. inward=true flips the normals. */
export function ribbon(path, y0, y1, inward = false) {
  const P = [];
  const N = [];
  const I = [];
  const uv = [];
  const s = inward ? -1 : 1;
  let acc = 0;
  path.forEach((p, i) => {
    if (i > 0) acc += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    P.push(p.x, y0, p.z, p.x, y1, p.z);
    N.push(p.nx * s, 0, p.nz * s, p.nx * s, 0, p.nz * s);
    uv.push(acc, 0, acc, 1);
  });
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 2;
    I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return build(P, N, I, uv);
}

/** Total length of an open path. */
export function pathLength(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return L;
}

/** Point (with normal) at arc length s along an open path. */
export function pointAt(path, s) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1];
    const q = path[i];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (acc + len >= s || i === path.length - 1) {
      const f = len > 0 ? Math.min(1, Math.max(0, (s - acc) / len)) : 0;
      let nx = p.nx + (q.nx - p.nx) * f;
      let nz = p.nz + (q.nz - p.nz) * f;
      const nl = Math.hypot(nx, nz) || 1;
      return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, nx: nx / nl, nz: nz / nl };
    }
    acc += len;
  }
  return path[path.length - 1];
}

/** Soft radial gradient texture (white → transparent). */
export function radialTexture(size = 256, inner = 0, stops = null) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
  const s = stops || [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.55)'],
    [0.7, 'rgba(255,255,255,0.14)'],
    [1, 'rgba(255,255,255,0)'],
  ];
  for (const [o, col] of s) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
