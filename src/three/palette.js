import * as THREE from 'three';

/*
 * Time-of-day palette. The whole site is "24 hours with Nestive":
 * scroll position drives `tod`, and everything (sky, sun, interior lights,
 * bloom, stars, fireflies) is sampled from this table.
 *
 *  -0.30 night (intro)   0.00 morning   0.16 afternoon   0.32 golden hour
 *   0.50 blue hour       0.75 night     0.86 deep night  1.00 dawn
 */
const RAW = [
  {
    t: -0.3, top: '#03060a', hor: '#0f1a22', bot: '#0b1317',
    sun: '#7d98c4', sunI: 0.45, sunDir: [0.55, 0.8, 0.35],
    hemiSky: '#33445a', hemiGround: '#11171a', hemi: 0.3, env: 0.06,
    lights: 0.9, bloom: 0.65, bth: 0.85, stars: 1, flies: 0.65, dust: 0.0, pool: 1,
    glow: '#2f4766', glowI: 0.45, glowDir: [0.5, 0.32, -1], moon: 1, shadow: 0.35, exposure: 1.0,
  },
  {
    t: -0.12, top: '#3a4651', hor: '#c49a84', bot: '#6a6866',
    sun: '#ffb98c', sunI: 1.6, sunDir: [1, 0.3, 0.4],
    hemiSky: '#a7a6b2', hemiGround: '#5d5a55', hemi: 0.4, env: 0.16,
    lights: 0.9, bloom: 0.75, bth: 0.85, stars: 0.15, flies: 0.1, dust: 0.15, pool: 0.6,
    glow: '#ffb08a', glowI: 0.7, glowDir: [0.9, 0.12, -1], moon: 0, shadow: 0.3, exposure: 1.0,
  },
  {
    t: 0.0, top: '#6c786c', hor: '#939c8f', bot: '#8b9487',
    sun: '#fff1df', sunI: 3.6, sunDir: [-0.6, 1.0, 0.75],
    hemiSky: '#eef0ea', hemiGround: '#8a8f84', hemi: 0.55, env: 0.3,
    lights: 0.6, bloom: 0.38, bth: 1.05, stars: 0, flies: 0, dust: 0.45, pool: 0.25,
    glow: '#f8f3e6', glowI: 0.16, glowDir: [0.7, 0.45, -1], moon: 0, shadow: 0.3, exposure: 1.0,
  },
  {
    t: 0.16, top: '#6f7b6c', hor: '#a0a492', bot: '#959886',
    sun: '#fff0d8', sunI: 3.9, sunDir: [0.25, 1.0, 0.8],
    hemiSky: '#f2f1e8', hemiGround: '#8f9184', hemi: 0.6, env: 0.32,
    lights: 0.45, bloom: 0.38, bth: 1.1, stars: 0, flies: 0, dust: 0.5, pool: 0.2,
    glow: '#fff7e6', glowI: 0.2, glowDir: [-0.3, 0.6, -1], moon: 0, shadow: 0.3, exposure: 1.0,
  },
  {
    t: 0.32, top: '#6f7570', hor: '#d9a578', bot: '#a08a74',
    sun: '#ffa45a', sunI: 3.4, sunDir: [-1.0, 0.36, 0.55],
    hemiSky: '#f0d2b4', hemiGround: '#6f6457', hemi: 0.45, env: 0.24,
    lights: 0.8, bloom: 0.5, bth: 1.0, stars: 0, flies: 0.05, dust: 0.75, pool: 0.5,
    glow: '#ffae66', glowI: 0.95, glowDir: [-1, 0.14, -0.55], moon: 0, shadow: 0.38, exposure: 1.0,
  },
  {
    t: 0.5, top: '#1b2631', hor: '#58596a', bot: '#363944',
    sun: '#8ca5d4', sunI: 0.7, sunDir: [0.6, 0.6, 0.45],
    hemiSky: '#6d7890', hemiGround: '#2a2d33', hemi: 0.35, env: 0.14,
    lights: 0.95, bloom: 0.55, bth: 0.9, stars: 0.35, flies: 0.35, dust: 0.1, pool: 0.85,
    glow: '#c27c66', glowI: 0.45, glowDir: [-1, 0.08, -0.8], moon: 0.3, shadow: 0.32, exposure: 1.0,
  },
  {
    t: 0.75, top: '#03070b', hor: '#122029', bot: '#0b1418',
    sun: '#7d98c4', sunI: 0.45, sunDir: [0.55, 0.8, 0.35],
    hemiSky: '#33445a', hemiGround: '#11171a', hemi: 0.3, env: 0.06,
    lights: 1.0, bloom: 0.65, bth: 0.85, stars: 1, flies: 0.85, dust: 0.0, pool: 1,
    glow: '#2f4766', glowI: 0.5, glowDir: [0.5, 0.32, -1], moon: 1, shadow: 0.35, exposure: 1.0,
  },
  {
    t: 0.86, top: '#02040a', hor: '#0d1520', bot: '#080e12',
    sun: '#6e88b8', sunI: 0.4, sunDir: [-0.4, 0.85, 0.4],
    hemiSky: '#2b3a52', hemiGround: '#0d1215', hemi: 0.28, env: 0.05,
    lights: 0.95, bloom: 0.6, bth: 0.85, stars: 1, flies: 1, dust: 0.0, pool: 1,
    glow: '#283e5c', glowI: 0.45, glowDir: [-0.4, 0.4, -1], moon: 1, shadow: 0.35, exposure: 1.0,
  },
  {
    t: 1.0, top: '#4f5b64', hor: '#e2a988', bot: '#87807c',
    sun: '#ffc39a', sunI: 2.4, sunDir: [1, 0.3, 0.5],
    hemiSky: '#d9c7bd', hemiGround: '#5f5b57', hemi: 0.45, env: 0.2,
    lights: 0.7, bloom: 0.5, bth: 0.95, stars: 0.05, flies: 0.05, dust: 0.4, pool: 0.55,
    glow: '#ffb48c', glowI: 1.0, glowDir: [0.9, 0.1, -1], moon: 0, shadow: 0.32, exposure: 1.0,
  },
];

