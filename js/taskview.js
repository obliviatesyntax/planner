// taskview.js — click a task (anywhere) to open it in a window:
//
//   name         edit it here (the only place to rename a task)
//   where        where it is: a list, a day's to-do list, a calendar time, or done
//   priority     None / P1 / P2 / P3
//   labels       tick on/off, or make a new one
//   description  free-form notes ("call before 5", links, addresses…)
//   delete       with Undo
//
// Every change saves straight away (the description a moment after you stop typing).

const TaskView = (() => {
  const dialog = document.getElementById('task-dialog');
  let id = null;
  let noteTimer = null;

  function open(taskId) {
    id = taskId;
    draw();
    dialog.showModal();
    fitTitle();   // measure the name box now that the window is visible
    dialog.querySelector('.tv-title').blur();
  }

  function whereText(t) {
    if (t.doneOn) return `✓ Done ${t.doneOn === todayISO() ? 'today' : formatDay(t.doneOn)}`;
    if (t.planDate) {
      const day = t.planDate === todayISO() ? 'Today' : t.planDate === addDays(todayISO(), 1) ? 'Tomorrow' : formatDay(t.planDate);
      return t.startMin != null
        ? `📅 ${day}, ${formatTime(t.startMin)}–${formatTime(t.startMin + t.duration)}`
        : `📅 ${day}'s to-do list`;
    }
    const list = Tasks.list(t.list);
    return `☰ @${list ? list.name : 'triage'}`;
  }

  function draw() {
    const t = Tasks.get(id);
    if (!t) return close();
    const p = t.priority || 0;
    dialog.innerHTML = `
      <form method="dialog" class="taskview">
        <div class="tv-head">
          <span class="tv-where">${escapeHtml(whereText(t))}</span>
          <button type="submit" class="icon-btn" title="Close">×</button>
        </div>
        <textarea class="tv-title" rows="1" maxlength="300" aria-label="Task name">${escapeHtml(t.title)}</textarea>

        <div class="tv-row">
          <span class="tv-label">Priority</span>
          <div class="tv-prio">
            ${[0, 1, 2, 3].map(n => `<button type="button" data-prio="${n}" class="${n === p ? 'on' : ''} ${n ? `p${n}` : ''}">${n ? `P${n}` : 'None'}</button>`).join('')}
          </div>
        </div>

        <div class="tv-row">
          <span class="tv-label">Labels</span>
          <div class="tv-labels">
            ${Tasks.allLabels().map(l => `
              <button type="button" class="tv-label-chip ${t.labels.includes(l.id) ? 'on' : ''}" data-label="${l.id}" style="--c:${l.color}">#${escapeHtml(l.shortcut)} ${escapeHtml(l.name)}</button>`).join('')}
            <input class="tv-new-label" placeholder="+ New label, e.g. Health #h" maxlength="40">
          </div>
        </div>

        <label class="tv-desc">
          <span class="tv-label">Description</span>
          <textarea class="tv-notes" rows="5" placeholder="Notes, links, details…">${escapeHtml(t.notes || '')}</textarea>
        </label>

        <div class="tv-foot">
          <button type="button" class="tv-delete">Delete task</button>
          <span class="muted tv-saved">Changes save automatically</span>
        </div>
      </form>`;
    fitTitle();
  }

  // The name box grows with the text.
  function fitTitle() {
    const box = dialog.querySelector('.tv-title');
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }

  function saveTitle() {
    const box = dialog.querySelector('.tv-title');
    const t = Tasks.get(id);
    const title = box.value.replace(/\s+/g, ' ').trim();
    if (title && title !== t.title) Tasks.update(id, { title });
    else box.value = t.title;
  }

  function saveNotes() {
    clearTimeout(noteTimer);
    const box = dialog.querySelector('.tv-notes');
    if (!box || !id) return;
    const t = Tasks.get(id);
    if (t && box.value !== (t.notes || '')) Tasks.update(id, { notes: box.value });
  }

  dialog.addEventListener('input', e => {
    if (e.target.matches('.tv-title')) fitTitle();
    if (e.target.matches('.tv-notes')) { clearTimeout(noteTimer); noteTimer = setTimeout(saveNotes, 600); }
  });

  dialog.addEventListener('keydown', e => {
    if (e.target.matches('.tv-title') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.target.matches('.tv-new-label') && e.key === 'Enter') {
      e.preventDefault();
      const text = e.target.value;
      const match = text.match(/#(\w+)/);
      const result = Tasks.addLabel(text.replace(/#\w+/g, '').trim(), match ? match[1] : '');
      if (typeof result === 'string') return App.toast(result);
      Tasks.update(id, { labels: [...Tasks.get(id).labels, result.id] });
      draw();
      dialog.querySelector('.tv-new-label').focus();
    }
  });

  dialog.addEventListener('focusout', e => {
    if (e.target.matches('.tv-title')) saveTitle();
    if (e.target.matches('.tv-notes')) saveNotes();
  });

  dialog.addEventListener('click', e => {
    if (e.target === dialog) return dialog.close();   // click outside closes
    const prio = e.target.closest('[data-prio]');
    if (prio) { Tasks.update(id, { priority: Number(prio.dataset.prio) || null }); return draw(); }
    const chip = e.target.closest('[data-label]');
    if (chip) {
      const t = Tasks.get(id), lid = chip.dataset.label;
      Tasks.update(id, { labels: t.labels.includes(lid) ? t.labels.filter(x => x !== lid) : [...t.labels, lid] });
      return draw();
    }
    if (e.target.closest('.tv-delete')) {
      const removed = Tasks.remove(id);
      close();
      App.toast(`Deleted “${removed.title}”`, 'Undo', () => Tasks.restore(removed));
    }
  });

  // Closing (×, Escape, click outside) saves anything still being typed.
  dialog.addEventListener('close', () => {
    if (id && Tasks.get(id)) { saveTitle(); saveNotes(); }
    id = null;
  });

  function close() { if (dialog.open) dialog.close(); }

  return { open };
})();
