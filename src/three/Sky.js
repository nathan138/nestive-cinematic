import * as THREE from 'three';

/* Seamless studio cyclorama + sky gradient, sun/moon glow and a star field. */
export class Sky {
  constructor() {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uBot: { value: new THREE.Color() },
      uGlowColor: { value: new THREE.Color() },
      uGlowDir: { value: new THREE.Vector3(0, 0.2, -1) },
      uGlow: { value: 0 },
      uMoon: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0.42, 0.36, -1).normalize() },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHor, uBot, uGlowColor, uGlowDir, uMoonDir;
        uniform float uGlow, uMoon, uTime;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uTop, smoothstep(-0.05, 0.75, h));
          col = mix(col, uBot, smoothstep(0.0, -0.4, h));
          float g = max(dot(d, normalize(uGlowDir)), 0.0);
          col += uGlowColor * (pow(g, 6.0) * 0.55 + pow(g, 48.0) * 0.6) * uGlow;
          float m = max(dot(d, normalize(uMoonDir)), 0.0);
          col += vec3(0.78, 0.85, 1.0) * (smoothstep(0.99962, 0.99975, m) * 1.3 + pow(m, 900.0) * 0.3 + pow(m, 60.0) * 0.07) * uMoon;
          col += (hash(gl_FragCoord.xy + fract(uTime) * 17.0) - 0.5) * (2.0 / 255.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 64, 32), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    // stars
    const N = 1800;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random();
      const v = Math.random() * 0.92 + 0.06;
      const th = u * Math.PI * 2;
      const y = Math.pow(v, 0.7);
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 460, y * 460, Math.sin(th) * r * 460], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starUniforms = { uOpacity: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1 } };
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.starUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime, uScale;
          varying float vA;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.4) + aSeed * 40.0);
            vA = tw * (0.25 + 0.75 * aSeed * aSeed);
            gl_PointSize = (1.0 + aSeed * aSeed * 2.6) * uScale;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a * vA * uOpacity * 1.6, a);
          }
        `,
      })
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.mesh.add(this.stars);
  }

  update(pal, time, camera, pixelRatio) {
    const u = this.uniforms;
    u.uTop.value.copy(pal.top);
    u.uHor.value.copy(pal.hor);
    u.uBot.value.copy(pal.bot);
    u.uGlowColor.value.copy(pal.glow);
    u.uGlowDir.value.copy(pal.glowDir);
    u.uGlow.value = pal.glowI;
    u.uMoon.value = pal.moon;
    u.uTime.value = time;
    this.starUniforms.uOpacity.value = pal.stars;
    this.starUniforms.uTime.value = time;
    this.starUniforms.uScale.value = pixelRatio;
    this.mesh.position.copy(camera.position);
    this.stars.visible = pal.stars > 0.01;
  }
}