const COLOR_KEYS = ['top', 'hor', 'bot', 'sun', 'hemiSky', 'hemiGround', 'glow'];
const VEC_KEYS = ['sunDir', 'glowDir'];
const NUM_KEYS = ['sunI', 'hemi', 'env', 'lights', 'bloom', 'bth', 'stars', 'flies', 'dust', 'pool', 'glowI', 'moon', 'shadow', 'exposure'];

const ENTRIES = RAW.map((r) => {
  const e = { t: r.t };
  for (const k of COLOR_KEYS) e[k] = new THREE.Color(r[k]);
  for (const k of VEC_KEYS) e[k] = new THREE.Vector3(...r[k]).normalize();
  for (const k of NUM_KEYS) e[k] = r[k];
  return e;
});

const out = { t: 0 };
for (const k of COLOR_KEYS) out[k] = new THREE.Color();
for (const k of VEC_KEYS) out[k] = new THREE.Vector3();

const smooth = (x) => x * x * (3 - 2 * x);

export function samplePalette(t) {
  let i = 0;
  if (t <= ENTRIES[0].t) i = 0;
  else if (t >= ENTRIES[ENTRIES.length - 1].t) i = ENTRIES.length - 2;
  else while (i < ENTRIES.length - 2 && ENTRIES[i + 1].t < t) i++;
  const a = ENTRIES[i];
  const b = ENTRIES[i + 1];
  const f = smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  out.t = t;
  for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], f);
  for (const k of VEC_KEYS) out[k].copy(a[k]).lerp(b[k], f).normalize();
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

/* ---- clock shown in the HUD (minutes, continuous) ---- */
const CLOCK = [
  [-0.3, -50], [-0.12, 350], [0, 460], [0.16, 750], [0.32, 1125],
  [0.5, 1240], [0.75, 1390], [0.86, 1590], [1, 1805],
];

export function clockFor(t) {
  let m = CLOCK[0][1];
  if (t >= CLOCK[CLOCK.length - 1][0]) m = CLOCK[CLOCK.length - 1][1];
  else if (t > CLOCK[0][0]) {
    for (let i = 0; i < CLOCK.length - 1; i++) {
      const [t0, m0] = CLOCK[i];
      const [t1, m1] = CLOCK[i + 1];
      if (t >= t0 && t <= t1) {
        m = m0 + ((t - t0) / (t1 - t0)) * (m1 - m0);
        break;
      }
    }
  }
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return { minutes: mm, label: `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}` };
}

export function phaseFor(t) {
  if (t < -0.2) return 'Night';
  if (t < -0.05) return 'Dawn';
  if (t < 0.1) return 'Morning';
  if (t < 0.24) return 'Afternoon';
  if (t < 0.42) return 'Golden hour';
  if (t < 0.62) return 'Blue hour';
  if (t < 0.82) return 'Night';
  if (t < 0.95) return 'Deep night';
  return 'Dawn';
}
