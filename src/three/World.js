import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { House } from './House.js';
import { Sky } from './Sky.js';
import { Particles } from './Particles.js';
import { CinematicShader } from './CinematicShader.js';
import { samplePalette } from './palette.js';
import { radialTexture } from './geometry.js';

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      powerPreference: 'high-performance',
    }));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(this.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1400);

    const pmrem = new THREE.PMREMGenerator(r);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    // lights
    this.hemi = new THREE.HemisphereLight('#ffffff', '#777777', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 6;
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0, 2.5, 0);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun, this.sunTarget);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.house = new House();
    this.scene.add(this.house.root);
    // glass keeps strong reflections even when the ambient environment is dimmed
    this.house.m.glass.envMap = this.envTex;
    this.house.m.glass.envMapIntensity = 1.0;

    // ground: invisible shadow catcher + contact shadow + warm light pool
    this.groundMat = new THREE.ShadowMaterial({ color: '#17211b', opacity: 0.3, depthWrite: false });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const radial = radialTexture(256);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radial, color: '#0b120e', transparent: true, opacity: 0.55, depthWrite: false, fog: false })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.set(0.2, 0.004, 0.1);
    this.blob.scale.set(12.5, 6.8, 1);
    this.scene.add(this.blob);

    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radial,
        color: new THREE.Color('#ff9848'),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.set(-0.4, 0.008, 2.6);
    this.pool.scale.set(16, 8.5, 1);
    this.scene.add(this.pool);

    this.particles = new Particles();
    this.scene.add(this.particles.points);

    this.scene.fog = new THREE.FogExp2('#a0a89c', 0.0055);

    // post-processing
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.7, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cine = new ShaderPass(CinematicShader);
    this.composer.addPass(this.cine);

    this.levels = { master: 1, fade: 0 };
    this.mouse = { x: 0, y: 0 };
    this._target = new THREE.Vector3();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cine.uniforms.uRes.value.set(w * this.pixelRatio, h * this.pixelRatio);
  }

  /** Apply a camera "shot" state (spherical orbit around a target + lens shift). */
  applyCamera(st, mouse) {
    const t = this.time;
    const az = st.az + mouse.x * 0.045 + Math.sin(t * 0.13) * 0.012;
    const el = st.el + mouse.y * 0.028 + Math.sin(t * 0.17 + 1.3) * 0.006;
    // responsive framing: on narrow / portrait screens pull back and keep the house low & centred
    let dist = st.dist;
    let shift = st.shift;
    let lift = st.lift || 0;
    if (this.width < 820) {
      const aspect = this.width / this.height;
      dist *= Math.min(2.3, Math.max(1, 1.0 / aspect));
      shift *= 0.1;
      lift = lift * 0.4 - 0.17;
    }
    const ce = Math.cos(el);
    const cam = this.camera;
    this._target.set(st.tx, st.ty, st.tz);
    cam.position.set(
      st.tx + dist * ce * Math.sin(az),
      st.ty + dist * Math.sin(el),
      st.tz + dist * ce * Math.cos(az)
    );
    cam.lookAt(this._target);
    cam.rotateZ(st.roll || 0);
    cam.fov = st.fov;
    cam.setViewOffset(this.width, this.height, -shift * this.width, lift * this.height, this.width, this.height);
    cam.updateProjectionMatrix();
  }

  update(dt, st, mouse) {
    this.time += dt;
    const t = this.time;
    const pal = samplePalette(st.tod);
    this.pal = pal;

    this.applyCamera(st, mouse);

    this.sky.update(pal, t, this.camera, this.pixelRatio);
    this.sun.color.copy(pal.sun);
    this.sun.intensity = pal.sunI;
    this.sun.position.copy(pal.sunDir).multiplyScalar(30).add(this.sunTarget.position);
    this.hemi.color.copy(pal.hemiSky);
    this.hemi.groundColor.copy(pal.hemiGround);
    this.hemi.intensity = pal.hemi;
    this.scene.environmentIntensity = pal.env;
    this.scene.fog.color.copy(pal.hor);
    this.groundMat.opacity = pal.shadow;
    this.renderer.toneMappingExposure = pal.exposure;

    const lights = pal.lights;
    this.house.update(dt, { explode: st.explode, lights, master: this.levels.master });

    const hover = this.house.root.position.y + this.house.lift.position.y;
    this.blob.material.opacity = 0.5 * (1 - Math.min(1, hover / 3)) * (0.6 + pal.shadow);
    const glow = (this.house.lg.ground.power + this.house.lg.upper.power + this.house.lg.lamps.power) / 3;
    this.pool.material.opacity = pal.pool * lights * glow * 0.22 * this.levels.master;

    this.bloom.strength = pal.bloom;
    this.bloom.threshold = pal.bth;
    this.particles.resize(this.height * this.pixelRatio, this.camera.fov);
    this.particles.update(t, pal);

    this.cine.uniforms.uTime.value = t;
    this.cine.uniforms.uFade.value = this.levels.fade;
    this.composer.render(dt);
  }
}
