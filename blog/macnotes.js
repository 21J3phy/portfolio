// The blog on a Mac: Notes, full window, in dark mode (the macOS 26 look). The same posts as the iPhone version
// (notes.js): a sidebar with the iCloud folders, the list of notes by date, and the note. The red light closes it.
import { section, rowDate, longDate, plain, esc } from './notes.js';

const I = {
  folder: '<path d="M2.5 5.2A1.7 1.7 0 0 1 4.2 3.5h3l1.6 1.8h6.9a1.7 1.7 0 0 1 1.7 1.7v7.3a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7z" transform="scale(.94) translate(.3 .5)"/><path d="M2.6 7.6h14.6" transform="scale(.94) translate(.3 .5)"/>',
  trash: '<path d="M3.5 5h11M7.2 5V3.4h3.6V5M5 5l.7 10a1.3 1.3 0 0 0 1.3 1.2h4a1.3 1.3 0 0 0 1.3-1.2L13 5"/>',
  list: '<path d="M6.5 4.5h9M6.5 9h9M6.5 13.5h9"/><circle cx="3" cy="4.5" r=".6" fill="currentColor"/><circle cx="3" cy="9" r=".6" fill="currentColor"/><circle cx="3" cy="13.5" r=".6" fill="currentColor"/>',
  grid: '<rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.2"/><rect x="10" y="2.5" width="5.5" height="5.5" rx="1.2"/><rect x="2.5" y="10" width="5.5" height="5.5" rx="1.2"/><rect x="10" y="10" width="5.5" height="5.5" rx="1.2"/>',
  compose: '<path d="M15.5 10.5v4a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 3h4"/><path d="M14 2.3a1.5 1.5 0 0 1 2.1 2.1L9.6 11l-2.8.6.6-2.8z"/>',
  checklist: '<path d="m2.5 5 1.3 1.3L6.3 3.8"/><path d="m2.5 12.5 1.3 1.3 2.5-2.5"/><path d="M9 5.2h7M9 12.7h7"/>',
  table: '<rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M2.5 7.3h13M2.5 11h13M7 7.3V15M11 7.3V15"/>',
  media: '<rect x="2.5" y="3.5" width="13" height="11" rx="2"/><circle cx="6.5" cy="7.3" r="1.2"/><path d="m3 13 3.8-3.6 2.7 2.4 2-1.8 3.5 3.3"/>',
  lock: '<rect x="4" y="8" width="10" height="7.5" rx="1.6"/><path d="M6.3 8V5.8a2.7 2.7 0 0 1 5.4 0V8"/>',
  share: '<path d="M9 2.5v9.5"/><path d="m6 5.3 3-2.8 3 2.8"/><path d="M6.5 8H5.3a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h7.4a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.7 8h-1.2"/>',
  search: '<circle cx="7.8" cy="7.8" r="5"/><path d="m11.5 11.5 3.8 3.8"/>',
  plus: '<circle cx="9" cy="9" r="6.8"/><path d="M9 6v6M6 9h6"/>',
  chev: '<path d="m5 7 4 4 4-4"/>',
};
const ic = (n, cls = 'mn-i') => `<svg class="${cls}" viewBox="0 0 18 18" aria-hidden="true">${I[n]}</svg>`;

/**
 * mountMacNotes(el, posts, opts) → { open, destroy }
 * opts.start: a post slug or 'latest'; opts.onClose: the red light and Escape (otherwise the red light goes to opts.home)
 * opts.onPost(slug|null): the note on view changed
 */
