/* Joy — ambient ingredients.
   Every sprite is painted once onto an offscreen canvas (gradients, gloss,
   seeds, veins) and then drifted, tumbled and flipped in fake 3D on one
   canvas that sits behind the content, so nothing ever crosses a photo.
   Each section picks a "theme". */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }
  function gloss(x, S, cx, cy, r, a) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  }

  /* ───────────── sprite painters ───────────── */
  const P = {
    goldFlake() {
      const S = 96, c = cv(S), x = c.getContext('2d');
      const n = 7 + ((Math.random() * 4) | 0), pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-.25, .25), r = S * rnd(.22, .44);
        pts.push([S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r * rnd(.6, 1)]);
      }
      x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath();
      const g = x.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, '#5E4110'); g.addColorStop(.3, '#C9973A'); g.addColorStop(.46, '#FFF3C4');
      g.addColorStop(.6, '#D9A947'); g.addColorStop(.8, '#8A621F'); g.addColorStop(1, '#E8C068');
      x.fillStyle = g; x.fill();
      x.save(); x.clip();
      x.strokeStyle = 'rgba(255,248,220,.55)'; x.lineWidth = 1;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(rnd(0, S), rnd(0, S)); x.lineTo(rnd(0, S), rnd(0, S)); x.stroke(); }
      x.strokeStyle = 'rgba(110,80,25,.35)';
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(rnd(0, S), rnd(0, S)); x.lineTo(rnd(0, S), rnd(0, S)); x.stroke(); }
      x.restore();
      return c;
    },
    caramelDrop() {
      const S = 96, c = cv(S), x = c.getContext('2d'), r = S * .36;
      x.shadowColor = 'rgba(224,138,44,.55)'; x.shadowBlur = 10;
      const g = x.createRadialGradient(S * .42, S * .38, r * .1, S / 2, S / 2, r);
      g.addColorStop(0, '#FFD493'); g.addColorStop(.35, '#E79E45'); g.addColorStop(.78, '#A4521A'); g.addColorStop(1, '#5E2808');
      x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, r, 0, TAU); x.fill();
      x.shadowBlur = 0;
      gloss(x, S, S * .38, S * .34, r * .42, .85);
      x.strokeStyle = 'rgba(255,205,150,.35)'; x.lineWidth = 2;
      x.beginPath(); x.arc(S / 2, S / 2, r * .86, .15 * Math.PI, .65 * Math.PI); x.stroke();
      return c;
    },
    sprinkle(col) {
      const S = 32, c = cv(S), x = c.getContext('2d'), r = S * .4;
      const g = x.createRadialGradient(S * .36, S * .32, 0, S / 2, S / 2, r);
      g.addColorStop(0, shade(col, .55)); g.addColorStop(.45, col); g.addColorStop(1, shade(col, -.45));
      x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, r, 0, TAU); x.fill();
      gloss(x, S, S * .36, S * .32, r * .38, .9);
      return c;
    },
    coconut() {
      const S = 64, c = cv(S), x = c.getContext('2d');
      const bend = rnd(.1, .35);
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(120,100,80,.25)'; x.lineWidth = S * .1;
      x.beginPath(); x.moveTo(S * .14, S * .62); x.quadraticCurveTo(S * .5, S * bend + 3, S * .86, S * .6); x.stroke();
      const g = x.createLinearGradient(0, S * .3, 0, S * .7);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#EDE3D2');
      x.strokeStyle = g; x.lineWidth = S * .085;
      x.beginPath(); x.moveTo(S * .14, S * .6); x.quadraticCurveTo(S * .5, S * bend, S * .86, S * .58); x.stroke();
      return c;
    },
    petal() {
      const S = 128, c = cv(S), x = c.getContext('2d');
      const hue = pick([['#F7DDE1', '#E5A3B0', '#A94D66'], ['#F3D3DA', '#D98A9E', '#8E3F5C'], ['#FBE6E8', '#EDB7C1', '#B66079']]);
      x.beginPath();
      x.moveTo(S * .5, S * .93);
      x.bezierCurveTo(S * .06, S * .72, S * .1, S * .16, S * .5, S * .1);
      x.bezierCurveTo(S * .9, S * .16, S * .94, S * .72, S * .5, S * .93);
      const g = x.createRadialGradient(S * .48, S * .4, S * .04, S * .5, S * .55, S * .5);
      g.addColorStop(0, hue[0]); g.addColorStop(.55, hue[1]); g.addColorStop(1, hue[2]);
      x.fillStyle = g; x.fill();
      x.save(); x.clip();
      x.strokeStyle = 'rgba(120,30,55,.16)'; x.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) {
        x.beginPath(); x.moveTo(S * .5, S * .92);
        x.quadraticCurveTo(S * (.5 + i * .09), S * .5, S * (.5 + i * .15), S * .12); x.stroke();
      }
      const sh = x.createLinearGradient(0, 0, S, 0);
      sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(80,10,30,.18)');
      x.fillStyle = sh; x.fillRect(0, 0, S, S);
      x.restore();
      return c;
    },
    pistachio() {
      const S = 96, c = cv(S), x = c.getContext('2d');
      x.translate(S / 2, S / 2); x.rotate(rnd(-.4, .4));
      x.beginPath(); x.ellipse(0, 0, S * .4, S * .13, 0, 0, TAU);
      const g = x.createLinearGradient(0, -S * .13, 0, S * .13);
      g.addColorStop(0, '#D3E39A'); g.addColorStop(.45, '#97B64E'); g.addColorStop(1, '#5B7A27');
      x.fillStyle = g; x.fill();
      x.strokeStyle = '#8A4A5E'; x.lineWidth = S * .045;
      x.beginPath(); x.ellipse(0, 0, S * .4, S * .13, 0, .1 * Math.PI, .9 * Math.PI); x.stroke();
      x.globalAlpha = .5; gloss(x, S, -S * .12, -S * .05, S * .12, .6);
      return c;
    },
    blueberry() {
      const S = 96, c = cv(S), x = c.getContext('2d'), r = S * .37;
      const g = x.createRadialGradient(S * .38, S * .34, r * .05, S / 2, S / 2, r);
      g.addColorStop(0, '#7C88C4'); g.addColorStop(.32, '#3A4079'); g.addColorStop(.8, '#1C1E42'); g.addColorStop(1, '#0D0E23');
      x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, r, 0, TAU); x.fill();
      x.save(); x.beginPath(); x.arc(S / 2, S / 2, r, 0, TAU); x.clip();
      for (let i = 0; i < 160; i++) {
        x.fillStyle = `rgba(190,200,240,${rnd(.03, .1)})`;
        x.beginPath(); x.arc(rnd(0, S), rnd(0, S), rnd(.6, 2), 0, TAU); x.fill();
      }
      x.restore();
      // the little five-point crown
      x.save(); x.translate(S * .5, S * .3);
      x.fillStyle = '#12132B'; x.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? S * .03 : S * .085;
        x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * .7);
      }
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(150,160,210,.4)'; x.lineWidth = 1; x.stroke();
      x.restore();
      gloss(x, S, S * .4, S * .4, r * .35, .35);
      return c;
    },
    mango() {
      const S = 96, c = cv(S), x = c.getContext('2d'), w = S * .54, r = S * .1;
      x.translate(S / 2, S / 2); x.rotate(rnd(-.3, .3));
      x.shadowColor = 'rgba(249,154,22,.6)'; x.shadowBlur = 8;
      const g = x.createLinearGradient(-w / 2, -w / 2, w / 2, w / 2);
      g.addColorStop(0, '#FFD45E'); g.addColorStop(.5, '#FBA021'); g.addColorStop(1, '#D9690A');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(-w / 2 + r, -w / 2); x.arcTo(w / 2, -w / 2, w / 2, w / 2, r); x.arcTo(w / 2, w / 2, -w / 2, w / 2, r);
      x.arcTo(-w / 2, w / 2, -w / 2, -w / 2, r); x.arcTo(-w / 2, -w / 2, w / 2, -w / 2, r); x.closePath(); x.fill();
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,240,180,.35)';
      x.beginPath(); x.moveTo(-w / 2 + r, -w / 2 + 2); x.lineTo(w / 2 - r, -w / 2 + 2); x.lineTo(w * .2, -w * .12); x.lineTo(-w * .3, -w * .12); x.closePath(); x.fill();
      gloss(x, S, -w * .18, -w * .2, w * .25, .7);
      return c;
    },
    strawberry() {
      const S = 96, c = cv(S), x = c.getContext('2d');
      x.beginPath();
      x.moveTo(S * .5, S * .9);
      x.bezierCurveTo(S * .16, S * .72, S * .1, S * .38, S * .28, S * .28);
      x.bezierCurveTo(S * .4, S * .21, S * .6, S * .21, S * .72, S * .28);
      x.bezierCurveTo(S * .9, S * .38, S * .84, S * .72, S * .5, S * .9);
      const g = x.createRadialGradient(S * .42, S * .44, S * .04, S * .5, S * .55, S * .42);
      g.addColorStop(0, '#FF6B7C'); g.addColorStop(.5, '#D81B32'); g.addColorStop(1, '#850515');
      x.fillStyle = g; x.fill();
      x.save(); x.clip();
      for (let yy = .36; yy < .86; yy += .085) {
        for (let xx = .2; xx < .82; xx += .1) {
          const sx = S * (xx + (Math.round(yy * 100) % 2 ? .05 : 0)), sy = S * yy;
          x.fillStyle = 'rgba(90,0,10,.45)'; x.beginPath(); x.ellipse(sx, sy + .8, 2, 2.6, 0, 0, TAU); x.fill();
          x.fillStyle = '#F6D46A'; x.beginPath(); x.ellipse(sx, sy, 1.2, 1.8, 0, 0, TAU); x.fill();
        }
      }
      x.restore();
      gloss(x, S, S * .38, S * .42, S * .14, .55);
      x.translate(S * .5, S * .26);
      for (let i = 0; i < 6; i++) {
        x.save(); x.rotate((i / 6) * TAU + .3);
        const lg = x.createLinearGradient(0, 0, S * .17, 0);
        lg.addColorStop(0, '#2C6E22'); lg.addColorStop(1, '#5DA644');
        x.fillStyle = lg; x.beginPath(); x.ellipse(S * .08, 0, S * .09, S * .03, 0, 0, TAU); x.fill();
        x.restore();
      }
      return c;
    },
    crumb(palette) {
      const S = 64, c = cv(S), x = c.getContext('2d');
      const p = palette || ['#E7AE62', '#BE7E38', '#875322'];
      const n = 6 + ((Math.random() * 3) | 0), pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = S * rnd(.18, .36); pts.push([S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r]); }
      x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath();
      const g = x.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, p[0]); g.addColorStop(.55, p[1]); g.addColorStop(1, p[2]);
      x.fillStyle = g; x.fill();
      x.save(); x.clip();
      for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(60,30,10,${rnd(.08, .25)})`; x.fillRect(rnd(0, S), rnd(0, S), 1.6, 1.6); }
      for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(255,230,180,.25)'; x.fillRect(rnd(0, S), rnd(0, S), 1.4, 1.4); }
      x.restore();
      return c;
    },
    shaving() {
      const S = 112, c = cv(S), x = c.getContext('2d');
      x.translate(S / 2, S / 2); x.rotate(rnd(0, TAU));
      x.lineCap = 'round';
      x.strokeStyle = '#2A1208'; x.lineWidth = S * .13;
      x.beginPath(); x.arc(0, 0, S * .28, .15 * Math.PI, 1.65 * Math.PI); x.stroke();
      const g = x.createLinearGradient(-S * .3, -S * .3, S * .3, S * .3);
      g.addColorStop(0, '#4A2210'); g.addColorStop(.5, '#8A5130'); g.addColorStop(1, '#3B1A0A');
      x.strokeStyle = g; x.lineWidth = S * .1;
      x.beginPath(); x.arc(0, 0, S * .28, .15 * Math.PI, 1.65 * Math.PI); x.stroke();
      x.strokeStyle = 'rgba(255,215,170,.35)'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(0, 0, S * .3, .3 * Math.PI, 1.2 * Math.PI); x.stroke();
      x.strokeStyle = '#5E2E15'; x.lineWidth = S * .07;
      x.beginPath(); x.arc(0, 0, S * .15, .4 * Math.PI, 1.8 * Math.PI); x.stroke();
      return c;
    },
  };

  /* ───────────── sprite library ───────────── */
  const SPRINKLES = ['#F25C54', '#FFD23F', '#3BCEAC', '#4D96FF', '#FF8FAB', '#FFFFFF', '#9B5DE5', '#FF9F1C'];
  let LIB = null;
  function buildLib() {
    const many = (fn, n, arg) => Array.from({ length: n }, () => fn(arg));
    LIB = {
      goldFlake:   { s: many(P.goldFlake, 6),  flip: true,  size: [7, 18],  fall: [10, 26], sway: 22 },
      caramelDrop: { s: many(P.caramelDrop, 2), flip: false, size: [10, 20], fall: [26, 46], sway: 6 },
      sprinkle:    { s: SPRINKLES.map(P.sprinkle), flip: false, size: [5, 9], fall: [40, 70], sway: 8 },
      coconut:     { s: many(P.coconut, 4),    flip: true,  size: [12, 22], fall: [20, 38], sway: 18 },
      petal:       { s: many(P.petal, 6),      flip: true,  size: [18, 36], fall: [14, 30], sway: 36 },
      pistachio:   { s: many(P.pistachio, 4),  flip: true,  size: [12, 22], fall: [22, 40], sway: 14 },
      blueberry:   { s: many(P.blueberry, 3),  flip: false, size: [14, 26], fall: [30, 52], sway: 6 },
      mango:       { s: many(P.mango, 4),      flip: false, size: [14, 26], fall: [28, 48], sway: 8 },
      strawberry:  { s: many(P.strawberry, 3), flip: false, size: [16, 28], fall: [28, 46], sway: 8 },
      crumb:       { s: many(P.crumb, 6),      flip: false, size: [5, 12],  fall: [30, 56], sway: 10 },
      chocCrumb:   { s: many(P.crumb, 4, ['#7A4426', '#4A220F', '#2A1208']), flip: false, size: [5, 11], fall: [30, 56], sway: 10 },
      shaving:     { s: many(P.shaving, 5),    flip: true,  size: [18, 32], fall: [22, 38], sway: 16 },
    };
  }

  /* themes: [sprite, weight] and density per 1M css px */
  const THEMES = {
    none:        { mix: [], density: 0 },
    gold:        { mix: [['goldFlake', 1]], density: 16 },
    'gold-soft': { mix: [['goldFlake', 1]], density: 9 },
    caramel:     { mix: [['goldFlake', .55], ['caramelDrop', .45]], density: 18 },
    sprinkles:   { mix: [['sprinkle', .72], ['coconut', .28]], density: 30 },
    rose:        { mix: [['petal', .62], ['pistachio', .38]], density: 15 },
    berries:     { mix: [['blueberry', .45], ['strawberry', .2], ['crumb', .35]], density: 16 },
    blueberry:   { mix: [['blueberry', .78], ['crumb', .22]], density: 17 },
    mango:       { mix: [['mango', .82], ['crumb', .18]], density: 16 },
    strawberry:  { mix: [['strawberry', .78], ['crumb', .22]], density: 15 },
    lotus:       { mix: [['crumb', 1]], density: 32 },
    chocolate:   { mix: [['shaving', .55], ['chocCrumb', .45]], density: 16 },
  };
  function pickType(theme) {
    let r = Math.random(), acc = 0;
    for (const [k, w] of theme.mix) { acc += w; if (r <= acc) return k; }
    return theme.mix[theme.mix.length - 1][0];
  }

  const FX = {
    c: null, x: null, w: 1, h: 1, dpr: 1, items: [],
    theme: THEMES.none, themeName: 'none', mouse: { x: -9999, y: -9999 }, enabled: true, dirty: false,

    init(canvas) {
      buildLib();
      this.c = canvas; this.x = canvas.getContext('2d');
      this.resize();
    },
    resize() {
      if (!this.c) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.c.width = Math.round(this.w * this.dpr); this.c.height = Math.round(this.h * this.dpr);
      this.dirty = true;
    },
    setTheme(name) {
      if (!THEMES[name] || name === this.themeName) return;
      this.themeName = name; this.theme = THEMES[name];
      // pieces of the previous theme fade out and are replaced in place
      this.items.forEach(p => { if (p.theme !== this.theme) p.dying = true; });
    },
    spawn(anywhere) {
      const theme = this.theme;
      if (!theme.mix.length) return null;
      const type = pickType(theme), def = LIB[type];
      const z = rnd(.35, 1);
      const scale = Math.min(1, Math.max(.7, this.w / 1300));
      return {
        def, img: pick(def.s), z, theme,
        size: rnd(def.size[0], def.size[1]) * (.55 + z * .55) * scale,
        x: rnd(-20, this.w + 20),
        y: anywhere ? rnd(-40, this.h + 40) : rnd(-140, -30),
        vy: rnd(def.fall[0], def.fall[1]) * (.5 + z * .7),
        vx: 0, sway: def.sway * rnd(.5, 1.2), swayF: rnd(.3, .9), ph: rnd(0, TAU),
        rot: rnd(0, TAU), vr: rnd(-.9, .9) * (def.flip ? 1 : .5),
        flip: rnd(0, TAU), vf: def.flip ? rnd(1, 2.6) : 0,
        alpha: 0, target: rnd(.55, 1), dying: false,
      };
    },
    /* paused: keep state, just stop drawing (e.g. while the hero covers the screen) */
    tick(dt, scrollDy, paused) {
      if (!this.c || !this.enabled) return;
      const x = this.x;
      if (paused) {
        if (this.dirty || this.items.length) { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.c.width, this.c.height); this.dirty = false; }
        this.items.length = 0;
        return;
      }
      const sec = Math.min(dt, 50) / 1000;
      const want = Math.round(this.theme.density * (this.w * this.h / 1e6) * (this.w < 700 ? .6 : 1));
      let live = 0;
      for (const p of this.items) if (!p.dying) live++;
      if (live < want && Math.random() < .4) { const p = this.spawn(this.items.length < want * .4); if (p) this.items.push(p); }
      if (!this.items.length && !this.dirty) return;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, this.c.width, this.c.height);
      this.dirty = false;
      const mx = this.mouse.x, my = this.mouse.y, d = this.dpr;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        // fall + sway + depth parallax against the page scroll
        p.y += p.vy * sec - scrollDy * (.18 + p.z * .42);
        p.ph += p.swayF * sec;
        p.x += Math.sin(p.ph * TAU * .25) * p.sway * sec + p.vx * sec;
        p.vx *= .94;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 16000) { const f = (1 - d2 / 16000) * 900, dd = Math.sqrt(d2) || 1; p.vx += dx / dd * f * sec; }
        p.rot += p.vr * sec; p.flip += p.vf * sec;
        p.alpha += ((p.dying ? 0 : p.target) - p.alpha) * Math.min(1, sec * (p.dying ? 3 : 1.6));
        const out = p.y > this.h + 160 || p.x < -160 || p.x > this.w + 160;
        if ((p.dying && p.alpha < .02) || out) {
          if (!p.dying && live <= want) { const n = this.spawn(false); if (n) { this.items[i] = n; continue; } }
          this.items.splice(i, 1); if (!p.dying) live--; continue;
        }
        if (p.y < -200) p.y += this.h + 340;  // scrolled up past the top: recycle at the bottom
        // flip = squash along the piece's own axis, which reads as a 3D tumble
        const fl = p.def.flip ? Math.cos(p.flip) : 1;
        x.globalAlpha = p.alpha * (p.def.flip ? (.55 + .45 * Math.abs(fl)) : 1);
        x.setTransform(d, 0, 0, d, p.x * d, p.y * d);
        x.rotate(p.rot);
        if (p.def.flip) x.scale(fl, 1);
        x.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      x.globalAlpha = 1;
    },
  };

  window.JoyFX = FX;
})();
