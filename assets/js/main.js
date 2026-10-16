/* Joy — orchestration: intro, i18n, scroll choreography, chameleon page colour,
   tilt + glare, flavour spotlight, 3D table, and the order box. */
(function () {
  'use strict';

  /* ── contact ───────────────────────────────────────────────── */
  const CONTACT = {
    email: 'mylittlesecret782@gmail.com',
    // TODO: WhatsApp number in international format, digits only (e.g. '972501234567').
    // Leave empty to hide the WhatsApp buttons and order by email only.
    whatsapp: '',
  };

  /* ── helpers ───────────────────────────────────────────────── */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  let FR = 1;  // frame-time factor, 1 at 60fps
  const ease = (a, b, k) => a + (b - a) * (1 - Math.pow(1 - k, FR));
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const small = () => innerWidth <= 860;
  const safe = (store) => ({
    get(k) { try { return window[store].getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window[store].setItem(k, v); } catch (e) { /* private mode */ } },
  });
  const local = safe('localStorage'), session = safe('sessionStorage');

  /* ── i18n ──────────────────────────────────────────────────── */
  const I18N = window.JOY_I18N;
  let lang = 'en';
  const t = k => (I18N[lang] && I18N[lang][k] != null) ? I18N[lang][k] : (I18N.en[k] != null ? I18N.en[k] : k);
  const listOf = k => t(k).split('·').map(s => s.trim()).filter(Boolean);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* wrap words for reveal animations, keeping <em> and <br>.
     Words (never letters) so Arabic keeps its joined shapes. */
  function splitWords(el, flat) {
    let i = 0;
    (function walk(node) {
      Array.from(node.childNodes).forEach(ch => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const s = document.createElement('span');
            if (flat) { s.className = 'mw'; s.textContent = part; frag.appendChild(s); return; }
            const w = document.createElement('span');
            w.className = 'w'; s.textContent = part; s.style.setProperty('--i', i++);
            w.appendChild(s); frag.appendChild(w);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1 && ch.tagName !== 'BR') walk(ch);
      });
    })(el);
  }

  function applyLang(code) {
    if (!I18N[code]) code = 'en';
    lang = code;
    html.lang = code;
    html.dir = I18N[code].dir;
    $$('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    $$('[data-notes]').forEach(ul => { ul.innerHTML = listOf(ul.dataset.notes).map(n => `<li>${esc(n)}</li>`).join(''); });
    $$('[data-split]').forEach(el => splitWords(el));
    splitManifesto();
    buildRibbons();
    renderMenu();
    renderSummary();
    showFlavourText();
    $('#langCurrent').textContent = code.toUpperCase();
    $$('.lang-menu button').forEach(b => b.setAttribute('aria-current', String(b.dataset.lang === code)));
    local.set('joy-lang', code);
    requestAnimationFrame(measureAll);
  }

  /* ── layout cache (read once, animate from scrollY) ────────── */
  const L = { vw: innerWidth, vh: innerHeight, docH: 1 };
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, left: r.left, w: r.width }; };
  const visible = (m, y, pad) => m && m.top < y + L.vh + (pad || 0) && m.top + m.h > y - (pad || 0);

  const nav = $('#nav'), bar = $('#progressBar'), themeMeta = $('meta[name="theme-color"]');
  const hero = $('.hero'), heroInner = $('.hero-inner'), heroMark = $('#heroMark'), joyLight = $('#joyLight');
  const bgEls = $$('[data-bg]').map(el => ({ el, m: null }));
  const chapters = $$('.chapter').map((el, i) => ({
    el, m: null, dir: i % 2 ? 1 : -1,
    word: $('.chapter-word', el), img: $('.lid img', el), lid: $('.lid', el),
  }));
  const parallax = $$('[data-parallax]').map(el => ({ el, f: parseFloat(el.dataset.parallax) || 0, m: null }));
  const ribbons = $$('.ribbon').map(el => ({ el, track: $('.ribbon-track', el), dir: parseFloat(el.dataset.speed) || 1, x: 0, unit: 0, m: null }));
  const manifesto = { el: $('#manifestoText'), words: [], on: -1, m: null };
  const footerMark = $('.footer-mark');
  let heroM = null, markM = null, footerM = null;

  function measureAll() {
    L.vw = innerWidth; L.vh = innerHeight;
    L.docH = document.documentElement.scrollHeight;
    bgEls.forEach(s => { s.m = box(s.el); });
    chapters.forEach(c => { c.m = box(c.el); });
    parallax.forEach(p => { p.m = box(p.el.parentElement); });
    ribbons.forEach(r => { r.m = box(r.el.parentElement); r.unit = r.track.scrollWidth / 8; });
    manifesto.m = box(manifesto.el);
    heroM = box(hero);
    markM = box(heroMark);
    footerM = footerMark ? box(footerMark) : null;
    flavour.m = box(flavour.section);
    flavour.r = flavour.spot.getBoundingClientRect().width * .165;
    table.m = box(table.stage);
    ringResize();
  }

  /* ── chameleon page colour + ambient theme ─────────────────── */
  let activeBg = null;
  function applyBg(el) {
    const bg = el.style.getPropertyValue('--bg').trim();
    document.body.style.backgroundColor = bg;
    if (themeMeta && el !== hero) themeMeta.setAttribute('content', bg);
    if (window.JoyFX) JoyFX.setTheme(el === flavour.section ? FLAVOURS[flavour.cur].fx : (el.dataset.fx || 'none'));
  }
  function updateChameleon(y) {
    const line = y + L.vh * .52;
    let cur = null;
    for (const s of bgEls) if (s.m && line >= s.m.top && line < s.m.top + s.m.h) cur = s;
    if (cur && cur !== activeBg) { activeBg = cur; applyBg(cur.el); }
  }

  /* ── ribbons ───────────────────────────────────────────────── */
  function buildRibbons() {
    const items = listOf('ribbon');
    const unit = items.map(s => `<span class="r-item">${esc(s)}</span><i class="r-star"></i>`).join('') +
      '<svg class="r-seal" aria-hidden="true"><use href="#seal"/></svg>';
    ribbons.forEach(r => { r.track.innerHTML = unit.repeat(8); r.unit = r.track.scrollWidth / 8; });
  }

  /* ── manifesto ─────────────────────────────────────────────── */
  function splitManifesto() {
    splitWords(manifesto.el, true);
    manifesto.words = $$('.mw', manifesto.el);
    manifesto.on = -1;
  }
  function updateManifesto(y) {
    const m = manifesto.m; if (!m) return;
    const top = m.top - y;
    const p = clamp((L.vh * .86 - top) / (m.h + L.vh * .3), 0, 1);
    const n = Math.round(p * manifesto.words.length);
    if (n !== manifesto.on) {
      manifesto.words.forEach((w, i) => w.classList.toggle('on', i < n));
      manifesto.on = n;
    }
  }

  /* ── hero: liquid + embossed wordmark ──────────────────────── */
  const liquidCanvas = $('#liquid');
  const liq = {
    gl: null, mx: L.vw * .5, my: L.vh * .45, tx: L.vw * .5, ty: L.vh * .45,
    px: L.vw * .5, py: L.vh * .45, stir: 0, flow: 0, lastMove: -1e9, light: { x: 320, y: -60 },
  };
  function initLiquid() {
    if (!window.JoyLiquid || !liquidCanvas) return;
    liq.gl = JoyLiquid.create(liquidCanvas, { mobile: !fine || small() });
    if (liq.gl) html.classList.add('has-liquid');
  }
  const DRIP_ZONE = 170;
  function renderLiquid(now, dt, y, dy) {
    if (!liq.gl || liq.gl.lost) return;
    const H = heroM ? heroM.h : L.vh;
    const idle = now - liq.lastMove > 2600;
    if (idle) {  // let it wander on its own (touch screens, idle mouse)
      liq.tx = L.vw * (.5 + .32 * Math.sin(now * .00023));
      liq.ty = H * (.5 + .22 * Math.sin(now * .00031 + 1.3));
    }
    const k = idle ? .02 : .085;
    const pmx = liq.mx, pmy = liq.my;
    liq.mx = ease(liq.mx, liq.tx, k); liq.my = ease(liq.my, liq.ty, k);
    const vx = liq.mx - pmx, vy = liq.my - pmy;
    const target = clamp((vx - vy * .4) / 22, -1.4, 1.4) + (idle ? .25 : 0);
    liq.stir = ease(liq.stir, target, .05);
    liq.flow += dy * .0012;
    const p = clamp(y / H, 0, 1);
    liq.gl.render({
      time: now / 1000,
      mouseX: liq.mx, mouseY: liq.my,
      stir: liq.stir,
      edge: DRIP_ZONE,
      drip: 58 + 125 * p + 10 * Math.sin(now * .0004),
      flow: liq.flow,
      lightX: -.55 + (liq.mx / L.vw) * 1.0,
      lightY: .85 - (liq.my / H) * .75,
      stageY: H * .47,
    }, dt);
  }
  function updateHero(now, y) {
    const H = heroM ? heroM.h : L.vh;
    const p = clamp(y / H, 0, 1);
    heroInner.style.transform = `translate3d(0, ${(y * .38).toFixed(1)}px, 0)`;
    heroInner.style.opacity = Math.max(0, 1 - p * 1.9).toFixed(3);
  }
  /* one specular light (inside #f-emboss) shines on whichever wordmark is on screen */
  function updateLight(now, y) {
    if (!joyLight) return;
    const onFooter = footerM && visible(footerM, y);
    const m = onFooter ? footerM : markM;
    if (!m || (!onFooter && heroM && y > heroM.h)) return;
    let lx, ly;
    if (fine && now - liq.lastMove < 2600) {
      lx = (liq.px - m.left) / m.w * 1000;
      ly = (liq.py - (m.top - y)) / m.h * 560 - 160;
    } else {
      lx = 500 + Math.cos(now * .00045) * 430;
      ly = -40 + Math.sin(now * .0006) * 90;
    }
    liq.light.x = ease(liq.light.x, lx, .08); liq.light.y = ease(liq.light.y, ly, .08);
    joyLight.setAttribute('x', liq.light.x.toFixed(1));
    joyLight.setAttribute('y', liq.light.y.toFixed(1));
  }
  function revealHero() {
    const line = $('.hero-line');
    if (line) { line.style.setProperty('--d', '1.05s'); line.classList.add('is-in'); }
  }

  /* ── chapters, parallax, ribbons per frame ─────────────────── */
  function updateChapters(y) {
    for (const c of chapters) {
      if (!visible(c.m, y, 80)) continue;
      const p = clamp((y + L.vh - c.m.top) / (L.vh + c.m.h), 0, 1);
      c.word.style.setProperty('--mx', `${((.5 - p) * c.dir * L.vw * .55).toFixed(1)}px`);
      if (c.img) {
        c.img.style.setProperty('--py', `${((p - .5) * -80).toFixed(1)}px`);
        c.img.style.setProperty('--ps', (1.16 - p * .1).toFixed(4));
      }
      if (!fine && c.lid) {  // on touch screens the light slides across the lid as you scroll
        c.lid.style.setProperty('--gx', `${(10 + p * 80).toFixed(1)}%`);
        c.lid.style.setProperty('--gy', `${(8 + p * 30).toFixed(1)}%`);
      }
    }
    for (const q of parallax) {
      if (!visible(q.m, y, 200)) continue;
      const off = (q.m.top + q.m.h / 2 - (y + L.vh / 2)) * q.f;
      q.el.style.translate = `0 ${off.toFixed(1)}px`;
    }
  }
  let scrollVel = 0;
  function updateRibbons(y, dt) {
    for (const r of ribbons) {
      if (!visible(r.m, y, 40) || !r.unit) continue;
      const speed = (38 + Math.abs(scrollVel) * 26) * (html.dir === 'rtl' ? -1 : 1);
      r.x = (r.x + r.dir * speed * dt / 1000) % r.unit;
      const x = r.x > 0 ? r.x - r.unit : r.x;
      r.track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    }
  }

  /* ── tilt, magnetic buttons, cursor ────────────────────────── */
  function bindTilt() {
    if (!fine || reduce) return;
    $$('[data-tilt], [data-tilt-soft]').forEach(el => {
      const soft = el.hasAttribute('data-tilt-soft');
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', `${((px - .5) * (soft ? 7 : 11)).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((.5 - py) * (soft ? 6 : 9)).toFixed(2)}deg`);
        el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
        el.style.setProperty('--go', '1');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--go', '.75');
      });
    });
  }
  function bindMagnetic() {
    if (!fine || reduce) return;
    document.addEventListener('pointermove', e => {
      const b = e.target.closest && e.target.closest('[data-magnetic]');
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.translate = `${((e.clientX - r.left - r.width / 2) * .22).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * .32).toFixed(1)}px`;
    });
    document.addEventListener('pointerout', e => {
      const b = e.target.closest && e.target.closest('[data-magnetic]');
      if (b && !b.contains(e.relatedTarget)) b.style.translate = '';
    });
  }
  const cursor = { el: $('.cursor'), dot: $('.cursor-dot'), ring: $('.cursor-ring'), label: $('#cursorLabel'), x: -100, y: -100, rx: -100, ry: -100 };
  function bindCursor() {
    if (!fine || reduce) return;
    html.classList.add('has-cursor');
    document.addEventListener('pointerover', e => {
      const tgt = e.target.closest && e.target.closest('[data-cursor]');
      if (tgt) { cursor.label.textContent = t('cursor.' + tgt.dataset.cursor); cursor.el.classList.add('is-label'); }
      else cursor.el.classList.remove('is-label');
    });
    document.addEventListener('pointerleave', () => { cursor.x = cursor.y = -100; });
  }
  function updateCursor() {
    if (!html.classList.contains('has-cursor')) return;
    cursor.rx = ease(cursor.rx, cursor.x, .2); cursor.ry = ease(cursor.ry, cursor.y, .2);
    cursor.dot.style.transform = `translate3d(${cursor.x}px,${cursor.y}px,0)`;
    cursor.ring.style.transform = `translate3d(${cursor.rx.toFixed(1)}px,${cursor.ry.toFixed(1)}px,0)`;
  }

  /* ── flavour spotlight ─────────────────────────────────────── */
  const FLAVOURS = {
    blueberry:  { x: 62,   y: 73, bg: '#1B1E3E', ink: '#F3F1FA', accent: '#A9B4FF', fx: 'blueberry' },
    mango:      { x: 43.5, y: 38, bg: '#FFE6BC', ink: '#4A2A05', accent: '#C2620A', fx: 'mango' },
    strawberry: { x: 79,   y: 42, bg: '#3A0A12', ink: '#FBEFF1', accent: '#FF8E9E', fx: 'strawberry' },
    lotus:      { x: 25.5, y: 71, bg: '#EBD6B8', ink: '#3B2410', accent: '#97541C', fx: 'lotus' },
    chocolate:  { x: 64.5, y: 15, bg: '#22110A', ink: '#F6EEE3', accent: '#E3A04F', fx: 'chocolate' },
  };
  const ORDER = Object.keys(FLAVOURS);
  const flavour = {
    section: $('#flavours'), spot: $('#spot'), cur: 'blueberry', user: false,
    fx: 62, fy: 73, r: 160, m: null,
  };
  function showFlavourText() {
    $('#flavourName').textContent = t(`fl.${flavour.cur}.name`);
    $('#flavourDesc').textContent = t(`fl.${flavour.cur}.desc`);
  }
  function setFlavour(name, byUser) {
    if (!FLAVOURS[name]) return;
    if (byUser) flavour.user = true;
    if (name === flavour.cur && !byUser) return;
    flavour.cur = name;
    const f = FLAVOURS[name], s = flavour.section;
    s.style.setProperty('--bg', f.bg); s.style.setProperty('--ink', f.ink); s.style.setProperty('--accent', f.accent);
    $$('#flavourTabs [role="tab"]').forEach(b => {
      const on = b.dataset.flavour === name;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    });
    const detail = $('.flavour-detail');
    detail.classList.remove('is-swap'); void detail.offsetWidth; detail.classList.add('is-swap');
    showFlavourText();
    $('#flavourAdd').dataset.add = 'cc-' + name;
    if (activeBg && activeBg.el === s) applyBg(s);
  }
  function bindFlavours() {
    const tabs = $('#flavourTabs');
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-flavour]'); if (b) setFlavour(b.dataset.flavour, true); });
    tabs.addEventListener('keydown', e => {
      const dirs = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in dirs)) return;
      e.preventDefault();
      let d = dirs[e.key]; if (html.dir === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) d = -d;
      const next = ORDER[(ORDER.indexOf(flavour.cur) + d + ORDER.length) % ORDER.length];
      setFlavour(next, true);
      $(`#flavourTabs [data-flavour="${next}"]`).focus();
    });
    $$('.spot-hit [data-hit]').forEach(b => b.addEventListener('click', () => setFlavour(b.dataset.hit, true)));
    setInterval(() => {
      if (flavour.user || reduce || document.hidden || !visible(flavour.m, scrollY)) return;
      setFlavour(ORDER[(ORDER.indexOf(flavour.cur) + 1) % ORDER.length]);
    }, 4200);
  }
  function updateFlavour(y) {
    if (!visible(flavour.m, y, 100)) return;
    const f = FLAVOURS[flavour.cur];
    flavour.fx = ease(flavour.fx, f.x, .075); flavour.fy = ease(flavour.fy, f.y, .075);
    const s = flavour.spot.style;
    s.setProperty('--fx', flavour.fx.toFixed(2) + '%');
    s.setProperty('--fy', flavour.fy.toFixed(2) + '%');
    s.setProperty('--fr', flavour.r.toFixed(1) + 'px');
    s.setProperty('--zs', (1.14 + Math.sin(performance.now() * .0006) * .015).toFixed(4));
  }

  /* ── the table: 3D ring ────────────────────────────────────── */
  const table = {
    stage: $('#ringStage'), ring: $('#ring'), cards: $$('.ring-card'),
    angle: 0, vel: 0, drag: false, lastX: 0, lastT: 0, moved: 0, down: null, target: null, m: null,
  };
  function ringResize() {
    const c = table.cards[0]; if (!c) return;
    const cw = c.offsetWidth || 260;
    table.ring.style.setProperty('--rz', `${Math.round(cw / 2 / Math.tan(Math.PI / 8) + cw * .2)}px`);
  }
  function bindTable() {
    table.cards.forEach((c, i) => {
      c.style.setProperty('--i', i);
      c.addEventListener('click', e => { if (e.detail === 0) openLightbox(c); });  // keyboard
      c.addEventListener('focus', () => {
        const want = -i * 45;
        table.target = table.angle + ((((want - table.angle) % 360) + 540) % 360 - 180);
      });
    });
    const st = table.stage;
    st.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      table.drag = true; table.moved = 0; table.lastX = e.clientX; table.lastT = performance.now();
      table.down = e.target.closest('.ring-card'); table.target = null; table.vel = 0;
      try { st.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      st.classList.add('is-drag');
    });
    st.addEventListener('pointermove', e => {
      if (!table.drag) return;
      const now = performance.now(), dx = e.clientX - table.lastX;
      table.lastX = e.clientX; table.moved += Math.abs(dx);
      const step = dx * (small() ? .4 : .26);
      table.angle += step;
      table.vel = step / Math.max(8, now - table.lastT) * 16;
      table.lastT = now;
    });
    const end = () => {
      if (!table.drag) return;
      table.drag = false; st.classList.remove('is-drag');
      if (table.moved < 8 && table.down) openLightbox(table.down);
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', () => { table.drag = false; st.classList.remove('is-drag'); });
  }
  function updateTable(y, dt, dy) {
    if (!visible(table.m, y, 120)) return;
    const f = dt / 16.7;
    if (!table.drag) {
      if (table.target != null) {
        table.angle = ease(table.angle, table.target, .12);
        if (Math.abs(table.angle - table.target) < .05) table.target = null;
      } else {
        table.angle += table.vel * f;
        table.vel *= Math.pow(.95, f);
        if (!reduce) table.angle -= (.07 * f + dy * .035);
      }
    }
    table.ring.style.setProperty('--ry', table.angle.toFixed(2) + 'deg');
    table.cards.forEach((c, i) => {
      const rel = ((i * 45 + table.angle) % 360 + 540) % 360 - 180;
      c.style.setProperty('--shade', Math.min(.7, Math.abs(rel) / 180 * .95).toFixed(3));
    });
  }

  /* ── lightbox ──────────────────────────────────────────────── */
  const dlg = $('#lightbox'), dlgImg = $('#lightboxImg');
  function openLightbox(card) {
    if (!dlg || typeof dlg.showModal !== 'function') return;
    dlgImg.src = card.dataset.full;
    dlgImg.alt = ($('img', card) || {}).alt || '';
    dlg.showModal();
  }
  function bindLightbox() {
    if (!dlg) return;
    $('#lightboxClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }

  /* ── the box (order) ───────────────────────────────────────── */
  const CATALOG = [
    { id: 'trilece', key: 'p.trilece', group: 'sig', img: 'assets/img/trilece-sm.webp' },
    { id: 'beirut', key: 'p.beirut', group: 'sig', img: 'assets/img/beirut-stack-sm.webp' },
    { id: 'balls', key: 'p.balls', group: 'sig', img: 'assets/img/choco-box-sm.webp' },
    { id: 'cc-blueberry', flavour: 'blueberry', group: 'cheese', crop: [62, 73] },
    { id: 'cc-mango', flavour: 'mango', group: 'cheese', crop: [43.5, 38] },
    { id: 'cc-strawberry', flavour: 'strawberry', group: 'cheese', crop: [79, 42] },
    { id: 'cc-lotus', flavour: 'lotus', group: 'cheese', crop: [25.5, 71] },
    { id: 'cc-chocolate', flavour: 'chocolate', group: 'cheese', crop: [64.5, 15] },
    { id: 'dates', key: 'p.dates', group: 'more', mono: 'D' },
    { id: 'basbousa', key: 'p.basbousa', group: 'more', mono: 'B' },
  ];
  const byId = id => CATALOG.find(i => i.id === id);
  const itemName = i => i.flavour ? `${t('p.cheese.name')} · ${t(`fl.${i.flavour}.name`)}` : t(`${i.key}.name`);
  let bag = {};
  try { bag = JSON.parse(local.get('joy-box') || '{}') || {}; } catch (e) { bag = {}; }
  Object.keys(bag).forEach(k => { if (!byId(k) || !(bag[k] > 0)) delete bag[k]; });

  function cropStyle(c) {
    const k = 2.85, ar = 900 / 1206;
    const bx = clamp((k * c[0] / 100 - .5) / (k - 1) * 100, 0, 100);
    const by = clamp((k * ar * c[1] / 100 - .5) / (k * ar - 1) * 100, 0, 100);
    return `background:url(assets/img/cheesecakes-sm.webp) ${bx.toFixed(1)}% ${by.toFixed(1)}%/${k * 100}% auto no-repeat`;
  }
  function thumb(i) {
    if (i.img) return `<img class="menu-thumb" src="${i.img}" alt="" width="62" height="62" loading="lazy" decoding="async">`;
    if (i.crop) return `<span class="menu-thumb" style="${cropStyle(i.crop)}"></span>`;
    return `<span class="menu-thumb is-mono" aria-hidden="true">${i.mono}</span>`;
  }
  function renderMenu() {
    const menu = $('#menu'); if (!menu) return;
    const groups = [['sig', 'or.g.sig'], ['cheese', 'or.g.cheese'], ['more', 'or.g.more']];
    menu.innerHTML = groups.map(([g, k]) => `<div class="menu-group"><h3>${esc(t(k))}</h3>` +
      CATALOG.filter(i => i.group === g).map(i => {
        const name = i.flavour ? t(`fl.${i.flavour}.name`) : t(`${i.key}.name`);
        const notes = i.flavour ? t(`fl.${i.flavour}.desc`) : listOf(`${i.key}.notes`).join(' · ');
        const q = bag[i.id] || 0, full = esc(itemName(i));
        return `<div class="menu-row" data-id="${i.id}">${thumb(i)}<div><p class="menu-name">${esc(name)}</p><p class="menu-notes">${esc(notes)}</p></div>` +
          `<div class="stepper"><button type="button" data-step="-1" aria-label="${esc(t('stepper.remove'))}: ${full}"${q ? '' : ' disabled'}><svg width="16" height="16" aria-hidden="true"><use href="#i-minus"/></svg></button>` +
          `<output aria-live="polite">${q}</output>` +
          `<button type="button" data-step="1" aria-label="${esc(t('stepper.add'))}: ${full}"><svg width="16" height="16" aria-hidden="true"><use href="#i-plus"/></svg></button></div></div>`;
      }).join('') + '</div>').join('');
  }
  function renderSummary() {
    const list = $('#summaryList'), ids = CATALOG.filter(i => bag[i.id]);
    list.innerHTML = ids.map(i => `<li><span>${esc(itemName(i))}</span><b>× ${bag[i.id]}</b></li>`).join('');
    $('#summaryEmpty').hidden = ids.length > 0;
    const n = Object.values(bag).reduce((a, b) => a + b, 0);
    $('#boxCount').textContent = n;
  }
  function setQty(id, q) {
    q = clamp(q | 0, 0, 99);
    if (q) bag[id] = q; else delete bag[id];
    local.set('joy-box', JSON.stringify(bag));
    const row = $(`.menu-row[data-id="${id}"]`);
    if (row) {
      const out = $('output', row);
      out.textContent = q; out.classList.remove('is-pop'); void out.offsetWidth; out.classList.add('is-pop');
      $('[data-step="-1"]', row).disabled = !q;
    }
    renderSummary();
  }
  const boxBtn = $('#boxBtn');
  function bump() { boxBtn.classList.remove('is-bump'); void boxBtn.offsetWidth; boxBtn.classList.add('is-bump'); }
  function fly(from, item) {
    if (reduce || !from) { bump(); return; }
    nav.classList.remove('is-hidden');
    const a = from.getBoundingClientRect(), b = boxBtn.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'flyer';
    if (item.img) el.style.background = `url(${item.img}) center/cover`;
    else if (item.crop) el.setAttribute('style', cropStyle(item.crop));
    else { el.className += ' menu-thumb is-mono'; el.textContent = item.mono; }
    document.body.appendChild(el);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const lift = Math.min(260, Math.abs(x1 - x0) * .35 + 120), frames = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      frames.push({
        transform: `translate(${(x0 + (x1 - x0) * k).toFixed(1)}px, ${(y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * lift).toFixed(1)}px) scale(${(1.25 - k * .85).toFixed(3)}) rotate(${(k * 300).toFixed(0)}deg)`,
        opacity: k > .92 ? (1 - k) * 12 : 1,
      });
    }
    const anim = el.animate(frames, { duration: 950, easing: 'cubic-bezier(.45,0,.25,1)' });
    anim.onfinish = () => { el.remove(); bump(); };
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }
  function addToBox(id, btn) {
    const item = byId(id); if (!item) return;
    setQty(id, (bag[id] || 0) + 1);
    const from = (btn.closest('.chapter') && $('.lid', btn.closest('.chapter'))) ||
                 (btn.closest('.flavours') && $('.spot-ring', btn.closest('.flavours'))) || btn;
    fly(from, item);
    toast(t('toast.added').replace('{name}', itemName(item)));
    const label = $('span', btn);
    btn.classList.remove('is-added'); void btn.offsetWidth; btn.classList.add('is-added');
    if (label) {
      label.textContent = t('added');
      clearTimeout(btn._t); btn._t = setTimeout(() => { label.textContent = t('add'); }, 1600);
    }
  }
  function compose() {
    const items = CATALOG.filter(i => bag[i.id]);
    if (!items.length) return null;
    const f = $('#orderForm');
    const lines = [t('msg.hello'), ''].concat(items.map(i => `• ${bag[i.id]} × ${itemName(i)}`), ['']);
    const name = f.name.value.trim(), date = f.date.value, notes = f.notes.value.trim();
    if (name) lines.push(`${t('msg.name')}: ${name}`);
    if (date) lines.push(`${t('msg.date')}: ${date}`);
    if (notes) lines.push(`${t('msg.notes')}: ${notes}`);
    return lines.join('\n').trim();
  }
  function needItems() {
    toast(t('box.needItems'));
    const m = $('#menu'); if (m) m.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  function bindBox() {
    document.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) { addToBox(add.dataset.add, add); return; }
      const step = e.target.closest('[data-step]');
      if (step) {
        const id = step.closest('.menu-row').dataset.id;
        const d = +step.dataset.step;
        setQty(id, (bag[id] || 0) + d);
        if (d > 0) bump();
      }
    });
    $('#sendMail').addEventListener('click', () => {
      const msg = compose(); if (!msg) return needItems();
      location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(t('msg.subject'))}&body=${encodeURIComponent(msg.replace(/\n/g, '\r\n'))}`;
    });
    if (CONTACT.whatsapp) {
      const wa = $('#sendWa'), fw = $('#footerWa');
      wa.hidden = false;
      wa.addEventListener('click', () => {
        const msg = compose(); if (!msg) return needItems();
        window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      });
      if (fw) { fw.hidden = false; fw.href = `https://wa.me/${CONTACT.whatsapp}`; fw.target = '_blank'; fw.rel = 'noopener'; }
    }
    $('#clearBox').addEventListener('click', () => {
      Object.keys(bag).forEach(k => delete bag[k]);
      local.set('joy-box', '{}');
      renderMenu(); renderSummary();
    });
  }

  /* ── nav: language, mobile sheet ───────────────────────────── */
  function bindNav() {
    const langEl = $('#lang'), langBtn = $('#langBtn');
    langBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = langEl.classList.toggle('is-open');
      langBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => { langEl.classList.remove('is-open'); langBtn.setAttribute('aria-expanded', 'false'); });
    $$('.lang-menu button').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));

    const sheet = $('#sheet'), menuBtn = $('#menuBtn');
    const setSheet = open => {
      menuBtn.setAttribute('aria-expanded', String(open));
      if (open) { sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('is-open')); nav.classList.add('is-solid'); }
      else { sheet.classList.remove('is-open'); setTimeout(() => { if (!sheet.classList.contains('is-open')) sheet.hidden = true; }, 900); }
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menuBtn.addEventListener('click', () => setSheet(menuBtn.getAttribute('aria-expanded') !== 'true'));
    $$('a', sheet).forEach(a => a.addEventListener('click', () => setSheet(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) setSheet(false); });
    nav._sheetOpen = () => sheet.classList.contains('is-open');
  }
  function updateNav(y, dy) {
    nav.classList.toggle('is-solid', y > 40 || (nav._sheetOpen && nav._sheetOpen()));
    if (nav._sheetOpen && nav._sheetOpen()) return;
    if (y > 520 && dy > 4) nav.classList.add('is-hidden');
    else if (dy < -4 || y < 300) nav.classList.remove('is-hidden');
  }

  /* ── reveals ───────────────────────────────────────────────── */
  function bindReveals() {
    const menu = $('#menu'); if (menu) menu.setAttribute('data-reveal', '');
    if (!('IntersectionObserver' in window)) { $$('[data-reveal],[data-split],.chapter').forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: .16, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal], [data-split], .chapter').forEach(el => { if (!el.closest('.hero')) io.observe(el); });
  }

  /* ── intro: band, seal, lid lifts ──────────────────────────── */
  function intro(done) {
    const pre = $('#preloader');
    const finish = () => { html.classList.add('is-ready'); revealHero(); done && done(); };
    if (!pre || reduce) { if (pre) pre.classList.add('is-done'); finish(); return; }
    const quick = !!session.get('joy-intro');
    html.classList.add('is-loading');
    const count = $('#preCount'), t0 = performance.now(), minT = quick ? 650 : 2000;
    let ready = false, shown = 0;
    const fontLoads = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('400 120px "Great Vibes"'), document.fonts.load('400 60px Fraunces'), document.fonts.load('italic 400 60px Fraunces')]).catch(() => {})
      : Promise.resolve();
    Promise.race([fontLoads, new Promise(r => setTimeout(r, 3500))]).then(() => { ready = true; });
    requestAnimationFrame(() => pre.classList.add('is-band'));
    setTimeout(() => pre.classList.add('is-seal'), quick ? 120 : 620);
    (function tick() {
      const el = performance.now() - t0;
      // time-based so a slow first frame never stalls the counter
      const k = Math.min(1, el / minT), eased = 1 - Math.pow(1 - k, 3);
      shown = ready ? Math.max(shown, eased * 100) : Math.min(90, eased * 100);
      count.textContent = Math.round(shown);
      if (ready && el >= minT) {
        count.textContent = '100';
        pre.classList.add('is-open');
        html.classList.remove('is-loading');
        session.set('joy-intro', '1');
        setTimeout(finish, 280);
        setTimeout(() => pre.classList.add('is-done'), 1500);
        return;
      }
      requestAnimationFrame(tick);
    })();
  }

  /* ── main loop ─────────────────────────────────────────────── */
  let lastT = performance.now(), lastY = scrollY;
  function frame(now) {
    const dt = Math.min(64, now - lastT); lastT = now;
    const y = scrollY, dy = y - lastY; lastY = y;
    FR = dt / 16.7;
    scrollVel = ease(scrollVel, dy, .15);

    updateNav(y, dy);
    bar.style.transform = `scaleX(${clamp(y / Math.max(1, L.docH - L.vh), 0, 1).toFixed(4)})`;
    updateChameleon(y);
    if (heroM && y < heroM.h + DRIP_ZONE + 40) {
      updateHero(now, y);
      if (!reduce) renderLiquid(now, dt, y, dy);
    }
    if (visible(manifesto.m, y)) updateManifesto(y);
    updateRibbons(y, dt);
    updateChapters(y);
    updateFlavour(y);
    updateTable(y, dt, dy);
    updateCursor();
    if (!reduce) updateLight(now, y);
    if (window.JoyFX && !reduce) JoyFX.tick(dt, dy);
    requestAnimationFrame(frame);
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function boot() {
    let saved = local.get('joy-lang');
    const nav2 = (navigator.language || 'en').slice(0, 2).toLowerCase();
    applyLang(saved || (I18N[nav2] ? nav2 : 'en'));

    initLiquid();
    if (window.JoyFX && !reduce) JoyFX.init($('#fxBack'), $('#fxFront'));
    bindNav(); bindTilt(); bindMagnetic(); bindCursor(); bindFlavours(); bindTable(); bindLightbox(); bindBox(); bindReveals();
    setFlavour('blueberry');

    document.addEventListener('pointermove', e => {
      cursor.x = e.clientX; cursor.y = e.clientY;
      liq.px = e.clientX; liq.py = e.clientY;
      liq.tx = e.clientX; liq.ty = e.clientY + scrollY;
      liq.lastMove = performance.now();
      if (window.JoyFX) { JoyFX.mouse.x = e.clientX; JoyFX.mouse.y = e.clientY; }
    }, { passive: true });

    let rz;
    const onResize = () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        if (liq.gl) liq.gl.resize();
        if (window.JoyFX) JoyFX.resize();
        measureAll();
        if (reduce) renderLiquid(performance.now(), 0, scrollY, 0);
      }, 120);
    };
    addEventListener('resize', onResize);
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.body);
    addEventListener('load', measureAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);

    measureAll();
    if (CONTACT.whatsapp) $('#sendWa').hidden = false;

    intro();
    if (reduce) { renderLiquid(performance.now(), 0, scrollY, 0); }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
