// The blog, as a note on an iPhone in the Notes app. Each post is a note; the folder lists them by date the way the app
// does (Today, Yesterday, Previous 7 Days, …), relative to the reader's own clock.
// Posts are the <article data-post> elements in /blog/index.html (id = slug, data-date = YYYY-MM-DD, optional
// data-time = HH:MM, an <h1> title, then paragraphs). readPosts() parses them; mountNotes() builds the phone.
// On a phone-sized screen there is no phone drawn around it: the page is the app.

const I = {
  back: '<path d="M14.5 4.5 7 12l7.5 7.5" stroke-width="2.4"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  share: '<path d="M12 3.5v11.5"/><path d="m8 7.3 4-3.8 4 3.8"/><path d="M8.5 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.5"/>',
  checklist: '<path d="m3.5 6.8 1.6 1.6 3-3.2"/><path d="m3.5 16.8 1.6 1.6 3-3.2"/><path d="M11.5 7h9M11.5 17h9"/>',
  clip: '<path d="m15.5 8.2-6.3 6.4a1.9 1.9 0 0 0 2.7 2.7l6.8-6.9a3.8 3.8 0 0 0-5.4-5.3l-7 7a5.7 5.7 0 0 0 8 8l5.2-5.2"/>',
  markup: '<circle cx="12" cy="12" r="9"/><path d="m8.8 16.6 1.5-5.2L12 6.6l1.7 4.8 1.5 5.2"/><path d="M10.3 11.4h3.4"/>',
  compose: '<path d="M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5"/><path d="M17.3 3.7a1.9 1.9 0 0 1 2.7 2.7l-7.9 7.9-3.5.8.8-3.5z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.2 15.2 4.6 4.6"/>',
  mic: '<rect x="9.2" y="3" width="5.6" height="10.5" rx="2.8" fill="currentColor" stroke="none"/><path d="M5.8 11a6.2 6.2 0 0 0 12.4 0M12 17.2V21"/>',
  link: '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.1 1.1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.1-1.1"/>',
  home: '<path d="M4 10.8 12 4l8 6.8V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>',
  out: '<path d="M7 17 17 7M9 7h8v8"/>',
};
const icon = (n, cls = 'nt-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const STATUS = `<span class="ic">
  <svg width="19" height="12" viewBox="0 0 19 12" aria-hidden="true"><rect x="0" y="7.5" width="3.2" height="4.5" rx="1"/><rect x="5" y="5" width="3.2" height="7" rx="1"/><rect x="10" y="2.5" width="3.2" height="9.5" rx="1"/><rect x="15" y="0" width="3.2" height="12" rx="1"/></svg>
  <svg width="17" height="12" viewBox="0 0 17 12" aria-hidden="true"><path d="M8.5 2.4c2.4 0 4.6.9 6.3 2.5L16 3.7A10.6 10.6 0 0 0 8.5.7 10.6 10.6 0 0 0 1 3.7l1.2 1.2a8.9 8.9 0 0 1 6.3-2.5zm0 3.4c1.5 0 2.9.6 3.9 1.5l1.2-1.2a7.3 7.3 0 0 0-10.2 0l1.2 1.2c1-.9 2.4-1.5 3.9-1.5zm0 3.4c.6 0 1.2.2 1.6.6l-1.6 1.6-1.6-1.6c.4-.4 1-.6 1.6-.6z"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".38"/><rect x="2" y="2" width="20" height="9" rx="2.4"/><path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" opacity=".4"/></svg></span>`;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (h, m) => `${h % 12 || 12}:${String(m).padStart(2, '0')}`;

/** Is the viewer on a phone? Then the blog is the iPhone app; otherwise the Mac one. */
export const onPhone = () => (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700) || innerWidth < 600;

export function readPosts(root = document) {
  return [...root.querySelectorAll('article[data-post]')].map(a => {
    const [y, mo, d] = (a.dataset.date || '').split('-').map(Number);
    const [hh, mm] = (a.dataset.time || '').split(':').map(Number);
    const hasTime = Number.isFinite(hh) && Number.isFinite(mm);
    return {
      slug: a.id,
      title: a.querySelector('h1,h2').textContent.trim(),
      when: new Date(y, mo - 1, d, hasTime ? hh : 12, hasTime ? mm : 0),
      hasTime,
      paras: [...a.querySelectorAll('p')].filter(p => !p.closest('header')).map(p => p.innerHTML.trim()).filter(Boolean),
    };
  });
}

// "Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", then the month, then the year
export function section(d, now) {
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((day(now) - day(d)) / 864e5);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return 'Previous 7 Days';
  if (ago < 30) return 'Previous 30 Days';
  return d.getFullYear() === now.getFullYear() ? MONTHS[d.getMonth()] : String(d.getFullYear());
}
export function rowDate(p, now) {
  const s = section(p.when, now), d = p.when;
  if (s === 'Today' && p.hasTime) return clock(d.getHours(), d.getMinutes()) + (d.getHours() < 12 ? ' AM' : ' PM');
  if (s === 'Yesterday') return 'Yesterday';
  if (s === 'Previous 7 Days') return DAYS[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}
export const longDate = p => `${MONTHS[p.when.getMonth()]} ${p.when.getDate()}, ${p.when.getFullYear()}` +
  (p.hasTime ? ` at ${clock(p.when.getHours(), p.when.getMinutes())} ${p.when.getHours() < 12 ? 'AM' : 'PM'}` : '');
export const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };

/**
 * mountNotes(el, posts, opts) → { open, back, destroy }
 * opts.start: a post slug, 'latest' (default) or 'list'
 * opts.onClose: the folder's back button and Escape call it (the room); otherwise the back button goes to opts.home ('/')
 * opts.onPost(slug|null): the note on view changed; opts.scheme: 'light' | 'dark' (default: the visitor's)
 * opts.bare: true/false forces full screen; by default it is full screen on phone-sized screens
 */
export function mountNotes(el, posts, opts = {}) {
  const dark = opts.scheme ? opts.scheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const home = opts.home || '/';
  el.innerHTML = `<div class="nt-wrap"><div class="nt-fit"><div class="nt-device">
    <i class="nt-side l" style="top:150px;height:32px"></i><i class="nt-side l" style="top:205px;height:62px"></i><i class="nt-side l" style="top:282px;height:62px"></i>
    <i class="nt-side r" style="top:230px;height:98px"></i><i class="nt-side r" style="top:560px;height:52px;width:3px"></i>
    <div class="nt-screen${dark ? ' dark' : ''} instant" role="application" aria-label="Notes">
      <div class="nt-island"></div><div class="nt-status"><time></time>${STATUS}</div>
      <section class="nt-view nt-list" aria-label="Notes folder">
        <div class="nt-scroll"><h1 class="nt-large">Notes</h1><div class="nt-sections"></div></div>
        <div class="nt-bar nt-top"><span class="nt-title">Notes</span>
          <button class="nt-circle nt-glass" data-act="folders" aria-label="${opts.onClose ? 'Back to the room' : 'niravsurabhi.com'}">${icon('back')}</button>
          <span class="sp"></span><button class="nt-circle nt-glass" data-act="menu" aria-label="More">${icon('more')}</button></div>
        <div class="nt-edge-b"></div>
        <div class="nt-bar nt-bottom"><label class="nt-search nt-glass">${icon('search')}<input type="search" placeholder="Search" aria-label="Search notes" enterkeyhint="search" autocomplete="off">${icon('mic')}</label>
          <button class="nt-circle nt-glass" data-act="compose" aria-label="New note">${icon('compose')}</button></div>
      </section>
      <section class="nt-view nt-note" aria-label="Note">
        <div class="nt-scroll"><article class="nt-doc"></article></div>
        <div class="nt-bar nt-top"><button class="nt-circle nt-glass" data-act="back" aria-label="Notes">${icon('back')}</button><span class="sp"></span>
          <span class="nt-pill nt-glass"><button data-act="share" aria-label="Share">${icon('share')}</button><button data-act="menu" aria-label="More">${icon('more')}</button></span></div>
        <div class="nt-edge-b"></div>
        <div class="nt-bar nt-bottom"><span class="nt-pill nt-glass"><button data-act="compose" aria-label="Checklist">${icon('checklist')}</button><button data-act="compose" aria-label="Attach">${icon('clip')}</button><button data-act="compose" aria-label="Markup">${icon('markup')}</button></span>
          <span class="sp"></span><button class="nt-circle nt-glass" data-act="compose" aria-label="New note">${icon('compose')}</button></div>
      </section>
      <div class="nt-menu" role="menu"></div>
      <div class="nt-toast nt-glass" role="status"></div>
      <div class="nt-homebar"></div>
    </div></div></div></div>`;
  const wrap = el.firstElementChild, fitEl = wrap.querySelector('.nt-fit'), device = wrap.querySelector('.nt-device');
  const screen = wrap.querySelector('.nt-screen'), list = screen.querySelector('.nt-list'), note = screen.querySelector('.nt-note');
  const listScroll = list.querySelector('.nt-scroll'), noteScroll = note.querySelector('.nt-scroll'), doc = note.querySelector('.nt-doc');
  const menu = screen.querySelector('.nt-menu'), toastEl = screen.querySelector('.nt-toast'), input = list.querySelector('input');
  let current = null, scale = 1, toastT = 0, destroyed = false;

  // ---------------------------------------------------------------- the phone: full screen, or drawn and scaled to fit
  function fit() {
    const bare = opts.bare ?? innerWidth < 520;
    wrap.classList.toggle('bare', bare);
    if (bare) { scale = 1; device.style.transform = ''; return; }
    const r = wrap.getBoundingClientRect();
    scale = Math.max(0.3, Math.min((r.height - 28) / 878, (r.width - 40) / 419, 1.1));
    device.style.transform = `scale(${scale})`;
    fitEl.style.width = 419 * scale + 'px'; fitEl.style.height = 878 * scale + 'px';
  }
  const tick = () => { const n = new Date(); screen.querySelector('.nt-status time').textContent = clock(n.getHours(), n.getMinutes()); };
  tick();
  const clockT = setInterval(tick, 20000);

  // ---------------------------------------------------------------- the folder
  function renderList(q = '') {
    const now = new Date(), needle = q.trim().toLowerCase();
    const shown = posts.filter(p => !needle || (p.title + ' ' + p.paras.map(plain).join(' ')).toLowerCase().includes(needle));
    const groups = [];
    for (const p of shown) { const s = section(p.when, now); let g = groups.find(g => g.s === s); if (!g) groups.push(g = { s, items: [] }); g.items.push(p); }
    list.querySelector('.nt-sections').innerHTML = !shown.length ? `<p class="nt-empty">No Results</p>` : groups.map(g => `<div class="nt-sec"><h2>${esc(g.s)}</h2><ul class="nt-group">${
      g.items.map(p => `<li><button class="nt-row" data-open="${esc(p.slug)}"><b>${esc(p.title)}</b><span><em>${esc(rowDate(p, now))}</em>${esc(plain(p.paras[0] || 'No additional text'))}</span></button></li>`).join('')
    }</ul></div>`).join('');
  }
  renderList();

  // ---------------------------------------------------------------- a note
  function open(slug, animate = true) {
    const p = posts.find(p => p.slug === slug); if (!p) return;
    current = p;
    doc.innerHTML = `<p class="nt-date">${esc(longDate(p))}</p><h1>${esc(p.title)}</h1>${p.paras.map(h => `<p>${h}</p>`).join('')}`;
    noteScroll.scrollTop = 0;
    screen.classList.toggle('instant', !animate || reduce);
    screen.classList.add('at-note');
    note.removeAttribute('inert'); list.setAttribute('inert', '');
    opts.onPost?.(p.slug);
  }
  function back() {
    if (!current) return;
    current = null; closeMenu();
    screen.classList.toggle('instant', reduce);
    screen.classList.remove('at-note');
    list.removeAttribute('inert'); note.setAttribute('inert', '');
    opts.onPost?.(null);
  }
  const url = () => (opts.url || location.origin + '/blog') + (current ? '#' + current.slug : '');

  // ---------------------------------------------------------------- buttons, the menu, confirmations
  function toast(text) {
    toastEl.textContent = text; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1600);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(url()); toast('Link Copied'); } catch { toast(url().replace(/^https?:\/\//, '')); }
  }
  async function share() {
    if (navigator.share && coarse) { try { await navigator.share({ title: current ? current.title : 'Notes', url: url() }); } catch {} return; }
    copyLink();
  }
  function openMenu() {
    menu.innerHTML = `<button role="menuitem" data-act="copy">Copy Link ${icon('link')}</button>${navigator.share && coarse ? `<button role="menuitem" data-act="sharesheet">Share… ${icon('share')}</button>` : ''}<hr>` +
      (opts.onClose ? `<button role="menuitem" data-act="close">Back to the Room ${icon('home')}</button>` : `<a role="menuitem" href="${esc(home)}">niravsurabhi.com ${icon('home')}</a>`) +
      `<a role="menuitem" href="https://x.com/21J3phy" target="_blank" rel="noopener">@21J3phy on X ${icon('out')}</a>`;
    menu.classList.add('open');
  }
  function closeMenu() { menu.classList.remove('open'); }
  screen.addEventListener('click', e => {
    const row = e.target.closest('[data-open]');
    if (row) { open(row.dataset.open); return; }
    const b = e.target.closest('[data-act]');
    const inMenu = e.target.closest('.nt-menu');
    if (!inMenu && menu.classList.contains('open') && !(b && b.dataset.act === 'menu')) { closeMenu(); if (!b) return; }
    if (!b) return;
    switch (b.dataset.act) {
      case 'folders': if (opts.onClose) opts.onClose(); else location.assign(home); break;
      case 'back': back(); break;
      case 'menu': menu.classList.contains('open') ? closeMenu() : openMenu(); break;
      case 'share': share(); break;
      case 'sharesheet': closeMenu(); share(); break;
      case 'copy': closeMenu(); copyLink(); break;
      case 'close': closeMenu(); opts.onClose?.(); break;
      case 'compose': toast('This note is view only'); break;
    }
  });
  input.addEventListener('input', () => renderList(input.value));
  listScroll.addEventListener('scroll', () => screen.classList.toggle('scrolled', listScroll.scrollTop > 36), { passive: true });
  const onKey = e => {
    if (e.key !== 'Escape' || destroyed) return;
    if (menu.classList.contains('open')) { closeMenu(); e.preventDefault(); return; }
    if (opts.onClose) { e.preventDefault(); opts.onClose(); }
    else if (current && e.target !== input) { e.preventDefault(); back(); }
  };
  addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- swipe from the left edge to go back, as on the phone
  let drag = null;
  note.addEventListener('pointerdown', e => {
    if (!current || e.button || e.target.closest('button,a,input')) return;
    const r = screen.getBoundingClientRect(), x = (e.clientX - r.left) / scale;
    if (x > 28) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w: r.width, dx: 0, v: 0, lx: e.clientX, lt: performance.now(), live: false };
  });
  note.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.live) {   // only a sideways drag is a swipe back; anything else is a tap or a scroll
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (dx < 8) return;
      drag.live = true; note.setPointerCapture(e.pointerId); screen.classList.add('dragging');
    }
    const now = performance.now();
    drag.v = (e.clientX - drag.lx) / Math.max(1, now - drag.lt); drag.lx = e.clientX; drag.lt = now;
    drag.dx = Math.max(0, e.clientX - drag.x0);
    const f = drag.dx / drag.w;
    note.style.transform = `translateX(${f * 100}%)`;
    list.style.transform = `translateX(${-30 + f * 30}%)`;
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.live) { drag = null; return; }
    const go = drag.dx / drag.w > 0.35 || drag.v > 0.45;
    drag = null;
    screen.classList.remove('dragging');
    note.style.transform = ''; list.style.transform = '';
    if (go) back();
  };
  note.addEventListener('pointerup', end); note.addEventListener('pointercancel', end);

  // ---------------------------------------------------------------- go
  fit();
  const ro = new ResizeObserver(fit); ro.observe(wrap);
  note.setAttribute('inert', '');
  const start = opts.start ?? 'latest';
  if (start !== 'list' && posts.length) open(start === 'latest' ? posts[0].slug : start, false);
  requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.remove('instant')));

  return {
    open, back,
    get slug() { return current?.slug ?? null; },
    destroy() { destroyed = true; clearInterval(clockT); clearTimeout(toastT); ro.disconnect(); removeEventListener('keydown', onKey); el.innerHTML = ''; },
  };
}
