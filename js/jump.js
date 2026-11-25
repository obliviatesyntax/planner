// jump.js — getting between the Dashboard and project pages quickly.
//
//   • Switcher: on a project page, the ▾ next to "@name" opens a short menu: Dashboard, then every
//     project with its counts (not planned · planned). One click/tap goes there. Same on phones.
//   • Keyboard jump (computers): press G, or ⌘K / Ctrl+K, type a few letters, Enter goes.
//     ↑/↓ pick, Esc closes. "Dashboard" is always one of the choices.

const Jump = (() => {
  // Where you can go: the Dashboard first, then the projects in their Dashboard order.
  function entries() {
    const projects = Tasks.allLists().filter(l => l.id !== TRIAGE_LIST.id).map(l => {
      const { waiting, planned } = Tasks.projectTasks(l.id);
      return { hash: `project/${encodeURIComponent(l.id)}`, id: l.id, name: l.name, waiting: waiting.length, planned: planned.length };
    });
    return [{ hash: '', id: null, name: 'Dashboard' }, ...projects];
  }

  function rowHtml(e, i, active) {
    const current = (Project.currentId() || null) === e.id;
    return `<a href="#${e.hash}" class="jump-row ${i === active ? 'active' : ''} ${current ? 'current' : ''}" data-i="${i}">
      <span class="jump-name">${e.id ? `<span class="jump-at">@</span>${escapeHtml(e.name)}` : '<span class="jump-home">⌂</span>Dashboard'}</span>
      ${e.id ? `<span class="jump-counts" title="${e.waiting} not planned · ${e.planned} planned">${e.waiting} · ${e.planned}</span>` : ''}
      ${current ? '<span class="jump-here">here</span>' : ''}
    </a>`;
  }

  function go(e) {
    close();
    if (e.hash === '') { if (location.hash) location.hash = ''; }   // (hashchange redraws)
    else location.hash = e.hash;
  }

  // ---- switcher (the ▾ on a project page) ------------------------------------------------

  const menu = document.createElement('div');
  menu.className = 'jump-menu';
  menu.hidden = true;
  document.body.appendChild(menu);

  function openMenu(anchor) {
    const list = entries();
    menu.innerHTML = `${list.map((e, i) => rowHtml(e, i, -1)).join('')}
      <div class="jump-foot">not planned · planned${matchMedia('(hover: hover)').matches ? ' · press <kbd>G</kbd> to search' : ''}</div>`;
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const left = Math.min(r.left, document.documentElement.clientWidth - menu.offsetWidth - 8);   // (not innerWidth: the menu itself may widen the page)
    menu.style.left = `${Math.max(8, left) + window.scrollX}px`;
    menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
    anchor.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.hidden = true;
    document.querySelectorAll('.pj-switch[aria-expanded]').forEach(b => b.removeAttribute('aria-expanded'));
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('.pj-switch');
    if (btn) { e.preventDefault(); return menu.hidden ? openMenu(btn) : closeMenu(); }
    const row = e.target.closest('.jump-menu .jump-row');
    if (row) { e.preventDefault(); return go(entries()[row.dataset.i]); }
    if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  });

  // ---- keyboard jump ------------------------------------------------------------------------

  const dialog = document.createElement('dialog');
  dialog.className = 'jump-dialog';
  dialog.innerHTML = `<input class="jump-input" placeholder="Go to… type a project, or “dash”" spellcheck="false" autocomplete="off" aria-label="Go to a project or the Dashboard">
    <div class="jump-list"></div>
    <div class="jump-foot"><kbd>↑</kbd><kbd>↓</kbd> pick · <kbd>Enter</kbd> go · <kbd>Esc</kbd> close</div>`;
  document.body.appendChild(dialog);
  const input = dialog.querySelector('.jump-input');
  const listEl = dialog.querySelector('.jump-list');
  let shown = [];
  let active = 0;

  // Names that start with the typed text first, then ones that contain it.
  function filter(q) {
    q = q.trim().toLowerCase().replace(/^@/, '');
    const all = entries();
    if (!q) return all;
    const starts = all.filter(e => e.name.toLowerCase().startsWith(q));
    const has = all.filter(e => !starts.includes(e) && e.name.toLowerCase().includes(q));
    return [...starts, ...has];
  }

  function renderList() {
    shown = filter(input.value);
    active = Math.min(active, Math.max(0, shown.length - 1));
    listEl.innerHTML = shown.length ? shown.map((e, i) => rowHtml(e, i, active)).join('')
      : '<p class="jump-none">No project matches.</p>';
    listEl.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (dialog.open) return;
    closeMenu();
    input.value = '';
    active = 0;
    renderList();
    dialog.showModal();
    input.focus();
  }
  function close() { closeMenu(); if (dialog.open) dialog.close(); }

  input.addEventListener('input', () => { active = 0; renderList(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      renderList();
    }
    if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) go(shown[active]); }
  });
  listEl.addEventListener('click', e => {
    const row = e.target.closest('.jump-row');
    if (row) { e.preventDefault(); go(shown[row.dataset.i]); }
  });
  listEl.addEventListener('mousemove', e => {
    const row = e.target.closest('.jump-row');
    if (row && Number(row.dataset.i) !== active) { active = Number(row.dataset.i); listEl.querySelectorAll('.jump-row').forEach(r => r.classList.toggle('active', r === row)); }
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });   // the backdrop

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) return closeMenu();
    if (document.getElementById('app').hidden) return;   // signed out / landing page
    const typing = e.target.matches('input, select, textarea, [contenteditable="true"]');
    const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
    const g = !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'g';
    if (!cmdK && !g) return;
    if (document.querySelector('dialog[open]:not(.jump-dialog)')) return;   // another window is open
    e.preventDefault();
    dialog.open ? close() : open();
  });

  return { open, close };
})();