export function mountMacNotes(el, posts, opts = {}) {
  const home = opts.home || '/';
  el.innerHTML = `<div class="mn" role="application" aria-label="Notes">
    <div class="mn-lights">
      <button class="c" data-act="close" title="${opts.onClose ? 'Back to the room' : 'niravsurabhi.com'}" aria-label="Close"><svg viewBox="0 0 8 8"><path d="m2 2 4 4M6 2 2 6"/></svg></button>
      <button class="m" data-act="min" aria-label="Minimize"><svg viewBox="0 0 8 8"><path d="M1.6 4h4.8"/></svg></button>
      <button class="z" data-act="zoom" aria-label="Full screen"><svg viewBox="0 0 8 8"><path d="M2 5.6V2h3.6M6 2.4V6H2.4" stroke-width="1.3"/></svg></button>
    </div>
    <aside class="mn-side">
      <div style="height:48px"></div>
      <div class="mn-shead">iCloud ${ic('chev', 'mn-i')}</div>
      <ul class="mn-folders">
        <li><button class="mn-folder" data-folder="all">${ic('folder')}<span>All iCloud</span><i>${posts.length}</i></button></li>
        <li><button class="mn-folder on" data-folder="notes">${ic('folder')}<span>Notes</span><i>${posts.length}</i></button></li>
        <li><button class="mn-folder" data-folder="deleted">${ic('trash')}<span>Recently Deleted</span></button></li>
      </ul>
      <span class="sp"></span>
      <button class="mn-newf" data-act="ro">${ic('plus')}New Folder</button>
    </aside>
    <div class="mn-main">
      <section class="mn-list" aria-label="Notes">
        <div class="mn-tb first"><span class="sp"></span>
          <span class="mn-cap mn-glass"><button class="on" data-act="ro" aria-label="List">${ic('list')}</button><button data-act="ro" aria-label="Gallery">${ic('grid')}</button></span>
          <button class="mn-circ mn-glass" data-act="ro" aria-label="Delete">${ic('trash')}</button></div>
        <div class="mn-scroll"><div class="mn-secs"></div></div>
      </section>
      <section class="mn-editor" aria-label="Note">
        <div class="mn-tb">
          <button class="mn-circ mn-glass" data-act="ro" aria-label="New note">${ic('compose')}</button>
          <span class="mn-cap mn-glass"><button data-act="ro" aria-label="Format"><span class="aa">Aa</span></button><button data-act="ro" aria-label="Checklist">${ic('checklist')}</button><button data-act="ro" aria-label="Table">${ic('table')}</button><button data-act="ro" aria-label="Media">${ic('media')}</button></span>
          <span class="sp"></span>
          <span class="mn-cap mn-glass"><button data-act="ro" aria-label="Lock">${ic('lock')}</button><button data-act="share" aria-label="Share">${ic('share')}</button></span>
          <label class="mn-search mn-glass">${ic('search')}<input type="search" placeholder="Search" aria-label="Search notes" autocomplete="off"></label>
        </div>
        <div class="mn-scroll"><article class="mn-doc"></article></div>
      </section>
    </div>
    <div class="mn-toast mn-glass" role="status"></div>
  </div>`;
  const root = el.firstElementChild, secs = root.querySelector('.mn-secs'), doc = root.querySelector('.mn-doc');
  const editorScroll = root.querySelector('.mn-editor .mn-scroll'), input = root.querySelector('input'), toastEl = root.querySelector('.mn-toast');
  let current = null, folder = 'notes', toastT = 0;

  function renderList() {
    const now = new Date(), q = input.value.trim().toLowerCase();
    const shown = folder === 'deleted' ? [] : posts.filter(p => !q || (p.title + ' ' + p.paras.map(plain).join(' ')).toLowerCase().includes(q));
    const groups = [];
    for (const p of shown) { const s = section(p.when, now); let g = groups.find(g => g.s === s); if (!g) groups.push(g = { s, items: [] }); g.items.push(p); }
    secs.innerHTML = !shown.length ? `<p class="mn-empty">${q ? 'No Results' : 'No Notes'}</p>` : groups.map(g => `<div class="mn-sec"><h2>${esc(g.s)}</h2><ul class="mn-rows">${
      g.items.map(p => `<li><button class="mn-row${current === p ? ' on' : ''}" data-open="${esc(p.slug)}"><b>${esc(p.title)}</b><span><em>${esc(rowDate(p, now))}</em>${esc(plain(p.paras[0] || 'No additional text'))}</span></button></li>`).join('')
    }</ul></div>`).join('');
  }
  function open(slug) {
    const p = posts.find(p => p.slug === slug); if (!p) return;
    current = p;
    doc.innerHTML = `<p class="mn-date">${esc(longDate(p))}</p><h1>${esc(p.title)}</h1>${p.paras.map(h => `<p>${h}</p>`).join('')}`;
    editorScroll.scrollTop = 0;
    renderList();
    opts.onPost?.(p.slug);
  }
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1600); }
  const url = () => (opts.url || location.origin + '/blog') + (current ? '#' + current.slug : '');

  root.addEventListener('click', async e => {
    const row = e.target.closest('[data-open]'); if (row) { open(row.dataset.open); return; }
    const f = e.target.closest('[data-folder]');
    if (f) { folder = f.dataset.folder; root.querySelectorAll('.mn-folder').forEach(b => b.classList.toggle('on', b === f)); renderList(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'close': if (opts.onClose) opts.onClose(); else location.assign(home); break;
      case 'zoom': if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); break;
      case 'share': try { await navigator.clipboard.writeText(url()); toast('Link Copied'); } catch { toast(url().replace(/^https?:\/\//, '')); } break;
      case 'ro': toast('This note is view only'); break;
    }
  });
  input.addEventListener('input', renderList);
  const onKey = e => { if (e.key === 'Escape' && opts.onClose && e.target !== input) { e.preventDefault(); opts.onClose(); } };
  addEventListener('keydown', onKey);

  renderList();
  const start = opts.start ?? 'latest';
  if (posts.length) open(start === 'latest' ? posts[0].slug : start);
  return {
    open,
    get slug() { return current?.slug ?? null; },
    destroy() { clearTimeout(toastT); removeEventListener('keydown', onKey); el.innerHTML = ''; },
  };
}
