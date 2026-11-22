import * as THREE from 'three';
import { slab, outline, resample, runs, offsetPath, ribbon, pathLength, pointAt } from './geometry.js';

/*
 * The Nestive house — fully procedural.
 * Soft clay architecture, wrap-around glass, warm interiors, floating base.
 * Every module lives in its own group so it can be "exploded" for the anatomy shot.
 */

const DECK_TOP = 1.05;
const G_TOP = 3.0;
const U_FLOOR = 3.38;
const U_TOP = 4.76;
const ROOF_TOP = 5.22;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const WHITE = new THREE.Color(1, 1, 1);

export class House {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'house';
    this.lift = new THREE.Group();
    this.root.add(this.lift);

    this.parts = {};
    for (const k of ['base', 'deck', 'ground', 'upper', 'roof', 'tower', 'fx']) {
      const g = new THREE.Group();
      g.name = k;
      this.parts[k] = g;
      this.lift.add(g);
    }

    // light groups: each can be powered on/off independently (intro flicker, night toggle)
    this.lg = {};
    for (const k of ['base', 'ground', 'upper', 'lamps', 'tower', 'antenna', 'screens']) {
      this.lg[k] = { power: 1, mats: [], basic: [], lights: [] };
    }
    this.tints = [];
    this.toneColor = new THREE.Color('#ff9f52');
    this.toneLevel = 1;
    this.anchors = {};
    this.time = 0;

    this.explodeMap = {
      base: [0, -1.05, 0.15],
      deck: [0, 0, 0],
      ground: [0, 1.15, 0],
      upper: [0, 2.45, 0],
      roof: [0, 4.05, 0],
      tower: [1.9, 0.85, 0.25],
      fx: [0, 0, 0],
    };
    this.explodeDelay = { roof: 0.0, upper: 0.08, tower: 0.14, ground: 0.2, base: 0.26, deck: 0, fx: 0 };

