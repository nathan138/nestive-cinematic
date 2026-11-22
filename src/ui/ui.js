import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clockFor, phaseFor } from '../three/palette.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const NAV_FOR = { hero: 'hero', ambient: 'ambient', anatomy: 'ambient', inside: 'inside', night: 'inside', steps: 'steps', final: 'final', footer: 'final' };
const SHOT_FOR = { '#hero': 'hero', '#ambient': 'ambient', '#anatomy': 'anatomy', '#inside': 'inside', '#night': 'night', '#steps': 'stepsA', '#final': 'final' };
const TONES = {
  morning: ['#ffd29c', 1.0, 72],
  focus: ['#f1f0ff', 1.15, 100],
  evening: ['#ff9f52', 1.0, 80],
  cinema: ['#ff5a1f', 0.5, 35],
};

export function createUI({ world, director, lenis }) {
  const html = document.documentElement;
  const house = world.house;

  /* ------------------------------------------------------------ initial states */
  gsap.set('.ln > span', { yPercent: 115 });
  gsap.set('[data-reveal]', { opacity: 0, y: 34 });
  gsap.set('[data-intro]', { opacity: 0, y: 30 });
  gsap.set('[data-card]', { opacity: 0, y: 70, rotateX: -12, transformPerspective: 900 });
  gsap.set('[data-step]', { opacity: 0, y: 60 });
  gsap.set('.nav', { opacity: 0, y: -24 });
  gsap.set('.hud > *', { opacity: 0 });
  gsap.set('#loader', { clipPath: 'inset(0% 0% 0% 0%)' });

  /* ------------------------------------------------------------ cursor */
  const cursor = $('.cursor');
  const dot = $('.cursor__dot');
  const ring = $('.cursor__ring');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const m = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
  window.addEventListener('mousemove', (e) => {
    m.x = e.clientX;
    m.y = e.clientY;
    director.mouse.x = (e.clientX / innerWidth) * 2 - 1;
    director.mouse.y = -((e.clientY / innerHeight) * 2 - 1);
    if (fine) html.classList.add('has-cursor');
  });
  document.addEventListener('mouseleave', () => html.classList.remove('has-cursor'));
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('a, button, [data-magnetic]')) cursor.classList.add('is-hover');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('a, button, [data-magnetic]')) cursor.classList.remove('is-hover');
  });

  /* ------------------------------------------------------------ magnetic */
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: dx * 0.22, y: dy * 0.3, duration: 0.6, ease: 'power3.out' });
    });
    el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.4)' }));
  });

  /* ------------------------------------------------------------ navigation */
  $$('[data-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      e.preventDefault();
      const shot = SHOT_FOR[href];
      const y = shot ? director.yFor(shot) : $(href).getBoundingClientRect().top + scrollY;
      lenis.scrollTo(y, { duration: 2.6, easing: easeInOut });
    });
  });

  /* ------------------------------------------------------------ hero mini-steps (auto cycle) */
  const minis = $$('.step-mini');
  const miniTl = gsap.timeline({ repeat: -1, paused: true });
  minis.forEach((el) => {
    const bar = $('.step-mini__bar i', el);
    miniTl
      .add(() => minis.forEach((x) => x.classList.toggle('is-active', x === el)))
      .fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 2.6, ease: 'none' })
      .set(bar, { scaleX: 0 });
  });

  /* ------------------------------------------------------------ section reveals */
  $$('.scene').forEach((section) => {
    if (section.id === 'hero') return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 62%',
      once: true,
      onEnter: () => {
        const lines = $$('.ln > span', section);
        const bits = $$('[data-reveal]', section);
        if (lines.length) gsap.to(lines, { yPercent: 0, duration: 1.6, ease: 'expo.out', stagger: 0.11 });
        if (bits.length) gsap.to(bits, { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.09, delay: 0.2 });
      },
    });
  });

  /* ------------------------------------------------------------ statement (word scrub) */
  const statement = $('.js-statement');
  const words = splitWords(statement);
  ScrollTrigger.create({
    trigger: '#ambient',
    start: 'top 70%',
    end: () => `+=${innerHeight * 1.3}`,
    onUpdate: (self) => {
      const p = self.progress * (words.length + 6);
      words.forEach((w, i) => {
        w.style.opacity = 0.16 + 0.84 * clamp((p - i) / 6);
      });
    },
  });

  /* ------------------------------------------------------------ devices */
  const temp = { v: 21.5, shown: 21.5 };
  const tempEl = $('.js-temp');
  const tempLabel = $('.js-temp-label');
  const tempHud = $('.js-temp-hud');
  const arc = $('.js-dial-arc');
  const ARC = 367.6;
  const ticks = $('.dial__ticks');
  for (let i = 0; i <= 26; i++) {
    const a = ((i / 26) * 270 * Math.PI) / 180;
    const r0 = i % 13 === 0 ? 86 : 89;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 100 + Math.cos(a) * r0);
    l.setAttribute('y1', 100 + Math.sin(a) * r0);
    l.setAttribute('x2', 100 + Math.cos(a) * 94);
    l.setAttribute('y2', 100 + Math.sin(a) * 94);
    ticks.appendChild(l);
  }
  const renderTemp = (animateArc = true) => {
    const f = clamp((temp.v - 16) / 12);
    if (animateArc) arc.style.strokeDasharray = `${f * ARC} 490`;
    gsap.to(temp, {
      shown: temp.v,
      duration: 0.8,
      ease: 'power3.out',
      onUpdate: () => {
        tempEl.textContent = temp.shown.toFixed(1);
        tempHud.textContent = `${temp.shown.toFixed(1)}°C`;
      },
    });
    tempLabel.textContent = temp.v > 21.5 ? `Heating to ${temp.v.toFixed(1)}°` : temp.v < 21.5 ? `Cooling to ${temp.v.toFixed(1)}°` : 'Holding 21.5°';
  };
  const bumpTemp = (d) => {
    temp.v = clamp(temp.v + d, 16, 28);
    renderTemp();
  };
  $('.js-temp-up').addEventListener('click', () => bumpTemp(0.5));
  $('.js-temp-down').addEventListener('click', () => bumpTemp(-0.5));

  const brightEl = $('.js-bright');
  const brightBar = $('.js-bright-bar');
  const setTone = (name) => {
    const [hex, level, pct] = TONES[name];
    const c = new THREE.Color(hex);
    gsap.to(house.toneColor, { r: c.r, g: c.g, b: c.b, duration: 1.4, ease: 'power2.inOut' });
    gsap.to(house, { toneLevel: level, duration: 1.4, ease: 'power2.inOut' });
    $$('.tone').forEach((b) => b.classList.toggle('is-active', b.dataset.tone === name));
    brightEl.textContent = `${pct}%`;
    brightBar.style.transform = `scaleX(${pct / 100})`;
  };
  $$('.tone').forEach((b) => b.addEventListener('click', () => setTone(b.dataset.tone)));

  const spark = $('.js-spark');
  const sparkLen = spark.getTotalLength();
  gsap.set(spark, { strokeDasharray: sparkLen, strokeDashoffset: sparkLen });

  ScrollTrigger.create({
    trigger: '#inside',
    start: 'top 30%',
    once: true,
    onEnter: () => {
      gsap.to('[data-card]', { opacity: 1, y: 0, rotateX: 0, duration: 1.6, ease: 'expo.out', stagger: 0.12 });
      gsap.delayedCall(0.4, () => renderTemp());
      gsap.to(spark, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut', delay: 0.6 });
    },
  });

  /* ------------------------------------------------------------ night: lights + counters */
  const flicker = (g, on, delay = 0) => {
    const tl = gsap.timeline({ delay });
    if (on) {
      const seq = [0.7, 0.05, 0.95, 0.12, 0.55, 0.08, 1];
      seq.forEach((v, i) => tl.to(g, { power: v, duration: i === seq.length - 1 ? 0.5 : 0.035 + Math.random() * 0.07, ease: 'none' }));
    } else {
      tl.to(g, { power: 0.45, duration: 0.05, ease: 'none' }).to(g, { power: 0.1, duration: 0.06, ease: 'none' }).to(g, { power: 0.02, duration: 0.5, ease: 'power2.out' });
    }
    return tl;
  };
  const ORDER = ['lamps', 'ground', 'upper', 'tower', 'base'];
  const powerOn = (stagger = 0.22) => {
    ORDER.forEach((k, i) => flicker(house.lg[k], true, i * stagger));
    flicker(house.lg.screens, true, ORDER.length * stagger);
    flicker(house.lg.antenna, true, ORDER.length * stagger + 0.3);
  };
  const lightsBtn = $('.js-lights');
  const lightsState = $('.js-lights-state');
  let lightsOn = true;
  const setLights = (on) => {
    lightsOn = on;
    lightsBtn.setAttribute('aria-pressed', String(on));
    lightsState.textContent = on ? 'On' : 'Off';
    const order = on ? ORDER : [...ORDER].reverse();
    order.forEach((k, i) => {
      gsap.killTweensOf(house.lg[k]);
      flicker(house.lg[k], on, i * (on ? 0.2 : 0.14));
    });
  };
  lightsBtn.addEventListener('click', () => setLights(!lightsOn));

  ScrollTrigger.create({
    trigger: '#night',
    start: 'top 15%',
    once: true,
    onEnter: () => {
      $$('.js-count-up').forEach((el, i) => {
        const to = parseFloat(el.dataset.to);
        const dec = parseInt(el.dataset.decimals || '0', 10);
        const o = { v: 0 };
        gsap.to(o, {
          v: to,
          duration: 2.4,
          delay: 0.3 + i * 0.12,
          ease: 'power3.out',
          onUpdate: () => {
            el.textContent = `${el.dataset.prefix || ''}${o.v.toFixed(dec)}${el.dataset.suffix || ''}`;
          },
        });
      });
    },
  });

  /* ------------------------------------------------------------ steps (scroll progress) */
  const stepEls = $$('[data-step]');
  ScrollTrigger.create({
    trigger: '#steps',
    start: 'top 35%',
    once: true,
    onEnter: () => gsap.to(stepEls, { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1 }),
  });
  ScrollTrigger.create({
    trigger: '#steps',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      const p = clamp((self.progress - 0.08) / 0.8) * 4;
      stepEls.forEach((el, i) => {
        const local = clamp(p - i);
        el.style.setProperty('--p', local.toFixed(3));
        el.classList.toggle('is-active', p > i && p < i + 1.0001 && self.progress < 0.995);
      });
    },
  });

  /* ------------------------------------------------------------ hotspots */
  const hotspots = $$('.hotspot').map((el, i) => ({ el, key: el.dataset.anchor, i }));
  const v = new THREE.Vector3();

  /* ------------------------------------------------------------ HUD */
  const sections = $$('.scene, .footer');
  const idxEl = $('.js-index');
  const progEl = $('.js-progress');
  const timeEl = $('.js-time');
  const phaseEl = $('.js-phase');
  const sunEl = $('.js-sun');
  const scrollHint = $('.hud__scroll');
  const navLinks = $$('[data-nav]');
  let lastIdx = '';
  let lastTime = '';
  let lastNav = '';

  /* ------------------------------------------------------------ hero intro reveal */
  const revealHero = () => {
    const tl = gsap.timeline();
    tl.to('.nav', { opacity: 1, y: 0, duration: 1.6, ease: 'expo.out' }, 0);
    tl.to('.hero__title .ln > span', { yPercent: 0, duration: 1.8, ease: 'expo.out', stagger: 0.13 }, 0.1);
    tl.to('[data-intro]', { opacity: 1, y: 0, duration: 1.5, ease: 'expo.out', stagger: 0.1 }, 0.3);
    tl.to('.hud > *', { opacity: 1, duration: 1.4, stagger: 0.1 }, 0.8);
    tl.add(() => miniTl.play(), 0.9);
    return tl;
  };

  /* ------------------------------------------------------------ autopilot (for recording) */
  const auto = { running: false };
  const scrollToAsync = (y, duration) =>
    new Promise((resolve) => {
      lenis.scrollTo(y, { duration, easing: easeInOut, lock: true, force: true, onComplete: resolve });
    });
  const secY = (sel, f) => $(sel).getBoundingClientRect().top + scrollY + f * innerHeight;
  const stopAutopilot = () => {
    auto.running = false;
    html.classList.remove('is-auto');
  };
  const runAutopilot = async () => {
    if (auto.running) {
      stopAutopilot();
      return;
    }
    auto.running = true;
    html.classList.add('is-auto');
    const step = async (y, dur, hold = 0) => {
      if (!auto.running) return;
      await scrollToAsync(y, dur);
      if (auto.running && hold) await wait(hold * 1000);
    };
    await step(0, 1.2, 1.6);
    await step(secY('#ambient', 1.45), 7, 1.0);
    await step(secY('#anatomy', 1.25), 6.5, 0.6);
    await step(secY('#anatomy', 2.3), 4.5, 1.2);
    await step(secY('#inside', 1.0), 6, 0.8);
    if (auto.running) {
      bumpTemp(0.5);
      await wait(500);
      bumpTemp(0.5);
      await wait(900);
      setTone('cinema');
      await wait(2000);
      setTone('focus');
      await wait(1700);
      setTone('evening');
      await wait(1200);
    }
    await step(secY('#inside', 1.95), 3, 0.4);
    await step(secY('#night', 1.0), 6, 0.6);
    if (auto.running) {
      setLights(false);
      await wait(2200);
      setLights(true);
      await wait(1800);
    }
    await step(secY('#night', 1.95), 3, 0.3);
    await step(secY('#steps', 0.6), 5, 0.3);
    await step(secY('#steps', 2.15), 7, 1.0);
    await step(secY('#final', 0.6), 5.5, 1.8);
    await step(document.documentElement.scrollHeight - innerHeight, 6, 2);
    auto.running = false;
    html.classList.remove('is-auto');
  };
  /* ------------------------------------------------------------ ← / → : jump between the 7 scenes */
  // scroll position (section, offset in viewport heights) where each scene is fully composed
  const SCENE_STOPS = [
    ['#hero', 0],
    ['#ambient', 1.0],
    ['#anatomy', 1.6],
    ['#inside', 1.0],
    ['#night', 1.0],
    ['#steps', 2.1],
    ['#final', 0.6],
  ];
  const sceneNav = { busy: false, target: 0 };
  const goToScene = (dir) => {
    if (document.body.classList.contains('is-loading')) return; // wait for the intro
    if (auto.running) stopAutopilot();
    const max = document.documentElement.scrollHeight - innerHeight;
    const stops = SCENE_STOPS.map(([sel, f]) => Math.min(max, sel === '#hero' ? 0 : secY(sel, f)));
    // when keys are pressed quickly, chain from the scene we are already heading to
    const from = sceneNav.busy ? sceneNav.target : scrollY;
    let i = -1;
    if (dir > 0) i = stops.findIndex((y) => y > from + 8);
    else stops.forEach((y, k) => {
      if (y < from - 8) i = k;
    });
    if (i < 0) return;
    const y = stops[i];
    const travel = Math.abs(y - scrollY) / innerHeight;
    sceneNav.busy = true;
    sceneNav.target = y;
    lenis.scrollTo(y, {
      duration: Math.min(3.4, 1.6 + travel * 0.32),
      easing: easeInOut,
      lock: true,
      force: true,
      onComplete: () => {
        sceneNav.busy = false;
      },
    });
  };

  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!e.repeat) goToScene(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key === 'p' || e.key === 'P') runAutopilot();
    if (e.key === 'h' || e.key === 'H') html.classList.toggle('hide-hud');
    if (e.key === 'Escape' && auto.running) runAutopilot();
  });

  /* ------------------------------------------------------------ frame */
  const update = () => {
    // cursor
    m.rx += (m.x - m.rx) * 0.16;
    m.ry += (m.y - m.ry) * 0.16;
    dot.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`;
    ring.style.transform = `translate3d(${m.rx}px, ${m.ry}px, 0)`;

    // hotspots
    const ex = director.cur.explode;
    if (ex > 0.02) {
      for (const h of hotspots) {
        const s = smooth(0.55 + h.i * 0.05, 0.8 + h.i * 0.05, ex);
        const anchor = house.anchors[h.key];
        anchor.getWorldPosition(v);
        v.project(world.camera);
        const x = (v.x * 0.5 + 0.5) * innerWidth;
        const y = (-v.y * 0.5 + 0.5) * innerHeight;
        h.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        h.el.style.opacity = s.toFixed(3);
        h.el.style.setProperty('--s', s.toFixed(3));
      }
    } else if (hotspots[0].el.style.opacity !== '0') {
      for (const h of hotspots) h.el.style.opacity = '0';
    }

    // clock
    const tod = director.cur.tod;
    const c = clockFor(tod);
    if (c.label !== lastTime) {
      lastTime = c.label;
      timeEl.textContent = c.label;
      phaseEl.textContent = phaseFor(tod);
      const a = (c.minutes / 1440) * Math.PI * 2 - Math.PI / 2;
      sunEl.style.transform = `translate(${(Math.cos(a) * 18.5).toFixed(2)}px, ${(Math.sin(a) * 18.5).toFixed(2)}px)`;
      sunEl.classList.toggle('is-moon', c.minutes < 360 || c.minutes > 1170);
    }

    // section index + progress + nav
    const y = scrollY;
    const mid = y + innerHeight * 0.5;
    let active = sections[0];
    for (const s of sections) if (s.offsetTop <= mid) active = s;
    const idx = active.dataset.index || '07';
    if (idx !== lastIdx) {
      lastIdx = idx;
      idxEl.textContent = idx;
    }
    const navKey = NAV_FOR[active.id] || 'hero';
    if (navKey !== lastNav) {
      lastNav = navKey;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === navKey));
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    progEl.style.transform = `scaleY(${(max > 0 ? y / max : 0).toFixed(4)})`;
    scrollHint.classList.toggle('is-off', y > 40);
  };

  return { update, revealHero, powerOn, setLights, setTone, runAutopilot, goToScene };
}

/** Wrap every word of an element in <span class="w">, keeping inline tags. */
function splitWords(el) {
  const words = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
          else {
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            frag.appendChild(s);
            words.push(s);
          }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    });
  };
  walk(el);
  return words;
}
