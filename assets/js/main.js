/* Joy — orchestration: intro, i18n, scroll choreography, chameleon page colour,
   the dealt card deck, flavour spotlight, 3D table, delivery rules and the one-sheet checkout.
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
  const plural = (base, n) => {
    let cat = 'other';
    try { cat = new Intl.PluralRules(lang).select(n); } catch (e) { /* old browser */ }
    const d = I18N[lang] || I18N.en;
    return String(d[`${base}.${cat}`] || d[`${base}.other`] || I18N.en[`${base}.other`]).replace('{n}', n);
  };
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
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$('[data-notes]').forEach(ul => { ul.innerHTML = listOf(ul.dataset.notes).map(n => `<li>${esc(n)}</li>`).join(''); });
    $$('[data-split]').forEach(el => splitWords(el));
    splitManifesto();
    buildRibbons();
    renderSizePicks();
    renderMenu();
    renderSummary();
    renderReviews();
    showFlavourText();
    renderCalendar();
    setDateLimits();
    renderDays();
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
    $('#dateHint').textContent = t('box.earliest').replace('{date}', fmt(addDays(ORDER_DAYS), { weekday: 'long', day: 'numeric', month: 'long' }));
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
  const deck = { el: $('#collection'), list: $('#deckCards'), cards: $$('.dcard').map(el => ({ el, dx: 0, dy: 0, fr: 0, fy: 0 })), m: null, lm: null, p: -1, pinned: true };
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
    measureDeck();
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
  /* the dessert plates drift with the cursor and lift away as you scroll, nearer plates more */
  const plates = $$('.plate').map(el => ({ el, d: parseFloat(el.dataset.depth) || .5, v: '' }));
  function updatePlates(y) {
    const nx = liq.mx / L.vw - .5, ny = (liq.my - y) / L.vh - .5;
    for (const p of plates) {
      const v = `${(-nx * 36 * p.d).toFixed(1)}px ${(-ny * 28 * p.d - y * (.18 + .5 * p.d)).toFixed(1)}px`;
      if (v !== p.v) { p.v = v; p.el.style.translate = v; }
    }
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

  /* ── collection: four Joy cards, stacked face-down like boxes on the
     counter, deal themselves out and flip over as you scroll ───── */
  const STACK = [[-5, -7, -6], [4, -3, 4], [-3, 3, -2], [5, 6, 5]];  // x, y, rotation of each card in the pile
  function measureDeck() {
    if (!deck.el) return;
    deck.m = box(deck.el);
    deck.lm = box(deck.list);
    deck.pinned = !small();
    const n = deck.cards.length, mid = (n - 1) / 2;
    const pos = deck.cards.map(c => ({ x: c.el.offsetLeft + c.el.offsetWidth / 2, y: c.el.offsetTop + c.el.offsetHeight / 2 }));
    const tx = deck.list.clientWidth / 2, ty = Math.min.apply(null, pos.map(q => q.y));
    deck.cards.forEach((c, i) => {
      c.dx = tx - pos[i].x; c.dy = ty - pos[i].y;
      c.fr = (deck.pinned ? (i - mid) * 2.6 : (i % 2 ? 1.4 : -1.4)) * (html.dir === 'rtl' ? -1 : 1);   // the fan they land in
      c.fy = deck.pinned ? Math.abs(i - mid) * 14 : 0;
      c.el.style.setProperty('--r', `${c.fr}deg`);
    });
    deck.p = -1;
  }
  function updateDeck(y) {
    const m = deck.m; if (!m || reduce || !visible(m, y, 200)) return;
    const p = deck.pinned
      ? clamp((y - m.top) / Math.max(1, m.h - L.vh), 0, 1)
      : clamp((L.vh * .85 - (deck.lm.top - y)) / (L.vh * .7), 0, 1);
    if (Math.abs(p - deck.p) < .0005) return;
    deck.p = p;
    deck.cards.forEach((c, i) => {
      const k = clamp((p - .06 - i * .1) / .4, 0, 1);
      const e = easeInOut(k), f = easeInOut(clamp((k - .08) / .7, 0, 1)), j = STACK[i % 4];
      const x = (c.dx + j[0]) * (1 - e), yy = (c.dy + j[1]) * (1 - e) + c.fy * e - Math.sin(k * Math.PI) * 26;
      const r = j[2] * (1 - e) + c.fr * e;
      c.el.style.transform = `translate3d(${x.toFixed(1)}px, ${yy.toFixed(1)}px, 0) rotate(${r.toFixed(2)}deg) perspective(1300px) rotateY(${(180 * (1 - f)).toFixed(1)}deg)`;
      c.el.classList.toggle('is-up', f > .5);
    });
    deck.el.classList.toggle('is-dealt', p > .78);
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
    blueberry:  { x: 62,   y: 73, bg: '#E7E7FF', ink: '#23245A', accent: '#4C4FD6', fx: 'blueberry' },
    mango:      { x: 43.5, y: 38, bg: '#FFEFD2', ink: '#4A2A05', accent: '#B35C00', fx: 'mango' },
    strawberry: { x: 79,   y: 42, bg: '#FFE3E8', ink: '#4A1119', accent: '#DF1F3E', fx: 'strawberry' },
    lotus:      { x: 25.5, y: 71, bg: '#FBEBD6', ink: '#3B2410', accent: '#A65A16', fx: 'lotus' },
    chocolate:  { x: 64.5, y: 15, bg: '#F3E5DA', ink: '#3A2216', accent: '#8A4A24', fx: 'chocolate' },
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
      table.down = e.target.closest('.ring-card'); table.target = null; table.free = null; table.vel = 0;
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

    // a mouse turns the table just by gliding across it; a trackpad by swiping sideways
    let hx = null, settle = 0;
    const glide = deg => {
      table.free = (table.free == null ? (table.target == null ? table.angle : table.target) : table.free) + deg;
      table.target = table.free; table.idleAt = performance.now();
      clearTimeout(settle);
      settle = setTimeout(() => { if (table.free != null) table.target = nearestDetent(table.free); table.free = null; }, 260);
    };
    st.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || table.drag) return;
      if (hx != null) { const dx = e.clientX - hx; if (dx) glide(dx * .15); }
      hx = e.clientX;
    });
    st.addEventListener('pointerleave', () => {
      hx = null; clearTimeout(settle);
      if (!table.drag && table.free != null) { table.target = nearestDetent(table.free); table.free = null; }
    });
    st.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;  // vertical scrolling keeps scrolling the page
      e.preventDefault();
      glide(-e.deltaX * (e.deltaMode === 1 ? 6 : .22));
    }, { passive: false });
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

  /* ── lightbox: the full photo, with the dessert one tap from the box ── */
  const dlg = $('#lightbox'), dlgImg = $('#lightboxImg');
  function openLightbox(card) {
    if (!dlg || typeof dlg.showModal !== 'function') return;
    dlgImg.src = card.dataset.full;
    dlgImg.alt = ($('img', card) || {}).alt || '';
    $('#lightboxName').textContent = card.dataset.name.split('|').map(t).join(' · ');
    const item = card.dataset.item, add = $('#lightboxAdd');
    add.hidden = !item; $('#lightboxPick').hidden = !!item; $('.lightbox-bar .size-pick').hidden = !item;
    if (item) { add.dataset.add = item; resetAdd(add); }
    dlg.showModal();
  }
  function bindLightbox() {
    if (!dlg) return;
    $('#lightboxClose').addEventListener('click', () => dlg.close());
    $('#lightboxPick').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }

  /* ── the box ───────────────────────────────────────────────── */
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
  /* every dessert comes in two sizes; prices in shekels */
  const SIZES = { s: { key: 'size.s', price: 100 }, l: { key: 'size.l', price: 200 } };
  const DEFAULT_SIZE = 'l';
  const FAVOURITES = ['trilece', 'beirut', 'balls', 'cc-lotus'];
  const byId = id => CATALOG.find(i => i.id === id);
  const itemName = i => i.flavour ? `${t('p.cheese.name')} · ${t(`fl.${i.flavour}.name`)}` : t(`${i.key}.name`);
  const itemNotes = i => i.flavour ? t(`fl.${i.flavour}.desc`) : listOf(`${i.key}.notes`).join(' · ');
  const sizeName = sz => t(SIZES[sz].key);
  const lineKey = (id, sz) => `${id}|${sz}`;
  const money = n => { try { return new Intl.NumberFormat(lang, { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n); } catch (e) { return `₪${n}`; } };
  let bag = {};
  try { bag = JSON.parse(local.get('joy-box') || '{}') || {}; } catch (e) { bag = {}; }
  Object.keys(bag).forEach(k => {   // boxes saved before sizes existed: those were the big size
    if (!k.includes('|') && byId(k) && bag[k] > 0) { const nk = lineKey(k, DEFAULT_SIZE); bag[nk] = (bag[nk] || 0) + bag[k]; }
    const [id, sz] = k.split('|');
    if (!byId(id) || !SIZES[sz] || !(bag[k] > 0)) delete bag[k];
  });
  const boxLines = () => CATALOG.flatMap(i => Object.keys(SIZES).filter(sz => bag[lineKey(i.id, sz)]).map(sz => {
    const key = lineKey(i.id, sz);
    return { key, item: i, size: sz, q: bag[key], price: SIZES[sz].price };
  }));
  const total = () => Object.values(bag).reduce((a, b) => a + b, 0);
  const totalPrice = () => boxLines().reduce((a, l) => a + l.q * l.price, 0);

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
  function stepper(key, label) {
    const q = bag[key] || 0, full = esc(label);
    return `<div class="stepper"><button type="button" data-step="-1" aria-label="${esc(t('stepper.remove'))}: ${full}"${q ? '' : ' disabled'}><svg width="16" height="16" aria-hidden="true"><use href="#i-minus"/></svg></button>` +
      `<output aria-live="polite">${q}</output>` +
      `<button type="button" data-step="1" aria-label="${esc(t('stepper.add'))}: ${full}"><svg width="16" height="16" aria-hidden="true"><use href="#i-plus"/></svg></button></div>`;
  }
  function renderMenu() {
    const menu = $('#menu'); if (!menu) return;
    const groups = [['sig', 'or.g.sig'], ['cheese', 'or.g.cheese'], ['more', 'or.g.more']];
    menu.innerHTML = groups.map(([g, k]) => `<div class="menu-group"><h3>${esc(t(k))}</h3>` +
      CATALOG.filter(i => i.group === g).map(i => {
        const name = i.flavour ? t(`fl.${i.flavour}.name`) : t(`${i.key}.name`);
        const sizes = Object.keys(SIZES).map(sz => `<div class="size-line" data-id="${lineKey(i.id, sz)}"><span class="size-name">${esc(sizeName(sz))} <b>${SIZES[sz].price}</b></span>${stepper(lineKey(i.id, sz), `${itemName(i)} (${sizeName(sz)})`)}</div>`).join('');
        return `<div class="menu-row" data-item="${i.id}">${thumb(i)}<div class="menu-info"><p class="menu-name">${esc(name)}</p><p class="menu-notes">${esc(itemNotes(i))}</p></div><div class="menu-sizes">${sizes}</div></div>`;
      }).join('') + '</div>').join('');
  }
  function renderSummary() {
    const ls = boxLines(), n = total();
    $('#summaryList').innerHTML = ls.map(l => `<li><span>${esc(itemName(l.item))} <small>${esc(sizeName(l.size))}</small></span><b>${l.q} × ${l.price}</b></li>`).join('') +
      (ls.length ? `<li class="summary-total"><span>${esc(t('box.total'))}</span><b>${esc(money(totalPrice()))}</b></li>` : '');
    $('#summaryEmpty').hidden = ls.length > 0;
    $('#boxCount').textContent = n;
    boxBtn.classList.toggle('is-empty', !n);   // red only when something is in the box
    $('#cartBarCount').textContent = n;
    $('#cartBarTotal').textContent = n ? money(totalPrice()) : '';
    renderCart();
    updateCartBar();
  }
  function setQty(key, q) {
    q = clamp(q | 0, 0, 99);
    if (q) bag[key] = q; else delete bag[key];
    local.set('joy-box', JSON.stringify(bag));
    $$(`.size-line[data-id="${key}"]`).forEach(row => {
      $('output', row).textContent = q;
      $('[data-step="-1"]', row).disabled = !q;
    });
    renderSummary();
    $$(`[data-id="${key}"] output`).forEach(out => { out.classList.remove('is-pop'); void out.offsetWidth; out.classList.add('is-pop'); });
  }
  const boxBtn = $('#boxBtn');
  function bump() { [boxBtn, cartBar].forEach(b => { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); }); }
  function fly(from, item) {
    if (reduce || !from || (cart && cart.open) || (dlg && dlg.open)) { bump(); return; }
    nav.classList.remove('is-hidden');
    const target = cartBar.classList.contains('is-on') ? $('.cartbar-count') : boxBtn;
    const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
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
  function resetAdd(btn) {
    clearTimeout(btn._t);
    const label = $('[data-i18n="add"]', btn), icon = $('use', btn);
    if (label) label.textContent = t('add');
    if (icon) icon.setAttribute('href', '#i-plus');
  }
  /* the size chosen next to an add button (the big size when there's no picker) */
  function chosenSize(btn) {
    const scope = btn.closest('.chapter-copy, .flavour-detail, .lightbox-bar');
    const on = scope && $('.size-pick [aria-pressed="true"]', scope);
    return on ? on.dataset.size : DEFAULT_SIZE;
  }
  function renderSizePicks() {
    $$('[data-size-pick]').forEach(el => {
      const cur = el.dataset.cur || DEFAULT_SIZE;
      el.setAttribute('role', 'group'); el.setAttribute('aria-label', t('size.label'));
      el.innerHTML = Object.keys(SIZES).map(sz => `<button type="button" data-size="${sz}" aria-pressed="${sz === cur}">${esc(sizeName(sz))} <b>${SIZES[sz].price}</b></button>`).join('');
    });
    $$('[data-price-from]').forEach(el => { el.textContent = t('price.from').replace('{p}', money(SIZES.s.price)); });
    $$('[data-price-note]').forEach(el => { el.textContent = Object.keys(SIZES).map(sz => `${sizeName(sz)} ${money(SIZES[sz].price)}`).join(' · '); });
  }
  function addToBox(id, btn) {
    const item = byId(id); if (!item) return;
    const size = chosenSize(btn), key = lineKey(id, size);
    setQty(key, (bag[key] || 0) + 1);
    const from = (btn.closest('.chapter') && $('.lid', btn.closest('.chapter'))) ||
                 (btn.closest('.flavours') && $('.spot-ring', btn.closest('.flavours'))) || btn;
    fly(from, item);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not allowed */ } }
    toast(t('toast.added').replace('{name}', `${itemName(item)} (${sizeName(size)})`));
    const label = $('[data-i18n="add"]', btn), icon = $('use', btn);
    if (!label) return;
    btn.classList.remove('is-added'); void btn.offsetWidth; btn.classList.add('is-added');
    if (icon) icon.setAttribute('href', '#i-check');
    label.textContent = t('added');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => resetAdd(btn), 1700);
  }

  /* ── reviews ── Demo entries (demo: true) are examples for previewing the design: they
     only appear in previews or with ?demo in the address, always tagged "Example", and
     never on the live site. A real review needs no translation, for example:
     { name: 'Noa S.', area: 'Carmel Center', item: 'trilece', stars: 5, text: '…' } */
  const REVIEWS = ['trilece', 'beirut', 'cc-lotus', 'balls', 'cc-mango', 'cc-strawberry']
    .map((item, i) => ({ n: i + 1, item, stars: 5, demo: true }));
  const SHOW_DEMO = window.JOY_PREVIEW === true || /[?&]demo\b/.test(location.search);
  function renderReviews() {
    const sec = $('#reviews'); if (!sec) return;
    const list = REVIEWS.filter(r => !r.demo || SHOW_DEMO);
    sec.hidden = !list.length;
    if (!list.length) return;
    const field = (r, f) => r.n ? t(`rv.${r.n}.${f}`) : r[f];
    $('#reviewsDemo').hidden = !list.some(r => r.demo);
    $('#reviewsTrack').innerHTML = list.map(r => {
      const i = byId(r.item);
      return `<figure class="review">${r.demo ? `<span class="review-tag">${esc(t('rv.tag'))}</span>` : ''}` +
        `<div class="review-stars" role="img" aria-label="${esc(t('rv.stars').replace('{n}', r.stars))}">${'★'.repeat(r.stars)}</div>` +
        `<blockquote>${esc(field(r, 'text'))}</blockquote>` +
        `<figcaption>${i ? thumb(i) : ''}<span><b>${esc(field(r, 'name'))}</b><small>${esc(field(r, 'area'))}${i ? ` · ${esc(itemName(i))}` : ''}</small></span></figcaption></figure>`;
    }).join('');
  }

  /* ── checkout: one sheet with the box, delivery or pickup, the day and who it's for ── */
  const cart = $('#cart'), cartBar = $('#cartBar'), form = $('#orderForm');
  const method = () => (form.querySelector('input[name="method"]:checked') || {}).value || 'delivery';
  let otherDay = false, summaryOnScreen = false, pastHero = false;

  function renderCart() {
    const list = $('#cartItems'); if (!list) return;
    const ls = boxLines();
    const f = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#cartItems [data-step]') : null;
    const keep = f ? [f.closest('[data-id]').dataset.id, f.dataset.step] : null;
    list.innerHTML = ls.map(l => `<li class="cart-item" data-id="${l.key}">${thumb(l.item)}<div class="cart-item-t"><p class="cart-name">${esc(itemName(l.item))}</p><p class="cart-meta">${esc(sizeName(l.size))} · ${esc(money(l.price))}</p></div>${stepper(l.key, `${itemName(l.item)} (${sizeName(l.size)})`)}</li>`).join('') +
      (ls.length ? `<li class="cart-total"><span>${esc(t('box.total'))}</span><b>${esc(money(totalPrice()))}</b></li>` : '');
    if (keep) {
      const again = $(`#cartItems [data-id="${keep[0]}"] [data-step="${keep[1]}"]`);
      (again && !again.disabled ? again : $('#cartItems [data-step="1"]') || $('#cartMore')).focus();
    }
    $('#cartEmpty').hidden = ls.length > 0;
    $('#cartMore').hidden = !ls.length;
    $('#cartCount').textContent = ls.length ? plural('box.n', total()) : '';
    $('#cartQuick').innerHTML = FAVOURITES.map(id => {
      const i = byId(id);
      return `<button type="button" class="quick" data-add="${id}">${thumb(i)}<span>${esc(itemName(i))}<small>${esc(sizeName(DEFAULT_SIZE))} · ${esc(money(SIZES[DEFAULT_SIZE].price))}</small></span><svg width="16" height="16" aria-hidden="true"><use href="#i-plus"/></svg></button>`;
    }).join('');
    if (ls.length) setErr('errItems', '');
  }
  function renderDays() {
    const wrap = $('#days'); if (!wrap) return;
    const cur = $('#fDate').value;
    let chips = '', hit = false;
    for (let n = ORDER_DAYS; n < ORDER_DAYS + 7; n++) {
      const d = addDays(n), v = ymd(d), on = !otherDay && v === cur;
      if (on) hit = true;
      chips += `<button type="button" class="day" data-day="${v}" aria-pressed="${on}"><small>${esc(fmt(d, { weekday: 'short' }))}</small><b>${esc(fmt(d, { day: 'numeric' }))}</b><em>${esc(n === ORDER_DAYS ? t('bn.days.first') : fmt(d, { month: 'short' }))}</em></button>`;
    }
    if (cur && !hit) otherDay = true;
    chips += `<button type="button" class="day day-other" data-day="other" aria-pressed="${otherDay}"><svg width="18" height="18" aria-hidden="true"><use href="#i-plus"/></svg><b>${esc(t('box.other'))}</b></button>`;
    wrap.innerHTML = chips;
    $('#otherField').hidden = !otherDay;
  }
  function pickDay(v) {
    const inp = $('#fDate');
    if (v === 'other') {
      if (!otherDay) inp.value = '';
      otherDay = true; renderDays();
      inp.focus();
      if (typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch (e) { /* needs a user gesture */ } }
    } else {
      otherDay = false; inp.value = v; renderDays();
      const b = $(`#days [data-day="${v}"]`); if (b) b.focus();
    }
    setErr('errDate', '');
  }
  function setErr(id, msg) {
    const e = $('#' + id); if (!e) return;
    e.textContent = msg || '';
    const f = e.closest('.field, .cart-step'); if (f) f.classList.toggle('is-bad', !!msg);
  }
  function syncMethod() {
    const pickup = method() === 'pickup';
    $('#addressField').hidden = pickup;
    $('#pickupNote').hidden = !pickup;
    if (pickup) setErr('errAddress', '');
  }
  function dateTooSoon(v) { return v && v < ymd(addDays(ORDER_DAYS)); }
  function compose() {
    const ls = boxLines(), m = method();
    const lines = [t('msg.hello'), ''].concat(ls.map(l => `• ${l.q} × ${itemName(l.item)} (${sizeName(l.size)}) · ${money(l.q * l.price)}`), [`${t('msg.total')}: ${money(totalPrice())}`, '']);
    lines.push(`${t('msg.method')}: ${t(m === 'pickup' ? 'msg.pickup' : 'msg.delivery')}`);
    const v = id => $(id).value.trim();
    const date = $('#fDate').value;
    if (m === 'delivery' && v('#fAddress')) lines.push(`${t('msg.address')}: ${v('#fAddress')}`);
    if (date) lines.push(`${t('msg.date')}: ${fmt(new Date(date + 'T12:00:00'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
    if (v('#fName')) lines.push(`${t('msg.name')}: ${v('#fName')}`);
    if (v('#fPhone')) lines.push(`${t('msg.phone')}: ${v('#fPhone')}`);
    if (v('#fNotes')) lines.push(`${t('msg.notes')}: ${v('#fNotes')}`);
    return lines.join('\n').trim();
  }
  function validate() {
    let first = null;
    const check = (id, msg, el) => { setErr(id, msg); if (msg && !first) first = el; };
    check('errItems', boxLines().length ? '' : t('box.needItems'), $('#cartQuick .quick'));
    check('errAddress', method() === 'delivery' && !$('#fAddress').value.trim() ? t('box.needAddress') : '', $('#fAddress'));
    const dv = $('#fDate').value;
    check('errDate', !dv ? t('box.needDate') : (dateTooSoon(dv) ? t('box.tooSoon') : ''), otherDay ? $('#fDate') : $('#days .day'));
    check('errName', $('#fName').value.trim() ? '' : t('box.needName'), $('#fName'));
    if (!first) return true;
    first.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    first.focus({ preventScroll: true });
    return false;
  }
  function sent(kind) {
    $('#cartSentT').textContent = t(kind === 'wa' ? 'box.sent.wa' : 'box.sent.mail');
    $('.cart-sent-d').hidden = kind === 'wa';
    $('#cartSent').hidden = false;
  }
  function openCart() {
    if (!cart || typeof cart.showModal !== 'function') { location.hash = '#order'; return; }
    if (cart.open) return;
    renderCart(); renderDays();
    $('#cartSent').hidden = true;
    cart.showModal();
    html.classList.add('cart-open');
    requestAnimationFrame(() => requestAnimationFrame(() => cart.classList.add('is-open')));
    updateCartBar();
  }
  function closeCart() {
    if (!cart || !cart.open) return;
    cart.classList.remove('is-open');
    html.classList.remove('cart-open');
    setTimeout(() => { if (!cart.classList.contains('is-open') && cart.open) { cart.close(); updateCartBar(); } }, reduce ? 0 : 460);
  }
  function updateCartBar() {
    if (!cartBar) return;
    const on = total() > 0 && pastHero && !summaryOnScreen && !(cart && cart.open);
    if (on === cartBar._on) return;
    cartBar._on = on;
    cartBar.classList.toggle('is-on', on);
    if (on) cartBar.removeAttribute('inert'); else cartBar.setAttribute('inert', '');
    html.classList.toggle('has-cartbar', on);
  }
  function bindBox() {
    document.addEventListener('click', e => {
      const pick = e.target.closest('[data-size-pick] [data-size]');
      if (pick) {
        const group = pick.parentElement; group.dataset.cur = pick.dataset.size;
        $$('[data-size]', group).forEach(b => b.setAttribute('aria-pressed', String(b === pick)));
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) { if (add.dataset.add) addToBox(add.dataset.add, add); return; }
      const step = e.target.closest('[data-step]');
      if (step) {
        const id = step.closest('[data-id]').dataset.id, d = +step.dataset.step;
        setQty(id, (bag[id] || 0) + d);
        if (d > 0) bump();
        return;
      }
      const open = e.target.closest('[data-open-cart]');
      if (open) { e.preventDefault(); openCart(); }
    });
    $('#cartClose').addEventListener('click', closeCart);
    cart.addEventListener('cancel', e => { e.preventDefault(); closeCart(); });
    cart.addEventListener('click', e => { if (e.target === cart) closeCart(); });
    cart.addEventListener('close', () => { cart.classList.remove('is-open'); html.classList.remove('cart-open'); updateCartBar(); });
    $('#cartMore').addEventListener('click', () => {
      closeCart();
      setTimeout(() => { const m = $('#menu'); if (m) m.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }, reduce ? 0 : 300);
    });
    $('#days').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) pickDay(b.dataset.day); });

    // remember the customer's details on this device
    let saved = {};
    try { saved = JSON.parse(local.get('joy-form') || '{}') || {}; } catch (e) { saved = {}; }
    if (saved.method === 'pickup') $('#mPickup').checked = true;
    ['address', 'name', 'phone'].forEach(k => { const el = $('#f' + k[0].toUpperCase() + k.slice(1)); if (saved[k] && el) el.value = saved[k]; });
    syncMethod();
    form.addEventListener('input', e => {
      local.set('joy-form', JSON.stringify({ method: method(), address: $('#fAddress').value, name: $('#fName').value, phone: $('#fPhone').value }));
      const err = { fAddress: 'errAddress', fName: 'errName', fDate: 'errDate' }[e.target.id];
      if (err && e.target.value.trim()) setErr(err, '');
    });
    form.addEventListener('change', e => {
      if (e.target.name === 'method') syncMethod();
      if (e.target.id === 'fDate') {
        if (dateTooSoon(e.target.value)) { setErr('errDate', t('box.tooSoon')); e.target.value = ''; }
        else if (e.target.value) setErr('errDate', '');
        renderDays();
      }
    });
    form.addEventListener('submit', e => e.preventDefault());
    $('#sendMail').addEventListener('click', () => {
      if (!validate()) return;
      location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(t('msg.subject'))}&body=${encodeURIComponent(compose().replace(/\n/g, '\r\n'))}`;
      sent('mail');
    });
    $('#cartCopy').addEventListener('click', () => {
      const btn = $('#cartCopy'), done = () => { btn.textContent = t('box.copied'); setTimeout(() => { btn.textContent = t('box.copy'); }, 2000); };
      try { navigator.clipboard.writeText(compose()).then(done, () => {}); } catch (e) { /* no clipboard */ }
    });
    if (CONTACT.whatsapp) {
      const wa = $('#sendWa'), fw = $('#footerWa');
      wa.hidden = false;
      wa.addEventListener('click', () => {
        if (!validate()) return;
        window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(compose())}`, '_blank', 'noopener');
        sent('wa');
      });
      if (fw) { fw.hidden = false; fw.href = `https://wa.me/${CONTACT.whatsapp}`; fw.target = '_blank'; fw.rel = 'noopener'; }
    }
    $('#clearBox').addEventListener('click', () => {
      Object.keys(bag).forEach(k => delete bag[k]);
      local.set('joy-box', '{}');
      renderMenu(); renderSummary();
    });
    // the floating box steps aside while the summary card is on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { summaryOnScreen = es[0].isIntersecting; updateCartBar(); }, { threshold: .25 }).observe($('#summary'));
    }
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
      updateDeck(y);
      const ph = heroM && y > heroM.h * .55;
      if (ph !== pastHero) { pastHero = ph; updateCartBar(); }
      updateChapters(y);
      L.dirty = false;
    }
    const inHero = heroM && y < heroM.h + DRIP_ZONE + 40;
    if (inHero) {
      updateHero(y);
      if (!reduce) { renderLiquid(now, y, dy); updatePlates(y); }
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
    const hint = $('#tableHint'); if (hint && fine) hint.dataset.i18n = 'tb.hint.mouse';
    const saved = local.get('joy-lang');
    const nav2 = (navigator.language || 'en').slice(0, 2).toLowerCase();
    applyLang(saved || (I18N[nav2] ? nav2 : 'en'));

    if (reduce) deck.el.classList.add('is-static');
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
    setInterval(() => { renderCalendar(); setDateLimits(); renderDays(); }, 60 * 60 * 1000);

    measureAll();
    intro();
    if (reduce) renderLiquid(performance.now(), scrollY, 0, true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