    this.makeMaterials();
    this.buildBase();
    this.buildDeck();
    this.buildGround();
    this.buildUpper();
    this.buildRoof();
    this.buildTower();
    this.buildFx();
  }

  /* ------------------------------------------------------------------ materials */

  makeMaterials() {
    const clay = new THREE.MeshPhysicalMaterial({
      color: '#d3d8cb',
      roughness: 0.5,
      clearcoat: 0.3,
      clearcoatRoughness: 0.38,
    });
    const clayWall = clay.clone();
    clayWall.shadowSide = THREE.DoubleSide;

    this.m = {
      clay,
      clayWall,
      clayDeep: new THREE.MeshPhysicalMaterial({ color: '#aab3a3', roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
      graphite: new THREE.MeshStandardMaterial({ color: '#3a3f3b', roughness: 0.32, metalness: 0.55 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.035,
        metalness: 0,
        transmission: 1,
        thickness: 0.05,
        ior: 1.5,
        specularIntensity: 1,
        envMapIntensity: 1.6,
      }),
      wood: new THREE.MeshStandardMaterial({ color: '#a7724a', roughness: 0.55 }),
      fabric: new THREE.MeshStandardMaterial({ color: '#dccab1', roughness: 0.95 }),
      fabricDark: new THREE.MeshStandardMaterial({ color: '#77695a', roughness: 0.9 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2a2b29', roughness: 0.45, metalness: 0.3 }),
      plant: new THREE.MeshStandardMaterial({ color: '#56734b', roughness: 0.85 }),
      plantDeep: new THREE.MeshStandardMaterial({ color: '#3f5a3a', roughness: 0.85 }),
      cream: new THREE.MeshStandardMaterial({ color: '#ece2d0', roughness: 0.8 }),
      terracotta: new THREE.MeshStandardMaterial({ color: '#c47f5a', roughness: 0.7 }),
      rug: new THREE.MeshStandardMaterial({ color: '#c9b394', roughness: 1 }),
    };
    this.m.glass.userData.noShadow = true;
  }

  interiorMat(group) {
    const mat = new THREE.MeshStandardMaterial({ color: '#eadac3', roughness: 0.9, emissive: '#ff9f52', emissiveIntensity: 0.3 });
    this.lg[group].mats.push({ mat, base: 0.34, tone: true });
    this.tints.push({ color: mat.emissive, whiten: 0.1 });
    return mat;
  }

  emissive(group, color, base, { tone = false, whiten = 0, surface = '#161514' } = {}) {
    const mat = new THREE.MeshStandardMaterial({ color: surface, emissive: color, emissiveIntensity: base, roughness: 0.5 });
    this.lg[group].mats.push({ mat, base, tone });
    if (tone) this.tints.push({ color: mat.emissive, whiten });
    return mat;
  }

  globe(group, base, whiten = 0.55) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#fff8ee',
      emissive: '#ffd9ad',
      emissiveIntensity: base,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
    });
    this.lg[group].mats.push({ mat, base, tone: true });
    this.tints.push({ color: mat.emissive, whiten });
    return mat;
  }

  pointLight(group, parent, x, y, z, base, distance, tone = true) {
    const l = new THREE.PointLight('#ffb36b', base, distance, 2);
    l.position.set(x, y, z);
    parent.add(l);
    this.lg[group].lights.push({ light: l, base, tone });
    if (tone) this.tints.push({ color: l.color, whiten: 0.05 });
    return l;
  }

  /* ------------------------------------------------------------------ helpers */

  mesh(geo, mat, parent, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  anchor(name, parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.anchors[name] = o;
    return o;
  }

  /** Glass band (or wall) wrapping a rounded outline. */
  band(parent, { cx, cz, w, d, radii, y0, y1, isGlass, spacing = 1, interior }) {
    const samples = resample(outline(w, d, radii), 0.035).map((p) => ({ ...p, x: p.x + cx, z: p.z + cz }));
    const mullion = new THREE.BoxGeometry(0.045, y1 - y0, 0.07);
    for (const r of runs(samples, isGlass)) {
      if (r.on) {
        const glass = this.mesh(ribbon(r.pts, y0, y1), this.m.glass, parent, 0, 0, 0, { cast: false, receive: false });
        glass.renderOrder = 2;
        const out = offsetPath(r.pts, 0.014);
        this.mesh(ribbon(out, y0, y0 + 0.08), this.m.graphite, parent);
        this.mesh(ribbon(out, y1 - 0.07, y1), this.m.graphite, parent);
        const L = pathLength(r.pts);
        const count = Math.max(1, Math.round(L / spacing));
        for (let k = 0; k <= count; k++) {
          const p = pointAt(r.pts, (k / count) * L);
          const m = this.mesh(mullion, this.m.graphite, parent, p.x + p.nx * 0.012, (y0 + y1) / 2, p.z + p.nz * 0.012);
          m.rotation.y = Math.atan2(p.nx, p.nz);
        }
      } else {
        this.mesh(ribbon(r.pts, y0, y1), this.m.clayWall, parent);
        this.mesh(ribbon(offsetPath(r.pts, -0.1), y0, y1, true), interior, parent, 0, 0, 0, { cast: false });
      }
    }
  }

  vent(parent, group, x, y, z, w, h, n = 5) {
    this.mesh(slab(w, 0.09, h, 0.07, 0.025), this.m.graphite, parent, x, y, z);
    const mat = this.emissive(group, '#ffa24f', 3.4);
    const geo = new THREE.BoxGeometry(w - 0.14, 0.026, 0.03);
    for (let i = 0; i < n; i++) {
      this.mesh(geo, mat, parent, x, y - h / 2 + 0.075 + (i * (h - 0.15)) / (n - 1), z + 0.04, { cast: false });
    }
  }

  screenTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 600;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, '#1a2420');
    g.addColorStop(1, '#0b0f0d');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 600);
    x.textAlign = 'center';
    x.fillStyle = 'rgba(245,239,228,.55)';
    x.font = '500 15px "IBM Plex Mono", monospace';
    x.fillText('NESTIVE · LIVING', 128, 64);
    x.lineCap = 'round';
    x.lineWidth = 9;
    x.strokeStyle = 'rgba(255,255,255,.1)';
    x.beginPath();
    x.arc(128, 210, 80, 0.75 * Math.PI, 2.25 * Math.PI);
    x.stroke();
    x.strokeStyle = '#ffb066';
    x.beginPath();
    x.arc(128, 210, 80, 0.75 * Math.PI, 1.78 * Math.PI);
    x.stroke();
    x.fillStyle = '#f6f0e5';
    x.font = '68px "Instrument Serif", serif';
    x.fillText('21.5°', 128, 232);
    x.font = '500 13px "IBM Plex Mono", monospace';
    x.fillStyle = 'rgba(245,239,228,.6)';
    x.fillText('ECO · 48% RH', 128, 262);
    const rows = [['Lights', '80%'], ['Climate', 'Auto'], ['Doors', 'Locked']];
    rows.forEach(([a, b], i) => {
      const y = 350 + i * 62;
      x.fillStyle = 'rgba(255,255,255,.06)';
      x.beginPath();
      x.roundRect(28, y - 26, 200, 46, 12);
      x.fill();
      x.fillStyle = i === 0 ? '#ffb066' : '#9fe0c6';
      x.beginPath();
      x.arc(52, y - 3, 6, 0, Math.PI * 2);
      x.fill();
      x.textAlign = 'left';
      x.fillStyle = 'rgba(245,239,228,.85)';
      x.font = '600 16px "Manrope Variable", sans-serif';
      x.fillText(a, 70, y + 3);
      x.textAlign = 'right';
      x.fillStyle = 'rgba(245,239,228,.5)';
      x.font = '500 13px "IBM Plex Mono", monospace';
      x.fillText(b, 214, y + 3);
      x.textAlign = 'center';
    });
    x.fillStyle = 'rgba(245,239,228,.45)';
    x.font = '500 13px "IBM Plex Mono", monospace';
    x.fillText('WELCOME HOME', 128, 560);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* ------------------------------------------------------------------ modules */

  buildBase() {
    const p = this.parts.base;
    this.mesh(slab(5.6, 2.6, 0.72, 0.78, 0.15), this.m.clayDeep, p, 0.6, 0.36, -0.1);
    // seam ring between base & deck
    this.mesh(slab(5.2, 2.3, 0.06, 0.65, 0.02), this.m.graphite, p, 0.6, 0.73, -0.1);
    this.vent(p, 'base', -0.75, 0.37, 1.2, 1.05, 0.34);
    this.vent(p, 'base', 1.95, 0.37, 1.2, 1.05, 0.34);
    this.anchor('energy', p, 0.6, 0.36, 1.25);
  }

  buildDeck() {
    const p = this.parts.deck;
    const radii = [0.55, 1.7, 1.7, 0.55];
    this.mesh(slab(9.6, 4.4, 0.32, radii, 0.11), this.m.clay, p, -0.5, 0.89, 0.15);
    // thin groove running around the deck edge
    const groove = offsetPath(
      resample(outline(9.6, 4.4, radii), 0.05).map((q) => ({ ...q, x: q.x - 0.5, z: q.z + 0.15 })),
      0.004
    );
    groove.push(groove[0]);
    this.mesh(ribbon(groove, 0.875, 0.9), this.m.graphite, p, 0, 0, 0, { cast: false });

    // lamps
    const globeMat = this.globe('lamps', 1.1, 0.35);
    const lamp = (x, z) => {
      this.mesh(slab(0.34, 0.34, 0.05, 0.17, 0.02), this.m.graphite, p, x, DECK_TOP + 0.025, z);
      this.mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.2, 16), this.m.graphite, p, x, DECK_TOP + 0.1, z);
      this.mesh(new THREE.SphereGeometry(0.38, 48, 32), globeMat, p, x, DECK_TOP + 0.56, z, { cast: false });
      this.pointLight('lamps', p, x, DECK_TOP + 0.56, z + 0.1, 3.2, 5.5);
    };
    lamp(-4.45, 1.35);
    lamp(0.05, 1.85);
    this.anchor('lighting', p, -4.45, DECK_TOP + 0.95, 1.35);

    // terrace devices
    this.mesh(slab(0.5, 0.45, 0.95, 0.12, 0.05), this.m.clay, p, -2.55, DECK_TOP + 0.475, 0.55);
    const kioskScreen = this.emissive('screens', '#a9e8d0', 1.6);
    this.mesh(new THREE.PlaneGeometry(0.32, 0.22), kioskScreen, p, -2.55, DECK_TOP + 0.74, 0.777, { cast: false });
    this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.38, 24), this.m.graphite, p, -3.0, DECK_TOP + 0.19, 0.85);
    this.mesh(new THREE.TorusGeometry(0.121, 0.012, 8, 32), this.emissive('ground', '#ffb36b', 3), p, -3.0, DECK_TOP + 0.34, 0.85, { cast: false }).rotation.x = Math.PI / 2;
    // lounge chair
    const lounge = new THREE.Group();
    lounge.position.set(-3.75, DECK_TOP, -0.45);
    lounge.rotation.y = 0.35;
    p.add(lounge);
    this.mesh(slab(0.62, 1.05, 0.14, 0.1, 0.05), this.m.fabric, lounge, 0, 0.3, 0.12);
    const back = this.mesh(slab(0.62, 0.12, 0.6, 0.06, 0.04), this.m.fabric, lounge, 0, 0.55, -0.42);
    back.rotation.x = -0.35;
    this.mesh(new THREE.BoxGeometry(0.5, 0.24, 0.9), this.m.graphite, lounge, 0, 0.12, 0.1);
    // planter
    this.mesh(slab(0.75, 0.75, 0.46, 0.22, 0.06), this.m.clayDeep, p, -4.55, DECK_TOP + 0.23, -1.2);
    this.mesh(new THREE.SphereGeometry(0.36, 24, 16), this.m.plant, p, -4.62, DECK_TOP + 0.72, -1.18);
    this.mesh(new THREE.SphereGeometry(0.26, 24, 16), this.m.plantDeep, p, -4.35, DECK_TOP + 0.62, -1.0);
    this.mesh(new THREE.SphereGeometry(0.22, 24, 16), this.m.plant, p, -4.75, DECK_TOP + 0.58, -0.95);
    // little robot
    this.mesh(slab(0.44, 0.44, 0.11, 0.21, 0.04), this.m.graphite, p, -3.25, DECK_TOP + 0.055, 1.5);
    this.mesh(new THREE.BoxGeometry(0.16, 0.012, 0.03), this.emissive('screens', '#a9e8d0', 2.4), p, -3.25, DECK_TOP + 0.112, 1.69, { cast: false });

    // ground-floor furniture lives on the deck so it stays put when the shell lifts
    this.buildGroundInterior(p);
  }

  buildGroundInterior(p) {
    const y0 = DECK_TOP;
    this.mesh(slab(2.1, 1.5, 0.012, 0.3, 0.004), this.m.rug, p, 0.35, y0 + 0.007, 0.2, { cast: false });
    // desk + monitor
    this.mesh(slab(1.5, 0.66, 0.05, 0.05, 0.02), this.m.wood, p, 1.75, y0 + 0.76, -0.75);
    const leg = new THREE.BoxGeometry(0.04, 0.74, 0.04);
    for (const [dx, dz] of [[-0.68, -0.27], [0.68, -0.27], [-0.68, 0.27], [0.68, 0.27]]) this.mesh(leg, this.m.graphite, p, 1.75 + dx, y0 + 0.37, -0.75 + dz);
    this.mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), this.m.graphite, p, 1.75, y0 + 0.92, -0.95);
    this.mesh(slab(0.78, 0.04, 0.46, 0.03, 0.012), this.m.dark, p, 1.75, y0 + 1.23, -0.97);
    this.mesh(new THREE.PlaneGeometry(0.72, 0.4), this.emissive('ground', '#cfe6ff', 1.5), p, 1.75, y0 + 1.23, -0.948, { cast: false });
    // chair
    this.mesh(slab(0.5, 0.5, 0.07, 0.12, 0.03), this.m.fabricDark, p, 1.7, y0 + 0.48, -0.15);
    this.mesh(slab(0.5, 0.07, 0.5, 0.06, 0.03), this.m.fabricDark, p, 1.7, y0 + 0.76, 0.08);
    this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12), this.m.graphite, p, 1.7, y0 + 0.22, -0.15);
    // shelving on the back wall
    const board = slab(1.6, 0.3, 0.035, 0.03, 0.012);
    for (let i = 0; i < 3; i++) {
      const y = y0 + 0.5 + i * 0.45;
      this.mesh(board, this.m.wood, p, 0.1, y, -1.13);
      for (let k = 0; k < 5; k++) {
        const r = Math.sin(i * 12.9 + k * 7.1) * 0.5 + 0.5;
        const x = -0.55 + k * 0.3 + r * 0.08;
        if (r > 0.62) this.mesh(new THREE.SphereGeometry(0.07, 16, 12), this.m.terracotta, p, x, y + 0.085, -1.1);
        else this.mesh(slab(0.08 + r * 0.12, 0.18, 0.16 + r * 0.14, 0.01, 0.006), k % 2 ? this.m.cream : this.m.fabricDark, p, x, y + 0.1 + r * 0.06, -1.12);
      }
    }
    // pendant lamp
    this.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 6), this.m.dark, p, 0.25, G_TOP - 0.22, 0.1, { cast: false });
    this.mesh(new THREE.SphereGeometry(0.14, 32, 20), this.globe('ground', 2.4, 0.5), p, 0.25, G_TOP - 0.5, 0.1, { cast: false });
    // plant
    this.mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 24), this.m.cream, p, 2.45, y0 + 0.18, 0.78);
    this.mesh(new THREE.SphereGeometry(0.3, 20, 14), this.m.plant, p, 2.45, y0 + 0.6, 0.78);
    this.mesh(new THREE.SphereGeometry(0.2, 20, 14), this.m.plantDeep, p, 2.3, y0 + 0.82, 0.7);
    // ceiling light strip
    this.mesh(new THREE.BoxGeometry(2.9, 0.014, 0.07), this.emissive('ground', '#ffcf96', 5, { tone: true, whiten: 0.45 }), p, 0.95, G_TOP - 0.01, 0.0, { cast: false });
    this.pointLight('ground', p, 0.6, G_TOP - 0.45, 0.25, 7.5, 6);
    this.pointLight('ground', p, 2.0, G_TOP - 0.45, -0.3, 4.5, 5);
  }

  buildGround() {
    const p = this.parts.ground;
    const interior = this.interiorMat('ground');
    this.band(p, {
      cx: 0.95,
      cz: -0.05,
      w: 3.9,
      d: 2.7,
      radii: [0.35, 0.35, 0.35, 0.35],
      y0: DECK_TOP,
      y1: G_TOP,
      isGlass: (q) => q.nz > 0.5 && q.x > -0.9 && q.x < 2.72,
      spacing: 0.95,
      interior,
    });
    // entrance pillar with smart panel
    this.mesh(slab(1.05, 2.5, G_TOP - DECK_TOP, 0.46, 0.1), this.m.clay, p, -1.45, (DECK_TOP + G_TOP) / 2, 0.0);
    this.mesh(slab(0.54, 0.05, 1.18, 0.08, 0.02), this.m.graphite, p, -1.45, 2.12, 1.255);
    const screen = new THREE.MeshBasicMaterial({ map: this.screenTexture(), toneMapped: true });
    this.lg.screens.basic.push({ mat: screen, base: 1.25 });
    this.mesh(new THREE.PlaneGeometry(0.46, 1.08), screen, p, -1.45, 2.12, 1.283, { cast: false, receive: false });
    this.anchor('climate', p, -0.4, 2.35, 1.32);
  }

  buildUpper() {
    const p = this.parts.upper;
    const cx = -0.55;
    const cz = 0.1;
    this.mesh(slab(7.7, 3.5, U_FLOOR - G_TOP, [0.6, 1.65, 1.65, 0.6], 0.12), this.m.clay, p, cx, (G_TOP + U_FLOOR) / 2, cz);
    const interior = this.interiorMat('upper');
    this.band(p, {
      cx,
      cz,
      w: 7.26,
      d: 3.06,
      radii: [0.38, 1.43, 1.43, 0.38],
      y0: U_FLOOR,
      y1: U_TOP,
      isGlass: (q) => (q.nz > 0.3 && q.x < 2.35) || q.nx < -0.2 || (q.nz < -0.3 && q.x < -2.55),
      spacing: 0.92,
      interior,
    });

    const y0 = U_FLOOR;
    this.mesh(slab(2.8, 1.9, 0.012, 0.4, 0.004), this.m.rug, p, -2.45, y0 + 0.007, 0.05, { cast: false });
    // sofa
    this.mesh(slab(2.3, 0.88, 0.34, 0.14, 0.07), this.m.fabric, p, -2.45, y0 + 0.2, -0.78);
    this.mesh(slab(2.3, 0.26, 0.5, 0.1, 0.07), this.m.fabric, p, -2.45, y0 + 0.42, -1.12);
    this.mesh(slab(0.24, 0.88, 0.46, 0.08, 0.06), this.m.fabric, p, -3.48, y0 + 0.26, -0.78);
    this.mesh(slab(0.24, 0.88, 0.46, 0.08, 0.06), this.m.fabric, p, -1.42, y0 + 0.26, -0.78);
    this.mesh(slab(0.5, 0.42, 0.12, 0.08, 0.05), this.m.terracotta, p, -3.0, y0 + 0.46, -0.85);
    // coffee table
    this.mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 48), this.m.wood, p, -2.45, y0 + 0.36, 0.35);
    this.mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.34, 20), this.m.graphite, p, -2.45, y0 + 0.17, 0.35);
    this.mesh(new THREE.SphereGeometry(0.08, 16, 12), this.m.cream, p, -2.3, y0 + 0.46, 0.3);
    // floor lamp
    this.mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8), this.m.graphite, p, -3.85, y0 + 0.5, -0.55);
    this.mesh(new THREE.SphereGeometry(0.17, 32, 20), this.globe('upper', 2.6, 0.5), p, -3.85, y0 + 1.06, -0.55, { cast: false });
    // bookshelf
    const shelfX = 1.2;
    for (const sx of [-1.05, 1.05]) this.mesh(new THREE.BoxGeometry(0.04, 1.3, 0.3), this.m.wood, p, shelfX + sx, y0 + 0.65, -1.18);
    for (let i = 0; i < 4; i++) {
      const y = y0 + 0.08 + i * 0.4;
      this.mesh(new THREE.BoxGeometry(2.1, 0.03, 0.3), this.m.wood, p, shelfX, y, -1.18);
      if (i === 3) continue;
      let x = shelfX - 0.95;
      let k = 0;
      while (x < shelfX + 0.9) {
        const r = Math.sin(i * 31.7 + k * 12.3) * 0.5 + 0.5;
        const w = 0.04 + r * 0.05;
        const h = 0.2 + r * 0.12;
        const mats = [this.m.cream, this.m.terracotta, this.m.fabricDark, this.m.plantDeep, this.m.fabric];
        this.mesh(new THREE.BoxGeometry(w, h, 0.2), mats[k % mats.length], p, x + w / 2, y + 0.015 + h / 2, -1.17);
        x += w + 0.012 + (r > 0.85 ? 0.18 : 0);
        k++;
      }
    }
    // dining
    this.mesh(slab(1.4, 0.82, 0.05, 0.12, 0.02), this.m.wood, p, 0.55, y0 + 0.74, 0.35);
    this.mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.72, 16), this.m.graphite, p, 0.55, y0 + 0.36, 0.35);
    for (const [dx, dz] of [[-0.45, -0.6], [0.45, -0.6], [-0.45, 0.6], [0.45, 0.6]]) {
      this.mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 24), this.m.fabricDark, p, 0.55 + dx, y0 + 0.45, 0.35 + dz);
      this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), this.m.graphite, p, 0.55 + dx, y0 + 0.21, 0.35 + dz);
    }
    this.mesh(new THREE.SphereGeometry(0.12, 24, 16), this.globe('upper', 2.2, 0.5), p, 0.55, U_TOP - 0.45, 0.35, { cast: false });
    this.mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.35, 6), this.m.dark, p, 0.55, U_TOP - 0.18, 0.35, { cast: false });
    // low cabinet
    this.mesh(slab(1.3, 0.5, 0.7, 0.06, 0.03), this.m.cream, p, -0.75, y0 + 0.35, -1.12);
    // ceiling strips
    const strip = this.emissive('upper', '#ffcf96', 5, { tone: true, whiten: 0.45 });
    this.mesh(new THREE.BoxGeometry(5.2, 0.014, 0.07), strip, p, -0.9, U_TOP - 0.01, 0.6, { cast: false });
    this.mesh(new THREE.BoxGeometry(5.2, 0.014, 0.07), strip, p, -0.9, U_TOP - 0.01, -0.45, { cast: false });
    this.pointLight('upper', p, -2.45, U_TOP - 0.35, 0.25, 8, 6);
    this.pointLight('upper', p, 0.9, U_TOP - 0.35, 0.2, 6, 5.5);
    this.anchor('glass', p, -4.18, (U_FLOOR + U_TOP) / 2, 0.75);
  }

  buildRoof() {
    const p = this.parts.roof;
    this.mesh(slab(7.9, 3.7, ROOF_TOP - U_TOP, [0.7, 1.75, 1.75, 0.7], 0.16), this.m.clay, p, -0.55, (U_TOP + ROOF_TOP) / 2, 0.1);
    this.mesh(slab(3.9, 1.9, 1.2, 0.62, 0.16), this.m.clay, p, 2.0, ROOF_TOP + 0.6, -0.75);
    // skylight strip on the rear block
    this.mesh(new THREE.BoxGeometry(2.4, 0.02, 0.08), this.emissive('tower', '#ffcf96', 2.5, { tone: true, whiten: 0.4 }), p, 2.0, ROOF_TOP + 1.205, -0.25, { cast: false });
    // antenna
    const ax = 0.75;
    const az = -1.05;
    const top = ROOF_TOP + 1.2;
    this.mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.07, 24), this.m.graphite, p, ax, top + 0.035, az);
    this.mesh(new THREE.CylinderGeometry(0.016, 0.024, 1.15, 10), this.m.graphite, p, ax, top + 0.6, az);
    this.mesh(new THREE.SphereGeometry(0.055, 20, 14), this.emissive('antenna', '#ff9d47', 9, { surface: '#ffb36b' }), p, ax, top + 1.2, az, { cast: false });
    // little solar tiles
    const tile = slab(0.9, 0.6, 0.04, 0.05, 0.015);
    const tileMat = new THREE.MeshPhysicalMaterial({ color: '#2f3734', roughness: 0.25, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
    for (let i = 0; i < 4; i++) this.mesh(tile, tileMat, p, -3.6 + i * 1.0, ROOF_TOP + 0.02, -0.75);
  }

  buildTower() {
    const p = this.parts.tower;
    const h = 5.25;
    this.mesh(slab(1.55, 2.9, h, 0.62, 0.16), this.m.clay, p, 3.65, DECK_TOP + h / 2, -0.1);
    this.vent(p, 'tower', 3.65, 2.05, 1.35, 0.85, 0.78, 7);
    const slit = this.emissive('tower', '#ffb36b', 4.5);
    this.mesh(new THREE.CapsuleGeometry(0.035, 0.55, 4, 12), slit, p, 3.22, 4.25, 1.36, { cast: false });
    this.mesh(new THREE.CapsuleGeometry(0.035, 0.35, 4, 12), slit, p, 3.38, 4.15, 1.36, { cast: false });
    // sentinel eye
    const eye = this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 40), this.m.graphite, p, 3.65, 5.65, 1.36);
    eye.rotation.x = Math.PI / 2;
    this.mesh(new THREE.SphereGeometry(0.06, 20, 14), this.emissive('tower', '#ff7a45', 5), p, 3.65, 5.65, 1.39, { cast: false });
    this.anchor('sentinel', p, 3.65, 5.65, 1.4);
  }

  buildFx() {
    const p = this.parts.fx;
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffb36b').multiplyScalar(2.2),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.scan = new THREE.Group();
    const ringA = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 160), ringMat);
    const ringB = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.056, 160), ringMat);
    for (const r of [ringA, ringB]) {
      r.rotation.x = -Math.PI / 2;
      r.userData.noShadow = true;
      r.castShadow = false;
      this.scan.add(r);
    }
    this.scan.scale.set(6.6, 1, 3.4);
    this.scan.position.set(-0.2, 1, 0.1);
    p.add(this.scan);
    this.scanMat = ringMat;

    // data spine with travelling pulses
    const lineMat = ringMat.clone();
    this.lineMat = lineMat;
    this.pulses = [];
    const pulseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc58a').multiplyScalar(4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pulseMat = pulseMat;
    for (const [x, z] of [[1.3, -0.95], [-2.0, -0.95], [3.0, 0.6]]) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 9.6, 6), lineMat);
      line.position.set(x, 5.2, z);
      line.castShadow = false;
      p.add(line);
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), pulseMat);
        s.castShadow = false;
        s.position.set(x, 0, z);
        s.userData.phase = k / 3 + x * 0.1;
        p.add(s);
        this.pulses.push(s);
      }
    }
  }

  /* ------------------------------------------------------------------ frame */

  update(dt, s) {
    this.time += dt;
    const t = this.time;

    this.root.position.y = 0.3 + Math.sin(t * 0.75) * 0.05;
    this.root.rotation.y = Math.sin(t * 0.21) * 0.012;

    const e = s.explode;
    this.lift.position.y = ease(clamp01(e)) * 1.1;
    for (const [k, off] of Object.entries(this.explodeMap)) {
      const f = ease(clamp01((e - this.explodeDelay[k]) / 0.72));
      this.parts[k].position.set(off[0] * f, off[1] * f, off[2] * f);
    }

    const fx = clamp01((e - 0.3) / 0.5);
    this.scanMat.opacity = fx * 0.5;
    this.scan.position.y = 0.4 + ((t * 0.16) % 1) * 11.5;
    const sc = 1 + Math.sin(t * 0.9) * 0.01;
    this.scan.scale.set(6.6 * sc, 1, 3.4 * sc);
    this.lineMat.opacity = fx * 0.35;
    this.pulseMat.opacity = fx;
    for (const pl of this.pulses) pl.position.y = 0.4 + ((t * 0.22 + pl.userData.phase) % 1) * 9.6;

    // interior colour tone
    for (const it of this.tints) it.color.copy(this.toneColor).lerp(WHITE, it.whiten);

    const blink = 0.12 + 0.88 * Math.pow(Math.max(0, Math.sin(t * 2.1)), 14);
    const tone = this.toneLevel;
    for (const [name, g] of Object.entries(this.lg)) {
      let lvl = s.lights * s.master * g.power;
      if (name === 'antenna') lvl = Math.max(0.2, s.lights) * g.power * blink;
      if (name === 'screens') lvl = (0.55 + s.lights * 0.45) * s.master * g.power;
      for (const it of g.mats) it.mat.emissiveIntensity = it.base * lvl * (it.tone ? tone : 1);
      for (const it of g.basic) it.mat.color.setScalar(it.base * lvl);
      for (const it of g.lights) it.light.intensity = it.base * lvl * (it.tone ? tone : 1);
    }
  }
}
