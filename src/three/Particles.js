import * as THREE from 'three';

/* Floating dust motes by day, flickering fireflies by night. */
export class Particles {
  constructor(count = 900) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos.set([(Math.random() - 0.5) * 26, Math.random() * 9 + 0.2, (Math.random() - 0.5) * 18 + 1.5], i * 3);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uDust: { value: 0.4 },
      uFlies: { value: 0 },
      uScale: { value: 500 },
    };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime, uScale, uDust, uFlies;
          varying float vA;
          varying float vFly;
          void main() {
            vec3 p = position;
            float t = uTime * (0.12 + aSeed.x * 0.22);
            p.x += sin(t + aSeed.y * 6.283) * 0.7;
            p.y += sin(t * 0.8 + aSeed.z * 6.283) * 0.45;
            p.z += cos(t * 0.9 + aSeed.w * 6.283) * 0.7;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float fly = step(0.62, aSeed.w);
            vFly = fly;
            float flick = pow(0.5 + 0.5 * sin(uTime * (1.4 + aSeed.x * 2.6) + aSeed.y * 30.0), 3.0);
            vA = uDust * (1.0 - fly * uFlies) * (0.25 + 0.75 * aSeed.z) + fly * uFlies * flick;
            float size = mix(0.025, 0.06, aSeed.z) * (1.0 + fly * uFlies * 0.8);
            gl_PointSize = size * uScale / -mv.z;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uFlies;
          varying float vA;
          varying float vFly;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = pow(smoothstep(0.5, 0.0, d), 1.8);
            vec3 dust = vec3(1.0, 0.97, 0.9) * 1.2;
            vec3 fly = vec3(1.0, 0.62, 0.28) * 2.4;
            vec3 col = mix(dust, fly, vFly * uFlies);
            gl_FragColor = vec4(col * a * vA, a * vA);
          }
        `,
      })
    );
    this.points.frustumCulled = false;
  }

  resize(bufferHeight, fov) {
    this.uniforms.uScale.value = bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  update(time, pal) {
    this.uniforms.uTime.value = time;
    this.uniforms.uDust.value = pal.dust;
    this.uniforms.uFlies.value = pal.flies;
  }
}
