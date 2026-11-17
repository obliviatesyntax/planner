// app.js — wires everything together: quick add, page switching (planner / done log),
// header, backup, toast, start-up.

const App = (() => {
  // ---- quick add -------------------------------------------------------

  const form = document.getElementById('quick-add');
  const titleInput = document.getElementById('qa-title');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const task = addFromText(titleInput.value, { bucket: 'today' });
    if (!task) return;
    titleInput.value = '';
    flash(task.id);
  });

  // Adds a task from typed text. `where` says where it goes:
  //   { bucket: 'week' }                         a triage bucket
  //   { planDate: '2026-11-17' }                 that day's to-do list
  //   { planDate: '2026-11-17', startMin: 570 }  that day's calendar at 9:30
  // Shortcuts inside the text:
  //   !1 !2 !3   priority            #p #work   labels (by shortcut or name, several allowed)
  //   @today @week @month @eventually (or @t @w @m @e)   triage bucket
  // With label filters selected at the top and no #label typed, the new task gets the
  // selected labels, so it doesn't vanish from view.
  function addFromText(text, where) {
    const parsed = parseQuickAdd(text);
    return Tasks.add({
      title: parsed.title,
      priority: parsed.priority || 2,
      labels: parsed.labels.length ? parsed.labels : Labels.selectedIds(),
      bucket: parsed.bucket || where.bucket || 'today',
      planDate: where.planDate || null,
      startMin: where.startMin ?? null,
    });
  }

  // "+ Add" buttons under triage buckets and day lists (data-bucket or data-date say where).
  // Type, Enter adds (and the box stays open for the next one), Escape or clicking away closes.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.col-add');
    if (!btn) return;
    const { bucket, date } = btn.dataset;
    const selector = bucket ? `.col-add[data-bucket="${bucket}"]` : `.col-add[data-date="${date}"]`;
    const input = document.createElement('input');
    input.className = 'col-add-input';
    input.placeholder = 'Task name, Enter to add';
    btn.replaceWith(input);
    input.focus();
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') return renderAll();
      if (ev.key !== 'Enter') return;
      const task = addFromText(input.value, bucket ? { bucket } : { planDate: date });
      if (!task) return;
      const again = document.querySelector(selector);   // the page re-rendered: reopen the box
      if (again) again.click();
    });
    input.addEventListener('blur', () => { if (!input.value.trim()) setTimeout(renderAll); });
  });

  function parseQuickAdd(text) {
    const out = { labels: [] };
    const rest = text.replace(/(^|\s)([!#@])(\w+)/g, (match, space, sym, word) => {
      const w = word.toLowerCase();
      if (sym === '!' && ['1', '2', '3'].includes(w)) { out.priority = Number(w); return space; }
      if (sym === '#') {
        const label = Tasks.findLabel(w);
        if (label) { if (!out.labels.includes(label.id)) out.labels.push(label.id); return space; }
      }
      if (sym === '@') {
        const bucket = TRIAGE.find(b => b.id === w || b.aliases.includes(w));
        if (bucket) { out.bucket = bucket.id; return space; }
      }
      return match;   // not a shortcut: keep the text as is
    });
    out.title = rest.replace(/\s+/g, ' ').trim();
    return out;
  }

  function flash(id) {
    const card = document.querySelector(`.card[data-task="${id}"]`);
    if (card) { card.classList.add('flash'); card.scrollIntoView({ block: 'nearest' }); }
  }

  // Press "n" anywhere (when not typing) to jump to quick add.
  document.addEventListener('keydown', e => {
    const typing = e.target.matches('input, select, textarea, [contenteditable="true"]');
    if (!typing && e.key.toLowerCase() === 'n') { e.preventDefault(); titleInput.focus(); }
  });

  // ---- pages: planner (main) or the done log (#done) -----------------------

  window.addEventListener('hashchange', renderAll);
  const onLogPage = () => location.hash === '#done';

  function renderHeader() {
    document.getElementById('today-label').textContent = formatDay(todayISO());
    const { done, total } = Tasks.todayStats();
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('today-progress').innerHTML = `
      <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
      <span>${done} / ${total} done today${total && done === total ? ' 🎉' : ''}</span>`;
    document.getElementById('log-btn').classList.toggle('active', onLogPage());
  }

  function renderAll() {
    renderHeader();
    document.getElementById('main-view').hidden = onLogPage();
    document.getElementById('history-view').hidden = !onLogPage();
    if (onLogPage()) return History.render();
    Labels.render();
    Planner.render();
    Triage.render();
  }

  // ---- backup ----------------------------------------------------------

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Tasks.exportData(), null, 2)], { type: 'application/json' });
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
      if (!Array.isArray(data.tasks) || !Array.isArray(data.labels)) throw new Error('not a backup');
      if (confirm(`Replace everything with ${data.tasks.length} tasks and ${data.labels.length} labels from ${file.name}?`)) {
        Tasks.replaceAll(data);
      }
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
  Store.onSaveError(() => toast('Could not save your last change. Check your connection and reload.'));

  // While the app is open, every minute: move anything that's behind into today's to-do list
  // (see Tasks.rollover; that redraws the page), otherwise just redraw the plan so the calendar's
  // "now" line moves. Skipped while you're dragging or typing.
  setInterval(() => {
    const busy = document.querySelector('.dragging, [contenteditable="true"], .col-add-input, .cal-add-input, .label-input, .label-picker:not([hidden])') || Calendar.isResizing();
    if (busy || Tasks.rollover() || onLogPage()) return;
    renderHeader();
    Planner.render();
  }, 60 * 1000);

  return { toast, renderAll, addFromText, parseQuickAdd };
})();

// Start: sign in if needed, then load this person's data from the database and draw the page.
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
