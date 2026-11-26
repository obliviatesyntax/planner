// jump.js — getting between the Dashboard and project pages quickly.
//
//   • Switcher: on a project page, the ▾ next to "@name" opens a short menu: Dashboard, then every
//     project with its counts (not planned · planned). One click/tap goes there. Same on phones.
//   • Search: the 🔍 in the top bar (phones too), or G / ⌘K / Ctrl+K on a computer. Goes to the
//     Dashboard or a project, opens a task (title or description), or a project from its notes.

const Jump = (() => {
  // Where you can go: the Dashboard first, then the projects in their Dashboard order.
  function entries({ archived = false } = {}) {
    const projects = Tasks.allLists({ archived }).map(l => {
      const { waiting, planned } = Tasks.projectTasks(l.id);
      return { hash: Project.href(l).slice(1), id: l.id, name: l.name, waiting: waiting.length, planned: planned.length, archived: !!l.archived };
    });
    return [{ hash: '', id: null, name: 'Dashboard' }, ...projects];
  }

  function rowHtml(e, i, active) {
    const current = (Project.currentId() || null) === e.id;
    return `<a href="#${e.hash}" class="jump-row ${i === active ? 'active' : ''} ${current ? 'current' : ''}" data-i="${i}">
      <span class="jump-name">${e.id ? `<span class="jump-at">@</span>${escapeHtml(e.name)}` : '<span class="jump-home">⌂</span>Dashboard'}</span>
      ${e.id ? `<span class="jump-counts" title="${e.waiting} not planned · ${e.planned} planned">${e.waiting} · ${e.planned}</span>` : ''}
      ${e.archived ? '<span class="jump-archived">archived</span>' : ''}
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

  // ---- search box: the 🔍 button in the top bar, G, or ⌘K / Ctrl+K ---------------------------
  //
  // Empty: the Dashboard and every project (go there). Typing searches, in what's already loaded
  // in the page (no database round trip, so it's instant):
  //   Go to   the Dashboard ("dash") and projects whose name matches
  //   Tasks   titles and descriptions (every word typed must appear); open ones first, done last
  //   Notes   lines of project notes; opens that project
  // ↑/↓ pick, Enter opens (a task opens in its window), Esc closes.

  const dialog = document.createElement('dialog');
  dialog.className = 'jump-dialog';
  dialog.innerHTML = `<input class="jump-input" type="search" placeholder="Search projects, tasks and notes…" spellcheck="false" autocomplete="off" aria-label="Search projects, tasks and notes">
    <div class="jump-list"></div>
    <div class="jump-foot jump-keys"><kbd>↑</kbd><kbd>↓</kbd> pick · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>`;
  document.body.appendChild(dialog);
  const input = dialog.querySelector('.jump-input');
  const listEl = dialog.querySelector('.jump-list');
  let shown = [];   // flat list of results: { kind: 'place' | 'task' | 'note', … }
  let active = 0;
  const MAX_TASKS = 12, MAX_NOTES = 6;

  const words = q => q.toLowerCase().replace(/^@/, '').split(/\s+/).filter(Boolean);
  const hasAll = (text, ws) => { const t = text.toLowerCase(); return ws.every(w => t.includes(w)); };
  // Escape, then wrap the typed words in <mark>.
  function marked(text, ws) {
    let html = escapeHtml(text);
    ws.forEach(w => { if (w.length > 1) html = html.replace(new RegExp(escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`); });
    return html;
  }
  // A short snippet of `text` around the first typed word.
  function snippet(text, ws) {
    const flat = text.replace(/\s+/g, ' ').trim();
    const at = Math.max(0, ...ws.map(w => flat.toLowerCase().indexOf(w)).filter(n => n >= 0).slice(0, 1));
    const from = Math.max(0, at - 30);
    return (from ? '…' : '') + flat.slice(from, from + 90) + (flat.length > from + 90 ? '…' : '');
  }

  // Where a task is, in a few words: "Today · 5 PM", "Tomorrow", "Thu, Nov 27", "Overdue", "Done Nov 24", "@triage".
  function whereShort(t) {
    const today = todayISO();
    const day = d => d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : d === addDays(today, -1) ? 'Yesterday' : formatDay(d);
    if (t.doneOn) return `Done ${day(t.doneOn).toLowerCase() === 'today' ? 'today' : day(t.doneOn)}`;
    if (t.planDate && t.planDate < today) return 'Overdue';
    if (t.planDate) return `${day(t.planDate)}${t.startMin != null ? ` · ${formatTime(t.startMin).replace(':00', '')}` : ''}`;
    const l = Tasks.list(t.list);
    return `@${l ? l.name : 'triage'}`;
  }

  function search(q) {
    const ws = words(q);
    const places = entries({ archived: words(q).length > 0 }).map(e => ({ kind: 'place', ...e }));   // archived ones only when searching
    if (!ws.length) return { ws, places, tasks: [], notes: [] };
    const name = e => e.name.toLowerCase();
    const starts = places.filter(e => name(e).startsWith(ws[0]) || (e.id === null && 'dashboard'.startsWith(ws[0])));
    const has = places.filter(e => !starts.includes(e) && hasAll(e.name, ws));
    const rank = t => t.doneOn ? 3 : t.planDate && t.planDate < todayISO() ? 0 : t.planDate ? 1 : 2;
    const tasks = Tasks.allTasks()
      .filter(t => hasAll(`${t.title} ${t.notes || ''}`, ws))
      .sort((a, b) => rank(a) - rank(b) || (a.planDate || a.doneOn || '9').localeCompare(b.planDate || b.doneOn || '9'))
      .slice(0, MAX_TASKS)
      .map(t => ({ kind: 'task', task: t, inNotes: !hasAll(t.title, ws) }));
    const notes = [];
    Tasks.allLists({ archived: true }).forEach(l => (l.notes || '').split('\n').forEach(line => {
      if (notes.length < MAX_NOTES && line.trim() && hasAll(line, ws)) notes.push({ kind: 'note', list: l, line: line.replace(/^[\s#>*+-]+|\s+$/g, '') });
    }));
    return { ws, places: [...starts, ...has], tasks, notes };
  }

  function resultHtml(r, i, ws) {
    const cls = `jump-row ${i === active ? 'active' : ''}`;
    if (r.kind === 'place') return rowHtml(r, i, active);
    if (r.kind === 'task') {
      const t = r.task;
      return `<a href="#" class="${cls} jump-task ${t.doneOn ? 'is-done' : ''}" data-i="${i}">
        <span class="jump-check">${t.doneOn ? '☑' : '☐'}</span>
        <span class="jump-name"><span>${marked(t.title, ws)}</span>${r.inNotes ? `<small>${marked(snippet(t.notes, ws), ws)}</small>` : ''}</span>
        <span class="jump-where ${t.planDate && !t.doneOn && t.planDate < todayISO() ? 'late' : ''}">${escapeHtml(whereShort(t))}</span>
      </a>`;
    }
    return `<a href="#${Project.href(r.list).slice(1)}" class="${cls} jump-note" data-i="${i}">
      <span class="jump-check">≡</span>
      <span class="jump-name"><span>${marked(snippet(r.line, ws), ws)}</span></span>
      <span class="jump-where">@${escapeHtml(r.list.name)} notes</span>
    </a>`;
  }

  function renderList() {
    const { ws, places, tasks, notes } = search(input.value);
    shown = [...places, ...tasks, ...notes];
    active = Math.min(active, Math.max(0, shown.length - 1));
    let i = 0;
    const group = (title, items) => items.length
      ? `${ws.length ? `<div class="jump-group">${title}</div>` : ''}${items.map(r => resultHtml(r, i++, ws)).join('')}` : '';
    listEl.innerHTML = shown.length
      ? group('Go to', places) + group('Tasks', tasks) + group('In notes', notes)
      : '<p class="jump-none">Nothing found. Try fewer words.</p>';
    listEl.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }

  function choose(r) {
    if (!r) return;
    if (r.kind === 'task') { close(); return TaskView.open(r.task.id); }
    if (r.kind === 'note') { close(); location.hash = Project.href(r.list).slice(1); return; }
    go(r);
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
    if (e.key === 'Enter') { e.preventDefault(); choose(shown[active]); }
  });
  listEl.addEventListener('click', e => {
    const row = e.target.closest('.jump-row');
    if (row) { e.preventDefault(); choose(shown[row.dataset.i]); }
  });
  listEl.addEventListener('mousemove', e => {
    const row = e.target.closest('.jump-row');
    if (row && Number(row.dataset.i) !== active) { active = Number(row.dataset.i); listEl.querySelectorAll('.jump-row').forEach(r => r.classList.toggle('active', r === row)); }
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });   // the backdrop
  document.getElementById('search-btn').addEventListener('click', open);

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
