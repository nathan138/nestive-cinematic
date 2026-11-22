import * as THREE from 'three';

/* Final grade: subtle chromatic aberration, vignette, animated film grain, fade. */
export const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.32 },
    uCA: { value: 0.0006 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uCA, uFade;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c * vec2(uRes.x / uRes.y, 1.0)) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
      vec2 off = c * d * d * uCA * 10.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = 1.0 - smoothstep(0.45, 1.25, d) * uVignette * 1.6;
      col *= clamp(vig, 0.0, 1.0);
      float n = hash(vUv * uRes + floor(uTime * 24.0) * 37.0) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * uGrain * (0.6 + 0.4 * (1.0 - lum));
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
