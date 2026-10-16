/* Joy — molten chocolate & caramel hero.
   One full-screen fragment shader: a slow, silky liquid surface (iterated
   sine warping), lit like a studio pour (Blinn-Phong + softbox reflection),
   with real drips hanging off the bottom edge (signed-distance round cones,
   smooth-unioned into the pour) that cast a soft shadow on the page below.
   The cursor stirs the surface. */
(function () {
  'use strict';

  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uDpr;
uniform float uTime;
uniform vec2  uMouse;
uniform float uStir;
uniform float uEdge;
uniform float uDrip;
uniform float uFlow;
uniform vec2  uLight;
uniform vec2  uStage;

float hash(float n){ return fract(sin(n * 127.1) * 43758.5453123); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// iq's 2D round cone: a disc of radius r1 at the origin joined to radius r2 at (0,h)
float sdRoundCone(vec2 p, float r1, float r2, float h){
  p.x = abs(p.x);
  float b = (r1 - r2) / h;
  float a = sqrt(1.0 - b * b);
  float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}

#define NDRIP 18
float shape(vec2 px, float W){
  float edge = uEdge + 5.0 * sin(px.x * 0.011 + uTime * 0.35) + 3.0 * sin(px.x * 0.029 - uTime * 0.27);
  float d = edge - px.y;
  if (px.y > uEdge + 46.0) return d;
  float cell = W / float(NDRIP);
  for (int i = 0; i < NDRIP; i++){
    float fi = float(i);
    float x  = (fi + 0.5) * cell + (hash(fi + 1.3) - 0.5) * cell * 0.8;
    float g  = 0.62 + 0.38 * sin(uTime * (0.14 + 0.18 * hash(fi + 7.7)) + fi * 2.1);
    float L  = uDrip * (0.22 + 0.78 * hash(fi + 3.1)) * g;
    if (hash(fi + 17.0) < 0.3) L *= 0.35;
    L = max(L, 14.0);
    float rn = 3.5 + 4.0 * hash(fi + 11.1);
    float rh = rn + 2.5 + 5.5 * hash(fi + 5.9);
    d = smin(d, sdRoundCone(px - vec2(x, uEdge - L), rh, rn, L), 18.0);
  }
  return d;
}

vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// x: surface height (0..1), y: caramel ribbon field
vec2 field(vec2 px){
  vec2 uv = px / 430.0;
  vec2 m  = uMouse / 430.0;
  vec2 dm = uv - m;
  uv = m + rot(dm, uStir * 2.4 * exp(-dot(dm, dm) * 4.0));
  float t = uTime * 0.16 + uFlow;
  vec2 p = uv * 1.35 + vec2(0.0, t * 0.1);
  for (int i = 1; i < 7; i++){
    float fi = float(i);
    p.x += 0.62 / fi * sin(fi * p.y * 1.1 + t + fi * 1.7);
    p.y += 0.50 / fi * cos(fi * p.x * 0.9 - t * 0.8 + fi * 0.9);
  }
  float h = 0.5 + 0.5 * sin(p.x * 1.6 + p.y * 0.9);
  return vec2(pow(h, 1.6), 0.5 + 0.5 * sin(p.x * 0.7 - p.y * 1.25 + 2.0));
}

void main(){
  vec2 px = gl_FragCoord.xy / uDpr;
  float W = uRes.x / uDpr;
  float H = uRes.y / uDpr;

  float d = shape(px, W);
  float aIn = clamp(0.5 - d, 0.0, 1.0);
  float shadowA = 0.0;
  if (px.y < uEdge + 8.0) {
    float ds = shape(px + vec2(-2.5, 8.0), W);
    shadowA = 0.32 * (1.0 - smoothstep(-4.0, 14.0, ds));
  }
  if (aIn <= 0.0 && shadowA < 0.002) { gl_FragColor = vec4(0.0); return; }

  float e = 1.6;
  vec2 f0 = field(px);
  vec2 fx = field(px + vec2(e, 0.0));
  vec2 fy = field(px + vec2(0.0, e));
  float k = 95.0;
  vec3 n = normalize(vec3(-(fx.x - f0.x) / e * k, -(fy.x - f0.x) / e * k, 1.0));

  // rounded bead along the pour edge and the drips
  float rim = 0.0;
  if (px.y < uEdge + 46.0) {
    float gx = shape(px + vec2(1.0, 0.0), W) - d;
    float gy = shape(px + vec2(0.0, 1.0), W) - d;
    rim = 1.0 - smoothstep(0.0, 15.0, -d);
    n = normalize(n + vec3(vec2(gx, gy) * rim * 2.4, 0.0));
  }

  vec3 V  = vec3(0.0, 0.0, 1.0);
  vec3 L  = normalize(vec3(uLight, 0.9));
  vec3 Hh = normalize(L + V);
  float ndl = max(dot(n, L), 0.0);
  float ndh = max(dot(n, Hh), 0.0);
  // three lobes: a broad satin sheen, a soft highlight and a sharp glint
  float spec = pow(ndh, 9.0) * 0.16 + pow(ndh, 48.0) * 0.38 + pow(ndh, 320.0) * 1.25;
  float fres = pow(1.0 - n.z, 2.0);
  vec2  R = n.xy * 2.0 * n.z;
  float box = smoothstep(0.06, 0.0, abs(R.x - uLight.x * 0.3) - 0.2)
            * smoothstep(0.06, 0.0, abs(R.y - uLight.y * 0.3) - 0.08);
  float sky = smoothstep(-0.2, 0.8, R.y);

  vec3 chocDeep = vec3(0.075, 0.032, 0.014);
  vec3 choc     = vec3(0.300, 0.142, 0.064);
  vec3 carDeep  = vec3(0.470, 0.200, 0.050);
  vec3 car      = vec3(0.900, 0.540, 0.190);
  float bw = 0.045 + 0.06 * f0.x;   // ribbons thicken where the surface swells
  float band = smoothstep(bw, bw * 0.45, abs(f0.y - 0.80));
  vec3 base = mix(mix(chocDeep, choc, smoothstep(0.0, 0.8, f0.x)), mix(carDeep, car, smoothstep(0.0, 0.8, f0.x)), band * 0.95);

  vec3 col = base * (0.38 + 0.8 * ndl);
  col += sky * 0.07 * vec3(1.0, 0.78, 0.55);
  col += spec * mix(vec3(1.0, 0.80, 0.60), vec3(1.0, 0.92, 0.78), band);
  col += box * 0.26 * vec3(1.0, 0.86, 0.68);
  col += fres * 0.05 * vec3(1.0, 0.66, 0.38);
  col *= 1.0 - rim * 0.16;

  // a darker stage behind the wordmark so the gold reads
  vec2 c = (px - uStage) / vec2(W * 0.40, H * 0.26);
  col *= 1.0 - 0.34 * exp(-dot(c, c));
  col *= mix(0.80, 1.0, smoothstep(H, H * 0.55, px.y));

  col += (hash2(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

  gl_FragColor = vec4(col * aIn, aIn + shadowA * (1.0 - aIn));
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[joy] shader:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function create(canvas, opts) {
    opts = opts || {};
    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ['uRes', 'uDpr', 'uTime', 'uMouse', 'uStir', 'uEdge', 'uDrip', 'uFlow', 'uLight', 'uStage']
      .forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

    let lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; }, false);

    const st = {
      cssW: 1, cssH: 1, scale: 1,
      budget: opts.mobile ? 380000 : 1250000,
      slow: 0, frames: 0,
    };

    function resize() {
      const r = canvas.getBoundingClientRect();
      st.cssW = Math.max(1, r.width);
      st.cssH = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      st.scale = Math.min(dpr, Math.sqrt(st.budget / (st.cssW * st.cssH)));
      canvas.width = Math.round(st.cssW * st.scale);
      canvas.height = Math.round(st.cssH * st.scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    /* s: { time, mouseX, mouseY (css px, top-left origin of canvas), stir, edge, drip, flow, lightX, lightY, stageY } */
    function render(s, dt) {
      if (lost) return;
      // adaptive quality: if frames run long, shrink the pixel budget
      if (dt) {
        st.frames++;
        if (dt > 26) st.slow++;
        if (st.frames >= 45) {
          if (st.slow > 22 && st.budget > 180000) { st.budget *= 0.72; resize(); }
          st.frames = 0; st.slow = 0;
        }
      }
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uDpr, st.scale);
      gl.uniform1f(U.uTime, s.time);
      gl.uniform2f(U.uMouse, s.mouseX, st.cssH - s.mouseY);
      gl.uniform1f(U.uStir, s.stir);
      gl.uniform1f(U.uEdge, s.edge);
      gl.uniform1f(U.uDrip, s.drip);
      gl.uniform1f(U.uFlow, s.flow);
      gl.uniform2f(U.uLight, s.lightX, s.lightY);
      gl.uniform2f(U.uStage, st.cssW * 0.5, st.cssH - s.stageY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    resize();
    return { resize, render, get lost() { return lost; } };
  }

  window.JoyLiquid = { create };
})();
