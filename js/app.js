// app.js — wires everything together: quick add, "+ Add" boxes, header, backup, toast, start-up.

const App = (() => {
  // ---- quick add -------------------------------------------------------

  const form = document.getElementById('quick-add');
  const titleInput = document.getElementById('qa-title');

  // The top box understands plain English for committing to the plan:
  //   "Setup dentist appointment today 5PM"  → today's calendar at 5 PM   (see when.js)
  //   "Call mom tomorrow"                    → tomorrow's to-do list
  //   "Renew passport @weekly"               → the @weekly list (created if it doesn't exist;
  //                                            an @list always wins over a day/time)
  //   "Renew passport"                       → @triage
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = titleInput.value;
    const parsed = parseQuickAdd(text);
    if (parsed.badList) return toast(`@${parsed.badList} isn't a valid list name: one word, letters and digits.`);
    const when = parsed.listName ? null : When.parse(text);
    const task = when && when.date
      ? addFromText(when.title, { planDate: when.date, startMin: when.startMin, duration: when.duration })
      : addFromText(text, {});
    if (!task) return;
    titleInput.value = '';
    flash(task.id);
    const where = task.planDate
      ? When.describe({ date: task.planDate, startMin: task.startMin, duration: task.startMin != null ? task.duration : null })
      : `@${Tasks.list(task.list).name}`;
    toast(`Added “${task.title}” to ${where}`, 'Undo', () => Tasks.remove(task.id));
  });

  // Adds a task from typed text. `where` says where it goes:
  //   { list: 'triage' }                         a list (default @triage)
  //   { planDate: '2026-11-17' }                 that day's to-do list
  //   { planDate: '2026-11-17', startMin: 570 }  that day's calendar at 9:30
  // Shortcuts inside the text:
  //   p1 p2 p3   priority            #p #work   labels (by shortcut or name, several allowed)
  //   @listName  that list (created if it doesn't exist yet)
  // With label filters selected at the top and no #label typed, the new task gets the
  // selected labels, so it doesn't vanish from view.
  function addFromText(text, where) {
    const parsed = parseQuickAdd(text);
    const named = parsed.listName ? Tasks.addList(parsed.listName) : null;   // finds or creates
    const listId = named && typeof named !== 'string' ? named.id : where.list || TRIAGE_LIST.id;
    return Tasks.add({
      title: parsed.title,
      priority: parsed.priority || Settings.get('defaultPriority') || null,
      labels: parsed.labels.length ? parsed.labels : Labels.selectedIds(),
      list: listId,
      planDate: named ? null : where.planDate || null,
      startMin: where.startMin ?? null,
      duration: where.duration || null,
    });
  }

  // "+ Add" buttons under lists and day to-do lists (data-list or data-date say where).
  // Type, Enter adds (and the box stays open for the next one), Escape or clicking away closes.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.col-add');
    if (!btn) return;
    const { list, date } = btn.dataset;
    const selector = list ? `.col-add[data-list="${list}"]` : `.col-add[data-date="${date}"]`;
    const input = document.createElement('input');
    input.className = 'col-add-input';
    input.placeholder = 'Task name, Enter to add';
    btn.replaceWith(input);
    input.focus();
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') return renderAll();
      if (ev.key !== 'Enter') return;
      const task = addFromText(input.value, list ? { list } : { planDate: date });
      if (!task) return;
      const again = document.querySelector(selector);   // the page re-rendered: reopen the box
      if (again) again.click();
    });
    input.addEventListener('blur', () => { if (!input.value.trim()) setTimeout(renderAll); });
  });

  // Pulls shortcuts out of the text. With { lists: false } (used when renaming), "@words" stay.
  function parseQuickAdd(text, { lists = true } = {}) {
    const out = { labels: [] };
    // p1 / p2 / p3 as a word of its own (any case): priority
    let rest = text.replace(/(^|\s)p([123])(?=\s|$)/gi, (match, space, n) => { out.priority = Number(n); return space; });
    rest = rest.replace(/(^|\s)([#@])(\w+)/g, (match, space, sym, word) => {
      const w = word.toLowerCase();
      if (sym === '#') {
        const label = Tasks.findLabel(w);
        if (label) { if (!out.labels.includes(label.id)) out.labels.push(label.id); return space; }
      }
      if (sym === '@' && lists && !out.listName) {
        if (!LIST_NAME.test(word)) { out.badList = word; return match; }
        out.listName = word;   // keeps its case: "@upcomingE"
        return space;
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

  // ---- drawing ---------------------------------------------------------

  function renderAll() {
    document.getElementById('today-label').textContent = formatDay(todayISO());
    Labels.render();
    Planner.render();
    Lists.render();
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
      data.tasks.forEach(t => { t.list = t.list || TRIAGE_LIST.id; });   // older backups had buckets
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

  // While the app is open, every minute: after midnight, move yesterday's unfinished tasks to
  // @triage (Tasks.rollover redraws the page); otherwise just redraw the plan so the calendar's
  // "now" line moves. Skipped while you're dragging or typing.
  setInterval(() => {
    const busy = document.querySelector('.dragging, [contenteditable="true"], .col-add-input, .cal-add-input, .label-input, .list-new-input, .label-picker:not([hidden])') || Calendar.isResizing();
    if (busy || Tasks.rollover()) return;
    renderAll();
  }, 60 * 1000);

  return { toast, renderAll, addFromText, parseQuickAdd };
})();

// Start (once every script on the page has loaded): sign in if needed, then load this
// person's data from the database and draw the page.
window.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.currentUser();
  if (!user) return Auth.showSignIn();
  if (Auth.needsNewPassword()) return Auth.showNewPassword(user);   // back from a "Forgot password" email
  Auth.showApp(user);
  Settings.load(user);
  try {
    await Tasks.init();
  } catch (err) {
    console.error(err);
    App.toast('Could not load your tasks. Check your connection and reload.');
  }
  App.renderAll();
});
