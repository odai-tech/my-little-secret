/* Joy — orchestration: intro, i18n, scroll choreography, chameleon page colour,
   the opening window, flavour spotlight, 3D table, delivery rules and the order box.
   Performance rules: read layout once (cached), write only transforms/opacity,
   skip any update whose input did not change, cap WebGL at ~60fps. */
(function () {
  'use strict';

  /* ── contact & ordering rules ──────────────────────────────── */
  const CONTACT = {
    email: 'mylittlesecret782@gmail.com',
    // TODO: WhatsApp number in international format, digits only (e.g. '972501234567').
    // Leave empty to hide the WhatsApp buttons and order by email only.
    whatsapp: '',
  };
  const ORDER_DAYS = 2;   // orders need at least this many days' notice

  /* ── helpers ───────────────────────────────────────────────── */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let FR = 1;  // frame-time factor, 1 at 60fps
  const ease = (a, b, k) => a + (b - a) * (1 - Math.pow(1 - k, FR));
  const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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
    renderCalendar();
    setDateLimits();
    table.front = -1;
    $('#langCurrent').textContent = code.toUpperCase();
    $$('.lang-menu button').forEach(b => b.setAttribute('aria-current', String(b.dataset.lang === code)));
    local.set('joy-lang', code);
    requestAnimationFrame(measureAll);
  }

  /* ── dates: the 2-day rule, shown live ─────────────────────── */
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const fmt = (d, o) => { try { return new Intl.DateTimeFormat(lang, o).format(d); } catch (e) { return d.toDateString(); } };
  const earliestLabel = () => fmt(addDays(ORDER_DAYS), { weekday: 'long', day: 'numeric', month: 'long' });
  function renderCalendar() {
    const cal = $('#cal'); if (!cal) return;
    cal.innerHTML = [0, 1, 2, 3, 4].map(i => {
      const d = addDays(i);
      const cls = i < ORDER_DAYS ? 'is-past' : (i === ORDER_DAYS ? 'is-first' : '');
      const tag = i === 0 ? t('bn.days.today') : (i === ORDER_DAYS ? t('bn.days.first') : '');
      return `<li class="${cls}"><small>${esc(fmt(d, { weekday: 'short' }))}</small><b>${esc(fmt(d, { day: 'numeric' }))}</b><em>${esc(tag)}</em></li>`;
    }).join('');
    $('#earliestLine').innerHTML = esc(t('bn.days.earliest')).replace(/&lt;b&gt;\{date\}&lt;\/b&gt;|\{date\}/, `<b>${esc(earliestLabel())}</b>`);
  }
  function setDateLimits() {
    const inp = $('#fDate'); if (!inp) return;
    inp.min = ymd(addDays(ORDER_DAYS));
    $('#dateHint').textContent = t('box.earliest').replace('{date}', earliestLabel());
  }

  /* ── layout cache (read once, animate from scrollY) ────────── */
  const L = { vw: innerWidth, vh: innerHeight, docH: 1, dirty: true };
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, left: r.left, w: r.width }; };
  const visible = (m, y, pad) => m && m.top < y + L.vh + (pad || 0) && m.top + m.h > y - (pad || 0);

  const nav = $('#nav'), bar = $('#progressBar'), themeMeta = $('meta[name="theme-color"]');
  const hero = $('.hero'), heroInner = $('#heroInner');
  const bgEls = $$('[data-bg]').map(el => ({ el, m: null }));
  const chapters = $$('.chapter').map(el => ({ el, m: null, img: $('.lid img', el), lid: $('.lid', el), v: NaN }));
  const parallax = $$('[data-parallax]').map(el => ({ el, f: parseFloat(el.dataset.parallax) || 0, m: null, v: NaN }));
  const ribbons = $$('.ribbon').map(el => ({ el, track: $('.ribbon-track', el), dir: parseFloat(el.dataset.speed) || 1, x: 0, unit: 0, m: null }));
  const manifesto = { el: $('#manifestoText'), words: [], on: -1, m: null };
  const opening = { el: $('#collection'), head: $('#openingHead'), frame: $('#openingFrame'), cap: $('#openingCaption'), m: null, p: -1 };
  const glints = [
    { grad: $('#glintHero'), mark: $('.mark-hero'), m: null, x: 300, y: 160 },
    { grad: $('#glintFoot'), mark: $('.mark-foot'), m: null, x: 300, y: 160 },
  ].filter(g => g.grad && g.mark);
  let heroM = null;

  function measureAll() {
    L.vw = innerWidth; L.vh = innerHeight;
    L.docH = document.documentElement.scrollHeight;
    bgEls.forEach(s => { s.m = box(s.el); });
    chapters.forEach(c => { c.m = box(c.el); c.v = NaN; });
    parallax.forEach(p => { p.m = box(p.el.parentElement); p.v = NaN; });
    ribbons.forEach(r => { r.m = box(r.el.parentElement); r.unit = r.track.scrollWidth / 8; });
    manifesto.m = box(manifesto.el);
    opening.m = box(opening.el); opening.p = -1;
    glints.forEach(g => { g.m = box(g.mark); });
    heroM = box(hero);
    flavour.m = box(flavour.section);
    flavour.r = flavour.spot.getBoundingClientRect().width * .165;
    flavour.dirty = true;
    table.m = box(table.stage);
    ringResize();
    L.dirty = true;
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
  let scrollVel = 0;
  function updateRibbons(y, dt) {
    if (reduce) return;
    for (const r of ribbons) {
      if (!visible(r.m, y, 40) || !r.unit) continue;
      const speed = (38 + Math.min(40, Math.abs(scrollVel)) * 22) * (html.dir === 'rtl' ? -1 : 1);
      r.x = (r.x + r.dir * speed * dt / 1000) % r.unit;
      const x = r.x > 0 ? r.x - r.unit : r.x;
      r.track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    }
  }

  /* ── manifesto ─────────────────────────────────────────────── */
  function splitManifesto() {
    splitWords(manifesto.el, true);
    manifesto.words = $$('.mw', manifesto.el);
    manifesto.on = -1;
  }
  function updateManifesto(y) {
    const m = manifesto.m; if (!m || !visible(m, y)) return;
    const p = clamp((L.vh * .86 - (m.top - y)) / (m.h + L.vh * .3), 0, 1);
    const n = Math.round(p * manifesto.words.length);
    if (n !== manifesto.on) {
      manifesto.words.forEach((w, i) => w.classList.toggle('on', i < n));
      manifesto.on = n;
    }
  }

  /* ── hero: liquid, wordmark glint, exit ────────────────────── */
  const liquidCanvas = $('#liquid');
  const liq = { gl: null, mx: L.vw * .5, my: L.vh * .45, tx: L.vw * .5, ty: L.vh * .45, px: L.vw * .5, py: L.vh * .45, stir: 0, flow: 0, lastMove: -1e9, last: 0 };
  let introAt = 0;
  function initLiquid() {
    if (!window.JoyLiquid || !liquidCanvas) return;
    liq.gl = JoyLiquid.create(liquidCanvas, { mobile: !fine || small() });
    if (liq.gl) html.classList.add('has-liquid');
  }
  const DRIP_ZONE = 170;
  function renderLiquid(now, y, dy, force) {
    if (!liq.gl || liq.gl.lost) return;
    // ~60fps cap: 120Hz screens would otherwise double the GPU work for no visible gain
    if (!force && now - liq.last < 13.5) return;
    const ldt = now - liq.last; liq.last = now;
    const H = heroM ? heroM.h : L.vh;
    const idle = now - liq.lastMove > 2600;
    if (idle) {  // let it wander on its own (touch screens, idle mouse)
      liq.tx = L.vw * (.5 + .32 * Math.sin(now * .00023));
      liq.ty = H * (.5 + .22 * Math.sin(now * .00031 + 1.3));
    }
    const k = idle ? .02 : .085;
    const pmx = liq.mx, pmy = liq.my;
    liq.mx = ease(liq.mx, liq.tx, k); liq.my = ease(liq.my, liq.ty, k);
    const target = clamp(((liq.mx - pmx) - (liq.my - pmy) * .4) / 22, -1.4, 1.4) + (idle ? .25 : 0);
    liq.stir = ease(liq.stir, target, .05);
    liq.flow += dy * .0012;
    const p = clamp(y / H, 0, 1);
    const grow = introAt ? 1 - Math.pow(1 - clamp((now - introAt) / 2800, 0, 1), 3) : 0;  // drips pour in after the intro
    liq.gl.render({
      time: now / 1000, mouseX: liq.mx, mouseY: liq.my, stir: liq.stir, edge: DRIP_ZONE,
      drip: (58 + 125 * p + 10 * Math.sin(now * .0004)) * (.12 + .88 * (reduce ? 1 : grow)),
      flow: liq.flow,
      lightX: -.55 + (liq.mx / L.vw), lightY: .85 - (liq.my / H) * .75,
      stageY: H * .47,
    }, ldt > 100 ? 0 : ldt);
  }
  let heroV = NaN;
  function updateHero(y) {
    const H = heroM ? heroM.h : L.vh;
    const v = Math.round(clamp(y, 0, H) * 2) / 2;
    if (v === heroV) return;
    heroV = v;
    heroInner.style.transform = `translate3d(0, ${(v * .38).toFixed(1)}px, 0) scale(${(1 - clamp(v / H, 0, 1) * .06).toFixed(4)})`;
    heroInner.style.opacity = Math.max(0, 1 - (v / H) * 1.9).toFixed(3);
  }
  function revealHero() {
    const line = $('.hero-line');
    if (line) { line.style.setProperty('--d', '1.05s'); line.classList.add('is-in'); }
  }
  /* the glint is a filter-free gradient on its own layer; the embossed gold below never repaints */
  let glintLast = 0;
  function updateGlint(now, y) {
    if (now - glintLast < 32) return;  // 30fps is plenty for a slow sheen
    glintLast = now;
    for (const g of glints) {
      if (!g.m || !visible(g.m, y)) continue;
      let tx, ty;
      if (fine && now - liq.lastMove < 2600) {
        tx = (liq.px - g.m.left) / g.m.w * 1000;
        ty = (liq.py - (g.m.top - y)) / g.m.h * 560;
      } else {
        tx = 520 + Math.cos(now * .00042) * 380;
        ty = 230 + Math.sin(now * .00057) * 110;
      }
      FR = 2;
      const nx = ease(g.x, tx, .08), ny = ease(g.y, ty, .08);
      if (Math.abs(nx - g.x) + Math.abs(ny - g.y) > .5) {
        g.x = nx; g.y = ny;
        g.grad.setAttribute('cx', nx.toFixed(1)); g.grad.setAttribute('cy', ny.toFixed(1));
      }
    }
  }

  /* ── opening: the window opens onto the table as you scroll ─ */
  function updateOpening(y) {
    const m = opening.m; if (!m || reduce || !visible(m, y, 60)) return;
    const p = clamp((y - m.top) / Math.max(1, m.h - L.vh), 0, 1);
    if (Math.abs(p - opening.p) < .0004) return;
    opening.p = p;
    const e = easeInOut(clamp(p / .62, 0, 1));
    const s0 = small() ? .64 : .5, ty0 = L.vh * (small() ? .17 : .15);
    opening.frame.style.transform = `translate3d(0, ${(ty0 * (1 - e)).toFixed(1)}px, 0) scale(${(s0 + (1 - s0) * e).toFixed(4)})`;
    const hp = clamp(p / .34, 0, 1);
    opening.head.style.opacity = (1 - hp).toFixed(3);
    opening.head.style.transform = `translate3d(0, ${(-hp * 70).toFixed(1)}px, 0) scale(${(1 - hp * .06).toFixed(4)})`;
    const cp = clamp((p - .58) / .22, 0, 1);
    opening.cap.style.opacity = cp.toFixed(3);
    opening.cap.firstElementChild.style.transform = `translate3d(0, ${((1 - cp) * 40).toFixed(1)}px, 0)`;
  }

  /* ── chapters + parallax ───────────────────────────────────── */
  function updateChapters(y) {
    for (const c of chapters) {
      if (!c.img || !visible(c.m, y, 80)) continue;
      const p = clamp((y + L.vh - c.m.top) / (L.vh + c.m.h), 0, 1);
      const v = Math.round((p - .5) * -60 * 2) / 2;
      if (v !== c.v) { c.v = v; c.img.style.transform = `translate3d(0, ${v}px, 0) scale(1.04)`; }
    }
    for (const q of parallax) {
      if (!visible(q.m, y, 200)) continue;
      const v = Math.round((q.m.top + q.m.h / 2 - (y + L.vh / 2)) * q.f);
      if (v !== q.v) { q.v = v; q.el.style.translate = `0 ${v}px`; }
    }
  }

  /* ── tilt + magnetic buttons (mouse only) ──────────────────── */
  function bindPointerFx() {
    if (!fine || reduce) return;
    $$('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', `${((px - .5) * 9).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((.5 - py) * 7).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); });
    });
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

  /* ── flavour spotlight ─────────────────────────────────────── */
  const FLAVOURS = {
    blueberry:  { x: 62,   y: 73, bg: '#E9EBF7', ink: '#23264D', accent: '#4A50A8', fx: 'blueberry' },
    mango:      { x: 43.5, y: 38, bg: '#FFF1D9', ink: '#4A2A05', accent: '#B85A06', fx: 'mango' },
    strawberry: { x: 79,   y: 42, bg: '#FBE8EA', ink: '#4A1119', accent: '#B81530', fx: 'strawberry' },
    lotus:      { x: 25.5, y: 71, bg: '#F3E6D2', ink: '#3B2410', accent: '#93531C', fx: 'lotus' },
    chocolate:  { x: 64.5, y: 15, bg: '#EFE3D6', ink: '#3A2216', accent: '#85552F', fx: 'chocolate' },
  };
  const ORDER = Object.keys(FLAVOURS);
  const flavour = { section: $('#flavours'), spot: $('#spot'), cur: 'blueberry', user: false, fx: 62, fy: 73, r: 160, m: null, dirty: true };
  function showFlavourText() {
    $('#flavourName').textContent = t(`fl.${flavour.cur}.name`);
    $('#flavourDesc').textContent = t(`fl.${flavour.cur}.desc`);
  }
  function setFlavour(name, byUser) {
    if (!FLAVOURS[name]) return;
    if (byUser) flavour.user = true;
    if (name === flavour.cur && !byUser) return;
    flavour.cur = name; flavour.dirty = true;
    const f = FLAVOURS[name], s = flavour.section;
    s.style.setProperty('--bg', f.bg); s.style.setProperty('--ink', f.ink); s.style.setProperty('--accent', f.accent);
    $$('#flavourTabs [role="tab"]').forEach(b => {
      const on = b.dataset.flavour === name;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      if (on && small()) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    });
    const detail = $('.flavour-detail');
    detail.classList.remove('is-swap'); void detail.offsetWidth; detail.classList.add('is-swap');
    showFlavourText();
    $('#flavourAdd').dataset.add = 'cc-' + name;
    if (activeBg && activeBg.el === s) applyBg(s);
  }
  const stepFlavour = d => setFlavour(ORDER[(ORDER.indexOf(flavour.cur) + d + ORDER.length) % ORDER.length], true);
  function bindFlavours() {
    const tabs = $('#flavourTabs');
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-flavour]'); if (b) setFlavour(b.dataset.flavour, true); });
    tabs.addEventListener('keydown', e => {
      const dirs = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in dirs)) return;
      e.preventDefault();
      let d = dirs[e.key]; if (html.dir === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) d = -d;
      stepFlavour(d);
      $(`#flavourTabs [data-flavour="${flavour.cur}"]`).focus();
    });
    let swipedAt = 0;
    $$('.spot-hit [data-hit]').forEach(b => b.addEventListener('click', () => {
      if (performance.now() - swipedAt > 400) setFlavour(b.dataset.hit, true);
    }));
    // swipe across the photo to change flavour on touch screens
    let sx = null;
    flavour.spot.addEventListener('pointerdown', e => { sx = e.clientX; });
    flavour.spot.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 44) { swipedAt = performance.now(); stepFlavour((dx < 0 ? 1 : -1) * (html.dir === 'rtl' ? -1 : 1)); }
    });
    setInterval(() => {
      if (flavour.user || reduce || document.hidden || !visible(flavour.m, scrollY)) return;
      setFlavour(ORDER[(ORDER.indexOf(flavour.cur) + 1) % ORDER.length]);
    }, 4200);
  }
  function updateFlavour(y) {
    if (!visible(flavour.m, y, 100)) return;
    const f = FLAVOURS[flavour.cur];
    const moving = Math.abs(flavour.fx - f.x) + Math.abs(flavour.fy - f.y) > .02;
    if (!moving && !flavour.dirty) return;
    flavour.dirty = false;
    flavour.fx = moving ? ease(flavour.fx, f.x, .085) : f.x;
    flavour.fy = moving ? ease(flavour.fy, f.y, .085) : f.y;
    const s = flavour.spot.style;
    s.setProperty('--fx', flavour.fx.toFixed(2) + '%');
    s.setProperty('--fy', flavour.fy.toFixed(2) + '%');
    s.setProperty('--fr', flavour.r.toFixed(1) + 'px');
  }

  /* ── the table: 3D ring that snaps card to card ────────────── */
  const table = {
    stage: $('#ringStage'), ring: $('#ring'), cards: $$('.ring-card'), shades: $$('.ring-shade'),
    angle: 0, target: 0, vel: 0, drag: false, lastX: 0, lastT: 0, moved: 0, down: null,
    idleAt: 0, front: -1, rz: 400, applied: NaN, op: [], m: null,
  };
  const nearestDetent = a => Math.round(a / 45) * 45;
  function ringResize() {
    const c = table.cards[0]; if (!c) return;
    const cw = c.offsetWidth || 260;
    table.rz = Math.round(cw / 2 / Math.tan(Math.PI / 8) + cw * .2);
    table.ring.style.setProperty('--rz', `${table.rz}px`);
    table.applied = NaN;
  }
  function ringStep(d) { table.target = nearestDetent(table.target == null ? table.angle : table.target) - d * 45; table.idleAt = performance.now(); }
  function updateRingCaption() {
    const n = table.cards.length;
    const i = ((Math.round(-table.angle / 45) % n) + n) % n;
    if (i === table.front) return;
    const first = table.front === -1;
    table.front = i;
    const cap = $('#ringCaption'), name = table.cards[i].dataset.name.split('|').map(t).join(' · ');
    if (first || reduce) { cap.textContent = name; return; }
    cap.classList.add('is-swap');
    clearTimeout(cap._t); cap._t = setTimeout(() => { cap.textContent = name; cap.classList.remove('is-swap'); }, 180);
  }
  function bindTable() {
    table.cards.forEach((c, i) => {
      c.style.setProperty('--i', i);
      c.addEventListener('click', e => { if (e.detail === 0) openLightbox(c); });  // keyboard
      c.addEventListener('focus', () => {
        const want = -i * 45;
        table.target = table.angle + ((((want - table.angle) % 360) + 540) % 360 - 180);
        table.idleAt = performance.now();
      });
    });
    $('#ringPrev').addEventListener('click', () => ringStep(-1));
    $('#ringNext').addEventListener('click', () => ringStep(1));
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
      const step = dx * (small() ? .42 : .28);
      table.angle += step;
      table.vel = step / Math.max(8, now - table.lastT) * 16;
      table.lastT = now;
    });
    const end = () => {
      if (!table.drag) return;
      table.drag = false; st.classList.remove('is-drag');
      table.idleAt = performance.now();
      if (table.moved < 8 && table.down) { table.target = nearestDetent(table.angle); openLightbox(table.down); return; }
      table.target = nearestDetent(table.angle + clamp(table.vel, -18, 18) * 9);  // fling, then settle on a card
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
  }
  function updateTable(y, now) {
    if (!visible(table.m, y, 120)) { table.seen = false; return; }
    if (!table.seen) { table.seen = true; table.idleAt = now; }  // give people a moment before it starts turning
    if (!table.drag) {
      if (!reduce && now - table.idleAt > 3800 && !document.hidden) ringStep(1);  // gentle auto-advance
      if (table.target != null) {
        table.angle = ease(table.angle, table.target, .1);
        if (Math.abs(table.angle - table.target) < .02) table.angle = table.target;
      }
    }
    if (table.angle === table.applied) return;
    table.applied = table.angle;
    table.ring.style.transform = `translateZ(${-table.rz}px) rotateX(-7deg) rotateY(${table.angle.toFixed(2)}deg)`;
    table.cards.forEach((c, i) => {
      const rel = ((i * 45 + table.angle) % 360 + 540) % 360 - 180;
      const o = Math.round(Math.min(.7, Math.abs(rel) / 180 * .95) * 100) / 100;
      if (o !== table.op[i]) { table.op[i] = o; table.shades[i].style.opacity = o; }
    });
    updateRingCaption();
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
    $('#boxCount').textContent = Object.values(bag).reduce((a, b) => a + b, 0);
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
    const anim = el.animate(frames, { duration: 900, easing: 'cubic-bezier(.45,0,.25,1)' });
    anim.onfinish = () => { el.remove(); bump(); };
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-on'), 2800);
  }
  function addToBox(id, btn) {
    const item = byId(id); if (!item) return;
    setQty(id, (bag[id] || 0) + 1);
    const from = (btn.closest('.chapter') && $('.lid', btn.closest('.chapter'))) ||
                 (btn.closest('.flavours') && $('.spot-ring', btn.closest('.flavours'))) || btn;
    fly(from, item);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not allowed */ } }
    toast(t('toast.added').replace('{name}', itemName(item)));
    const label = $('span', btn), icon = $('use', btn);
    btn.classList.remove('is-added'); void btn.offsetWidth; btn.classList.add('is-added');
    if (icon) icon.setAttribute('href', '#i-check');
    if (label) label.textContent = t('added');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { if (label) label.textContent = t('add'); if (icon) icon.setAttribute('href', '#i-plus'); }, 1700);
  }

  /* order form: delivery in the Haifa area, pickup elsewhere, 2 days' notice */
  const form = $('#orderForm');
  const method = () => (form.querySelector('input[name="method"]:checked') || {}).value || 'delivery';
  function syncMethod() {
    const pickup = method() === 'pickup';
    $('#addressField').hidden = pickup;
    $('#pickupNote').hidden = !pickup;
  }
  function dateTooSoon(v) { return v && v < ymd(addDays(ORDER_DAYS)); }
  function compose() {
    const items = CATALOG.filter(i => bag[i.id]);
    const m = method();
    const lines = [t('msg.hello'), ''].concat(items.map(i => `• ${bag[i.id]} × ${itemName(i)}`), ['']);
    lines.push(`${t('msg.method')}: ${t(m === 'pickup' ? 'msg.pickup' : 'msg.delivery')}`);
    const addr = $('#fAddress').value.trim(), name = $('#fName').value.trim(), date = $('#fDate').value, notes = $('#fNotes').value.trim();
    if (m === 'delivery' && addr) lines.push(`${t('msg.address')}: ${addr}`);
    if (name) lines.push(`${t('msg.name')}: ${name}`);
    if (date) lines.push(`${t('msg.date')}: ${fmt(new Date(date + 'T12:00:00'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
    if (notes) lines.push(`${t('msg.notes')}: ${notes}`);
    return lines.join('\n').trim();
  }
  function validate() {
    if (!CATALOG.some(i => bag[i.id])) {
      toast(t('box.needItems'));
      const m = $('#menu'); if (m) m.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return false;
    }
    if (method() === 'delivery' && !$('#fAddress').value.trim()) { toast(t('box.needAddress')); $('#fAddress').focus(); return false; }
    if (dateTooSoon($('#fDate').value)) { toast(t('box.tooSoon')); $('#fDate').focus(); return false; }
    return true;
  }
  function bindBox() {
    document.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) { addToBox(add.dataset.add, add); return; }
      const step = e.target.closest('[data-step]');
      if (step) {
        const id = step.closest('.menu-row').dataset.id, d = +step.dataset.step;
        setQty(id, (bag[id] || 0) + d);
        if (d > 0) bump();
      }
    });
    // remember the customer's details on this device
    let saved = {};
    try { saved = JSON.parse(local.get('joy-form') || '{}') || {}; } catch (e) { saved = {}; }
    if (saved.method === 'pickup') $('#mPickup').checked = true;
    if (saved.address) $('#fAddress').value = saved.address;
    if (saved.name) $('#fName').value = saved.name;
    syncMethod();
    form.addEventListener('input', () => {
      local.set('joy-form', JSON.stringify({ method: method(), address: $('#fAddress').value, name: $('#fName').value }));
    });
    form.addEventListener('change', e => {
      if (e.target.name === 'method') syncMethod();
      if (e.target.id === 'fDate' && dateTooSoon(e.target.value)) { toast(t('box.tooSoon')); e.target.value = ''; }
    });
    form.addEventListener('submit', e => e.preventDefault());
    $('#sendMail').addEventListener('click', () => {
      if (!validate()) return;
      location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(t('msg.subject'))}&body=${encodeURIComponent(compose().replace(/\n/g, '\r\n'))}`;
    });
    if (CONTACT.whatsapp) {
      const wa = $('#sendWa'), fw = $('#footerWa');
      wa.hidden = false;
      wa.addEventListener('click', () => {
        if (!validate()) return;
        window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(compose())}`, '_blank', 'noopener');
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
      else { sheet.classList.remove('is-open'); setTimeout(() => { if (!sheet.classList.contains('is-open')) sheet.hidden = true; }, 850); }
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menuBtn.addEventListener('click', () => setSheet(menuBtn.getAttribute('aria-expanded') !== 'true'));
    $$('a', sheet).forEach(a => a.addEventListener('click', () => setSheet(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) setSheet(false); });
    nav._sheetOpen = () => sheet.classList.contains('is-open');
  }
  function updateNav(y, dy) {
    const open = nav._sheetOpen && nav._sheetOpen();
    nav.classList.toggle('is-solid', y > 40 || open);
    if (open) return;
    if (y > 520 && dy > 4) nav.classList.add('is-hidden');
    else if (dy < -4 || y < 300) nav.classList.remove('is-hidden');
  }

  /* ── reveals ───────────────────────────────────────────────── */
  function bindReveals() {
    const menu = $('#menu'); if (menu) menu.setAttribute('data-reveal', '');
    if (!('IntersectionObserver' in window)) { $$('[data-reveal],[data-split],.chapter').forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: .14, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal], [data-split], .chapter').forEach(el => { if (!el.closest('.hero')) io.observe(el); });
  }

  /* ── intro: band, seal, lid lifts (first visit of the session only) ── */
  function intro() {
    const pre = $('#preloader');
    const finish = () => { html.classList.add('is-ready'); introAt = performance.now(); revealHero(); };
    if (!pre || reduce || session.get('joy-intro')) { if (pre) pre.classList.add('is-done'); finish(); return; }
    html.classList.add('is-loading');
    const t0 = performance.now();
    let ready = false;
    const fontLoads = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('400 120px "Great Vibes"'), document.fonts.load('400 60px Fraunces'), document.fonts.load('italic 400 60px Fraunces')]).catch(() => {})
      : Promise.resolve();
    Promise.race([fontLoads, new Promise(r => setTimeout(r, 2200))]).then(() => { ready = true; });
    requestAnimationFrame(() => pre.classList.add('is-band'));
    setTimeout(() => pre.classList.add('is-seal'), 360);
    (function tryOpen() {
      if (!ready || performance.now() - t0 < 1250) { setTimeout(tryOpen, 50); return; }
      pre.classList.add('is-open');
      html.classList.remove('is-loading');
      session.set('joy-intro', '1');
      setTimeout(finish, 200);
      setTimeout(() => pre.classList.add('is-done'), 1250);
    })();
  }

  /* ── main loop: only what changed, only what's on screen ───── */
  let lastT = performance.now(), lastY = -1;
  function frame(now) {
    const dt = Math.min(64, now - lastT); lastT = now; FR = dt / 16.7;
    const y = scrollY, dy = lastY < 0 ? 0 : y - lastY, moved = y !== lastY || L.dirty;
    lastY = y;
    scrollVel = ease(scrollVel, dy, .15);
    if (moved) {
      updateNav(y, dy);
      bar.style.transform = `scaleX(${clamp(y / Math.max(1, L.docH - L.vh), 0, 1).toFixed(4)})`;
      updateChameleon(y);
      updateManifesto(y);
      updateOpening(y);
      updateChapters(y);
      L.dirty = false;
    }
    const inHero = heroM && y < heroM.h + DRIP_ZONE + 40;
    if (inHero) {
      updateHero(y);
      if (!reduce) renderLiquid(now, y, dy);
    }
    updateRibbons(y, dt);
    updateFlavour(y);
    updateTable(y, now);
    if (!reduce) updateGlint(now, y);
    FR = dt / 16.7;
    if (window.JoyFX && !reduce) JoyFX.tick(dt, dy, heroM && y < heroM.h * .7);
    requestAnimationFrame(frame);
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function boot() {
    const saved = local.get('joy-lang');
    const nav2 = (navigator.language || 'en').slice(0, 2).toLowerCase();
    applyLang(saved || (I18N[nav2] ? nav2 : 'en'));

    if (reduce) opening.el.classList.add('is-static');
    initLiquid();
    if (window.JoyFX && !reduce) JoyFX.init($('#fx'));
    bindNav(); bindPointerFx(); bindFlavours(); bindTable(); bindLightbox(); bindBox(); bindReveals();
    setFlavour('blueberry');

    document.addEventListener('pointermove', e => {
      liq.px = e.clientX; liq.py = e.clientY;
      liq.tx = e.clientX; liq.ty = e.clientY + scrollY;
      if (e.pointerType === 'mouse') liq.lastMove = performance.now();
      if (window.JoyFX) { JoyFX.mouse.x = e.clientX; JoyFX.mouse.y = e.clientY; }
    }, { passive: true });

    let rz, lastW = innerWidth;
    const onResize = () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        // phones fire resize when the URL bar slides; only rebuild the canvases on real size changes
        if (innerWidth !== lastW || !small()) {
          lastW = innerWidth;
          if (liq.gl) liq.gl.resize();
          if (window.JoyFX) JoyFX.resize();
        }
        measureAll();
        if (reduce) renderLiquid(performance.now(), scrollY, 0, true);
      }, 140);
    };
    addEventListener('resize', onResize);
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.body);
    addEventListener('load', measureAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
    // a new day moves the earliest delivery date
    setInterval(() => { renderCalendar(); setDateLimits(); }, 60 * 60 * 1000);

    measureAll();
    intro();
    if (reduce) renderLiquid(performance.now(), scrollY, 0, true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
