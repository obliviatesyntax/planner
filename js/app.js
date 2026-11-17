// app.js — wires everything together: quick add bar, view switching, header, backup, toast.

const App = (() => {
  // ---- quick add -------------------------------------------------------

  const form = document.getElementById('quick-add');
  const titleInput = document.getElementById('qa-title');
  const areaSeg = segmented(document.getElementById('qa-area'));
  const prioSeg = segmented(document.getElementById('qa-priority'));
  const bucketSelect = document.getElementById('qa-bucket');
  bucketSelect.innerHTML = BUCKETS.map(b => `<option value="${b.id}">${b.label}</option>`).join('');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const parsed = parseQuickAdd(titleInput.value);
    const task = Tasks.add({
      title: parsed.title,
      area: parsed.area || areaSeg.get(),
      priority: parsed.priority || Number(prioSeg.get()),
      bucket: parsed.bucket || bucketSelect.value,
    });
    if (!task) return;
    titleInput.value = '';
    showView('board');
    Board.flash(task.id);
  });

  // Pulls shortcuts out of the text:  "Call bank !1 #p @week"  ->  priority 1, personal, this week
  function parseQuickAdd(text) {
    const out = {};
    const rest = text.replace(/(^|\s)([!#@])(\w+)/g, (match, space, sym, word) => {
      const w = word.toLowerCase();
      if (sym === '!' && ['1', '2', '3'].includes(w)) { out.priority = Number(w); return space; }
      if (sym === '#' && (w === 'w' || w === 'work')) { out.area = 'work'; return space; }
      if (sym === '#' && (w === 'p' || w === 'personal')) { out.area = 'personal'; return space; }
      if (sym === '@') {
        const bucket = BUCKETS.find(b => b.id === w || b.aliases.includes(w));
        if (bucket) { out.bucket = bucket.id; return space; }
      }
      return match;   // not a shortcut: keep the text as is
    });
    out.title = rest.replace(/\s+/g, ' ').trim();
    return out;
  }

  // A row of buttons where exactly one is active.
  function segmented(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      container.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    });
    return { get: () => container.querySelector('.active').dataset.value };
  }

  // Press "n" anywhere (when not typing) to jump to quick add.
  document.addEventListener('keydown', e => {
    const typing = e.target.matches('input, select, textarea, [contenteditable="true"]');
    if (!typing && e.key.toLowerCase() === 'n') { e.preventDefault(); titleInput.focus(); }
  });

  // ---- views & header --------------------------------------------------

  let view = 'board';
  document.querySelectorAll('.views button').forEach(btn =>
    btn.addEventListener('click', () => showView(btn.dataset.view)));

  function showView(name) {
    view = name;
    document.querySelectorAll('.views button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById('board-view').hidden = name !== 'board';
    document.getElementById('history-view').hidden = name !== 'history';
    renderAll();
  }

  function renderHeader() {
    document.getElementById('today-label').textContent = formatDay(todayISO());
    const { done, total } = Tasks.todayStats();
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('today-progress').innerHTML = `
      <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
      <span>${done} / ${total} done today${total && done === total ? ' 🎉' : ''}</span>`;
  }

  function renderAll() {
    renderHeader();
    if (view === 'board') Board.render();
    else History.render();
  }

  // ---- backup ----------------------------------------------------------

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Tasks.all(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planner-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('not a task list');
      if (confirm(`Replace your current tasks with ${data.length} tasks from ${file.name}?`)) Tasks.replaceAll(data);
    } catch (err) {
      toast('That file is not a planner backup');
    }
    e.target.value = '';
  });

  // ---- toast -----------------------------------------------------------

  let toastTimer;
  function toast(message, actionLabel, action) {
    const el = document.getElementById('toast');
    el.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button type="button">${actionLabel}</button>` : ''}`;
    el.hidden = false;
    if (actionLabel) el.querySelector('button').onclick = () => { action(); el.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // ---- start -----------------------------------------------------------

  Tasks.onChange(renderAll);

  // If the app is left open past midnight, refresh so yesterday's done tasks move to the log.
  let lastDay = todayISO();
  setInterval(() => { if (todayISO() !== lastDay) { lastDay = todayISO(); renderAll(); } }, 60 * 1000);

  Store.onSaveError(() => toast('Could not save your last change. Check your connection and reload.'));

  return { toast, renderAll, parseQuickAdd };
})();

// Start: sign in if needed, then load this person's tasks from the database and draw the board.
(async () => {
  const user = await Auth.currentUser();
  if (!user) return Auth.showSignIn();
  if (Auth.isFinishingSignup()) return Auth.showFinishSignup(user);   // back from a "Create account" link
  Auth.showApp(user);
  try {
    await Tasks.init();
  } catch (err) {
    console.error(err);
    App.toast('Could not load your tasks. Check your connection and reload.');
  }
  App.renderAll();
})();
