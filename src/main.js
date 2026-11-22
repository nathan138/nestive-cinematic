import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import 'lenis/dist/lenis.css';
import './style.css';

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { World } from './three/World.js';
import { Director } from './three/Director.js';
import { createUI } from './ui/ui.js';

gsap.registerPlugin(ScrollTrigger);

const params = new URLSearchParams(location.search);
const SKIP_INTRO = params.has('skip');
const AUTOPLAY = params.has('autoplay');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

async function boot() {
  const t0 = performance.now();

  /* ---------------- loader */
  const counter = { v: 0 };
  const countEl = document.querySelector('.js-count');
  const barEl = document.querySelector('.loader__bar span');
  const setCount = () => {
    countEl.textContent = String(Math.round(counter.v)).padStart(3, '0');
    barEl.style.transform = `scaleX(${counter.v / 100})`;
  };
  gsap
    .timeline()
    .to('.loader__brand', { opacity: 1, duration: 1, ease: 'power2.out' }, 0.1)
    .fromTo('.loader__title', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.3, ease: 'expo.out' }, 0.25)
    .to('.loader__log li', { opacity: 1, duration: 0.35, stagger: 0.32 }, 0.45);
  const countTween = gsap.to(counter, { v: 74, duration: 2, ease: 'power2.out', onUpdate: setCount });

  await Promise.race([document.fonts.ready, wait(3000)]);
  await Promise.race([
    Promise.all([
      document.fonts.load('68px "Instrument Serif"'),
      document.fonts.load('500 13px "IBM Plex Mono"'),
      document.fonts.load('600 16px "Manrope Variable"'),
    ]),
    wait(3000),
  ]);

  /* ---------------- world */
  const world = new World(document.getElementById('webgl'));
  const director = new Director();
  for (const g of Object.values(world.house.lg)) g.power = SKIP_INTRO ? 1 : 0;

  const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, smoothWheel: true });
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.lagSmoothing(0);

  const ui = createUI({ world, director, lenis });
  director.measure();
  ScrollTrigger.addEventListener('refresh', () => director.measure());

  // warm up every shader before the first visible frame
  director.update(1 / 60, 0);
  world.update(1 / 60, director.cur, { x: 0, y: 0 });
  try {
    await world.renderer.compileAsync(world.scene, world.camera);
  } catch {
    /* compileAsync is optional */
  }

  gsap.ticker.add((time, deltaMs) => {
    lenis.raf(time * 1000);
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    director.update(dt, window.scrollY);
    world.update(dt, director.cur, { x: director.mouse.sx, y: director.mouse.sy });
    ui.update(dt);
  });

  // debug handle for local testing only — not shipped in production builds
  if (import.meta.env.DEV) {
    window.__nestive = {
      world,
      director,
      lenis,
      ui,
      goto(name) {
        lenis.scrollTo(director.yFor(name), { immediate: true, force: true });
        director.instant = true;
      },
    };
  }
  console.info('%cNestive%c  ← → = previous / next scene · P = autopilot (recording) · H = hide HUD · ?skip = skip intro · ?autoplay', 'font:italic 20px serif;color:#ff9f52', 'color:inherit');

  const finish = () => {
    document.body.classList.remove('is-loading');
    lenis.start();
    ScrollTrigger.refresh();
    if (AUTOPLAY) setTimeout(() => ui.runAutopilot(), 600);
  };

  if (SKIP_INTRO) {
    countTween.kill();
    gsap.set('#loader', { display: 'none' });
    gsap.set('.letterbox span', { scaleY: 0 });
    director.intro = 1;
    director.instant = true;
    ui.revealHero().progress(1);
    finish();
    return;
  }

  const minLoader = 2300;
  const elapsed = performance.now() - t0;
  if (elapsed < minLoader) await wait(minLoader - elapsed);
  countTween.kill();

  /* ---------------- cinematic intro */
  gsap
    .timeline()
    .to(counter, { v: 100, duration: 0.8, ease: 'power2.inOut', onUpdate: setCount })
    .to('.loader__center, .loader__log, .loader__count', { opacity: 0, y: -30, duration: 0.8, ease: 'power3.in', stagger: 0.06 }, '+=0.15')
    .addLabel('reveal')
    .to('#loader', { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.5, ease: 'expo.inOut' }, 'reveal')
    .to(director, { intro: 1, duration: 6.4, ease: 'none' }, 'reveal+=0.2')
    .add(() => ui.powerOn(0.26), 'reveal+=0.9')
    .add(() => ui.revealHero(), 'reveal+=4.6')
    .to('.letterbox span', { scaleY: 0, duration: 1.8, ease: 'expo.inOut' }, 'reveal+=4.4')
    .add(finish, 'reveal+=5.6')
    .set('#loader', { display: 'none' });
}

boot();
