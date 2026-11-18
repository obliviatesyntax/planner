// taskview.js — click a task (anywhere) to open it in a window:
//
//   name         edit it here (the only place to rename a task)
//   where        where it is: a list, a day's to-do list, a calendar time, or done
//   move         (at the bottom) Day (Today / Tomorrow / pick a date) · Time (optional; with a
//                length) · List (choosing one takes it off the plan)
//   priority     None / P1 / P2 / P3
//   labels       tick on/off (only shown once labels exist; new ones are made at the top)
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

        ${Tasks.allLabels().length ? `
          <div class="tv-row">
            <span class="tv-label">Labels</span>
            <div class="tv-labels">
              ${Tasks.allLabels().map(l => `
                <button type="button" class="tv-label-chip ${t.labels.includes(l.id) ? 'on' : ''}" data-label="${l.id}" style="--c:${l.color}">#${escapeHtml(l.shortcut)} ${escapeHtml(l.name)}</button>`).join('')}
            </div>
          </div>` : ''}

        <label class="tv-desc">
          <span class="tv-label">Description</span>
          <textarea class="tv-notes" rows="5" placeholder="Notes, links, details…">${escapeHtml(t.notes || '')}</textarea>
        </label>

        ${moveHtml(t)}

        <div class="tv-foot">
          <button type="button" class="tv-delete">Delete task</button>
          <span class="muted tv-saved">Changes save automatically</span>
        </div>
      </form>`;
    fitTitle();
  }

  // ---- moving: a day, a day + time, or a list ------------------------------------

  const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  function moveHtml(t) {
    const today = todayISO(), tomorrow = addDays(today, 1);
    const date = t.doneOn ? null : t.planDate;           // the day it's planned for (if any)
    const timed = date && t.startMin != null;
    const otherDate = date && date !== today && date !== tomorrow ? date : '';
    const lists = Tasks.allLists();
    const inList = !date && !t.doneOn ? t.list : '';
    return `
      <section class="tv-move" aria-label="Move this task">
        <div class="tv-row">
          <span class="tv-label">Day</span>
          <div class="tv-when">
            <button type="button" data-day="${today}" class="${date === today ? 'on' : ''}">Today</button>
            <button type="button" data-day="${tomorrow}" class="${date === tomorrow ? 'on' : ''}">Tomorrow</button>
            <input type="date" class="tv-date ${otherDate ? 'on' : ''}" min="${today}" value="${otherDate}" title="Pick a day">
          </div>
        </div>
        <div class="tv-row">
          <span class="tv-label">Time</span>
          <div class="tv-when">
            <input type="time" class="tv-time ${timed ? 'on' : ''}" step="900" value="${timed ? hhmm(t.startMin) : ''}" title="Put it on the calendar at this time">
            ${timed
              ? `<select class="tv-dur" title="How long">${[15, 30, 45, 60, 90, 120, 180].map(m =>
                  `<option value="${m}" ${m === t.duration ? 'selected' : ''}>${m < 60 ? `${m} min` : `${m / 60} h`}</option>`).join('')}</select>
                 <button type="button" class="tv-notime">No time</button>`
              : `<span class="tv-hint">${date ? "Optional. Without a time it stays on the day's to-do list" : 'Optional. Picks today if no day is chosen'}</span>`}
          </div>
        </div>
        <div class="tv-row">
          <span class="tv-label">List</span>
          <div class="tv-when">
            <select class="tv-list ${inList ? 'on' : ''}">
              ${inList ? '' : `<option value="" selected>Choose a list…</option>`}
              ${inList === OVERDUE_LIST.id ? '<option value="overdue" selected>@overdue</option>' : ''}
              ${lists.map(l => `<option value="${l.id}" ${l.id === inList ? 'selected' : ''}>@${escapeHtml(l.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </section>`;
  }

  // Pick a day: keep the time if it had one, otherwise it goes on that day's to-do list.
  function moveToDay(date) {
    const t = Tasks.get(id);
    if (t.startMin != null && t.planDate && !t.doneOn) Tasks.moveToCalendar(id, date, t.startMin);
    else Tasks.moveToPlan(id, date, null);
  }

  function afterMove() {
    saveNotes();   // keep anything typed in the description before redrawing
    draw();
    fitTitle();
  }

  dialog.addEventListener('change', e => {
    if (!id) return;
    const t = Tasks.get(id);
    if (e.target.matches('.tv-date') && e.target.value) { moveToDay(e.target.value); afterMove(); }
    if (e.target.matches('.tv-time') && e.target.value) {
      const [h, m] = e.target.value.split(':').map(Number);
      const date = t.planDate && !t.doneOn ? t.planDate : todayISO();
      Tasks.moveToCalendar(id, date, h * 60 + m);
      afterMove();
    }
    if (e.target.matches('.tv-dur')) { Tasks.update(id, { duration: Number(e.target.value) }); afterMove(); }
    if (e.target.matches('.tv-list') && e.target.value) { Tasks.moveToList(id, e.target.value, null); afterMove(); }
  });

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
  });

  dialog.addEventListener('focusout', e => {
    if (e.target.matches('.tv-title')) saveTitle();
    if (e.target.matches('.tv-notes')) saveNotes();
  });

  dialog.addEventListener('click', e => {
    if (e.target === dialog) return dialog.close();   // click outside closes
    const day = e.target.closest('[data-day]');
    if (day) { moveToDay(day.dataset.day); return afterMove(); }
    if (e.target.closest('.tv-notime')) { Tasks.moveToPlan(id, Tasks.get(id).planDate, null); return afterMove(); }
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
