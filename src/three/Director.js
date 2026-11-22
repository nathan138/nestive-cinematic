/*
 * The Director turns scroll position into a camera "shot".
 * Each shot = orbit around a target (azimuth / elevation / distance) + lens shift,
 * plus the house explode amount and the time of day.
 */

export const SHOTS = {
  intro:     { az: -1.05, el: 0.5, dist: 40, tx: -0.3, ty: 2.6, tz: 0, fov: 28, shift: 0.0, lift: 0.0, roll: 0.05, explode: 0, tod: -0.3 },
  hero:      { az: -0.44, el: 0.16, dist: 22.5, tx: -0.2, ty: 3.15, tz: 0, fov: 30, shift: 0.19, lift: -0.02, roll: 0, explode: 0, tod: 0.0 },
  ambient:   { az: 0.62, el: 0.08, dist: 23, tx: 0.2, ty: 3.3, tz: 0, fov: 30, shift: -0.25, lift: 0.0, roll: 0, explode: 0, tod: 0.14 },
  ambient2:  { az: 0.74, el: 0.05, dist: 21, tx: 0.2, ty: 3.4, tz: 0, fov: 30, shift: -0.25, lift: 0.0, roll: -0.01, explode: 0, tod: 0.2 },
  anatomyIn: { az: -0.2, el: 0.24, dist: 27, tx: 0, ty: 4.6, tz: 0, fov: 32, shift: 0.04, lift: -0.03, roll: 0, explode: 0, tod: 0.27 },
  anatomy:   { az: -0.36, el: 0.27, dist: 31.5, tx: 0.2, ty: 5.7, tz: 0, fov: 32, shift: 0.05, lift: -0.05, roll: 0, explode: 1, tod: 0.32 },
  anatomy2:  { az: -0.14, el: 0.3, dist: 31, tx: 0.2, ty: 5.8, tz: 0, fov: 32, shift: 0.05, lift: -0.05, roll: 0, explode: 1, tod: 0.36 },
  inside:    { az: -0.55, el: 0.1, dist: 12, tx: -2.6, ty: 3.9, tz: 0.6, fov: 30, shift: -0.1, lift: -0.18, roll: 0, explode: 0, tod: 0.5 },
  inside2:   { az: -0.36, el: 0.08, dist: 10.5, tx: -2.2, ty: 3.9, tz: 0.6, fov: 30, shift: -0.1, lift: -0.18, roll: 0, explode: 0, tod: 0.56 },
  night:     { az: -0.62, el: -0.04, dist: 21, tx: -0.3, ty: 3.6, tz: 0, fov: 34, shift: 0.26, lift: 0.1, roll: 0, explode: 0, tod: 0.75 },
  night2:    { az: -0.42, el: -0.02, dist: 19.5, tx: -0.3, ty: 3.6, tz: 0, fov: 34, shift: 0.26, lift: 0.1, roll: 0, explode: 0, tod: 0.8 },
  stepsA:    { az: 0.95, el: 0.2, dist: 26.5, tx: 0, ty: 3.2, tz: 0, fov: 30, shift: 0.2, lift: 0.14, roll: 0, explode: 0, tod: 0.84 },
  stepsB:    { az: -0.85, el: 0.2, dist: 26.5, tx: 0, ty: 3.2, tz: 0, fov: 30, shift: 0.2, lift: 0.14, roll: 0, explode: 0, tod: 0.9 },
  final:     { az: 0.05, el: 0.2, dist: 40, tx: -0.3, ty: 3.0, tz: 0, fov: 28, shift: 0.0, lift: -0.3, roll: 0, explode: 0, tod: 1.0 },
  final2:    { az: -0.1, el: 0.36, dist: 64, tx: -0.3, ty: 2.8, tz: 0, fov: 26, shift: 0.0, lift: 0.27, roll: 0, explode: 0, tod: 1.0 },
};

/* [section selector, offset in viewport-heights from the section top, shot] */
export const TRACK = [
  ['#hero', 0, 'hero'],
  ['#hero', 0.15, 'hero'],
  ['#ambient', 0.75, 'ambient'],
  ['#ambient', 1.35, 'ambient2'],
  ['#anatomy', 0.3, 'anatomyIn'],
  ['#anatomy', 1.2, 'anatomy'],
  ['#anatomy', 2.15, 'anatomy2'],
  ['#inside', 0.5, 'inside'],
  ['#inside', 1.75, 'inside2'],
  ['#night', 0.5, 'night'],
  ['#night', 1.75, 'night2'],
  ['#steps', 0.45, 'stepsA'],
  ['#steps', 2.05, 'stepsB'],
  ['#final', 0.5, 'final'],
  ['#final', 1.7, 'final2'],
];

const KEYS = Object.keys(SHOTS.hero);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// slow start (night, lights flicker on), long sweeping descent, soft landing
const easeIntro = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function lerpShot(a, b, t, out) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export class Director {
  constructor() {
    this.keys = [];
    this.cur = { ...SHOTS.intro };
    this.intro = 0;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this._a = {};
    this._b = {};
    this.instant = false;
  }

  measure() {
    const vh = window.innerHeight;
    this.keys = TRACK.map(([sel, f, name]) => {
      const el = document.querySelector(sel);
      const top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
      return { y: top + f * vh, shot: SHOTS[name], name };
    }).sort((a, b) => a.y - b.y);
  }

  /** Scroll position (px) the camera reaches the given shot at. */
  yFor(name) {
    const k = this.keys.find((key) => key.name === name);
    return k ? k.y : 0;
  }

  sample(y) {
    const k = this.keys;
    if (!k.length) return SHOTS.hero;
    if (y <= k[0].y) return k[0].shot;
    if (y >= k[k.length - 1].y) return k[k.length - 1].shot;
    let i = 0;
    while (i < k.length - 2 && k[i + 1].y < y) i++;
    const a = k[i];
    const b = k[i + 1];
    const t = easeInOut(Math.min(1, Math.max(0, (y - a.y) / Math.max(1, b.y - a.y))));
    return lerpShot(a.shot, b.shot, t, this._a);
  }

  update(dt, scrollY) {
    let s = this.sample(scrollY);
    if (this.intro < 1) s = lerpShot(SHOTS.intro, s, easeIntro(this.intro), this._b);
    const k = this.instant ? 1 : 1 - Math.exp(-dt * 3.4);
    for (const key of KEYS) this.cur[key] += (s[key] - this.cur[key]) * k;
    const m = this.mouse;
    const km = 1 - Math.exp(-dt * 2.2);
    m.sx += (m.x - m.sx) * km;
    m.sy += (m.y - m.sy) * km;
    this.instant = false;
  }
}
