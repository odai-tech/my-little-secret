/* Joy — milk, honey & pistachio hero.
   One full-screen fragment shader: a slow, silky milk surface (iterated sine
   warping) marbled with thin ribbons of honey and pistachio, lit by bright
   Mediterranean daylight (soft diffuse + satin sheen + sky reflections in the
   folds), with real drips of milk hanging off the bottom edge (signed-distance
   round cones, smooth-unioned into the pour) that cast a soft sea-blue shadow
   on the page below. The cursor stirs the surface.
   Speed: surface normals come from hardware derivatives (one field sample per
   pixel), so it can render at the screen's native resolution. */
(function () {
  'use strict';

  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  const frag = (deriv, precision) => `
${deriv ? '#extension GL_OES_standard_derivatives : enable\n#define DERIV 1' : ''}
precision ${precision} float;
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

  // evaluated by every pixel, before any early exit, so derivatives stay valid
  float d = shape(px, W);
  vec2 f0 = field(px);
#ifdef DERIV
  vec2 gh = vec2(dFdx(f0.x), dFdy(f0.x)) * uDpr;
  vec2 gd = vec2(dFdx(d), dFdy(d)) * uDpr;
#else
  float e = 1.5;
  vec2 gh = vec2(field(px + vec2(e, 0.0)).x - f0.x, field(px + vec2(0.0, e)).x - f0.x) / e;
  vec2 gd = vec2(0.0, -1.0);
  if (px.y < uEdge + 46.0) gd = vec2(shape(px + vec2(1.0, 0.0), W) - d, shape(px + vec2(0.0, 1.0), W) - d);
#endif

  float aIn = clamp(0.5 - d * uDpr, 0.0, 1.0);
  float shadowA = 0.0;
  if (px.y < uEdge + 8.0) {
    float ds = shape(px + vec2(-2.5, 8.0), W);
    shadowA = 0.24 * (1.0 - smoothstep(-4.0, 14.0, ds));
  }
  if (aIn <= 0.0 && shadowA < 0.002) { gl_FragColor = vec4(0.0); return; }

  vec3 n = normalize(vec3(-gh * 70.0, 1.0));
  // rounded bead along the pour edge and the drips
  float rim = 1.0 - smoothstep(0.0, 15.0, -d);
  n = normalize(n + vec3(gd * rim * 1.5, 0.0));

  vec3 V  = vec3(0.0, 0.0, 1.0);
  vec3 L  = normalize(vec3(uLight, 0.9));
  vec3 Hh = normalize(L + V);
  float ndl = max(dot(n, L), 0.0);
  float ndh = max(dot(n, Hh), 0.0);
  // milk is satin, not glass: a wide sheen, a soft highlight, a small glint
  float spec = pow(ndh, 10.0) * 0.10 + pow(ndh, 60.0) * 0.20 + pow(ndh, 420.0) * 0.55;
  float fres = pow(1.0 - n.z, 2.0);
  vec2  R = n.xy * 2.0 * n.z;
  float box = smoothstep(0.06, 0.0, abs(R.x - uLight.x * 0.3) - 0.2)
            * smoothstep(0.06, 0.0, abs(R.y - uLight.y * 0.3) - 0.08);
  float sky = smoothstep(-0.2, 0.8, R.y);

  vec3 milkLo  = vec3(0.865, 0.872, 0.860);   // shaded milk picks up a little sea-blue sky
  vec3 milkHi  = vec3(0.995, 0.975, 0.940);
  vec3 honeyLo = vec3(0.800, 0.560, 0.220);
  vec3 honeyHi = vec3(0.975, 0.800, 0.470);
  vec3 pistLo  = vec3(0.600, 0.690, 0.450);
  vec3 pistHi  = vec3(0.800, 0.860, 0.620);
  float sh = smoothstep(0.0, 0.85, f0.x);
  float bw = 0.035 + 0.05 * f0.x;   // ribbons thicken where the surface swells
  float honey = smoothstep(bw, bw * 0.2, abs(f0.y - 0.80));
  float pist  = smoothstep(bw * 0.7, bw * 0.15, abs(f0.y - 0.24));
  vec3 base = mix(milkLo, milkHi, sh);
  base = mix(base, mix(honeyLo, honeyHi, sh), honey * 0.82);
  base = mix(base, mix(pistLo, pistHi, sh), pist * 0.6);

  vec3 col = base * (0.66 + 0.40 * ndl);            // light scatters inside milk: high ambient
  col += sky * 0.07 * vec3(0.55, 0.80, 0.88);
  col += fres * 0.12 * (1.0 - rim * 0.7) * vec3(0.52, 0.80, 0.90);      // Mediterranean blue in the folds
  col += spec * vec3(1.0, 0.985, 0.95);
  col += box * 0.10 * vec3(1.0, 0.97, 0.9);
  col = mix(col, vec3(0.975, 0.958, 0.93), rim * 0.32);   // drips stay creamy white, never metallic

  // a whisper of shade behind the wordmark so the gold reads on white
  vec2 c = (px - uStage) / vec2(W * 0.40, H * 0.26);
  col *= 1.0 - 0.08 * exp(-dot(c, c));
  col *= mix(0.93, 1.0, smoothstep(H, H * 0.55, px.y));
  col = col / (1.0 + 0.1 * col) * 1.1;              // soft shoulder so highlights never clip flat

  col += (hash2(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

  vec3 shadowCol = vec3(0.10, 0.20, 0.22);          // drips cast a cool, sea-tinted shadow
  gl_FragColor = vec4(col * aIn + shadowCol * shadowA * (1.0 - aIn), aIn + shadowA * (1.0 - aIn));
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

  function link(gl, deriv, precision) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, frag(deriv, precision));
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
  }

  function create(canvas, opts) {
    opts = opts || {};
    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return null;

    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const precision = hp && hp.precision > 0 ? 'highp' : 'mediump';
    const deriv = !!gl.getExtension('OES_standard_derivatives');
    const prog = (deriv && link(gl, true, precision)) || link(gl, false, precision);
    if (!prog) return null;
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

    // pixel budget: native resolution (up to 2x) where the GPU allows it
    const st = {
      cssW: 1, cssH: 1, scale: 1,
      // low-memory phones start lighter; everything else starts at full resolution and adapts down if needed
      budget: opts.mobile ? ((navigator.deviceMemory && navigator.deviceMemory <= 4) ? 1400000 : 2100000) : 3600000,
      floor: 520000, slow: 0, frames: 0, warm: 0,
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
      // adaptive quality: if the GPU can't hold ~50fps, shrink the pixel budget
      if (dt) {
        if (st.warm < 40) st.warm++;
        else {
          st.frames++;
          if (dt > 21) st.slow++;
          if (st.frames >= 50) {
            if (st.slow > 20 && st.budget > st.floor) { st.budget = Math.max(st.floor, st.budget * 0.7); resize(); st.warm = 20; }
            st.frames = 0; st.slow = 0;
          }
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
    return { resize, render, deriv, get lost() { return lost; } };
  }

  window.JoyLiquid = { create };
})();
