// taskview.js — click a task (anywhere) to open it in a window:
//
//   name         edit it here (the only place to rename a task)
//   where        where it is: a list, a day's to-do list, a calendar time, or done
//   move         (at the bottom) When: Today / Tomorrow / pick a day · a time (optional) · length;
//                List: "Move back to @its list" (off the plan) and "Move to list…"
//   priority     P1 / P2 / P3 (tap the chosen one again for none)
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
          <div class="tv-prio" title="Tap the chosen priority again to clear it">
            ${[1, 2, 3].map(n => `<button type="button" data-prio="${n}" class="p${n} ${n === p ? 'on' : ''}" title="${PRIORITIES[n]}">P${n}</button>`).join('')}
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

        <textarea class="tv-notes" rows="4" placeholder="Add a description…" aria-label="Description">${escapeHtml(t.notes || '')}</textarea>

        ${moveHtml(t)}

        <div class="tv-foot">
          <button type="button" class="tv-delete">Delete task</button>
          <span class="muted tv-saved">Changes save automatically</span>
        </div>
      </form>`;
    fitTitle();
  }

  // ---- moving: a day, a day + time, or a list ------------------------------------

  // ---- moving: one "When" row (day + optional time + length) and the list it belongs to ----
  //
  //   When   [Today] [Tomorrow] [📅 Thu, Nov 27] [⏱ 5:00 PM ▾] [30 min ▾]
  //   List   [Move back to @kitchenReno]  [Move to list ▾]      (planned or done)
  //   List   [Move to list: @kitchenReno ▾]  Open ↗             (waiting in a list)
  // The day chip opens the browser's date picker (a hidden <input type="date">); the time is a
  // plain select in half hours (plus the task's own time if it's in between), "No time" = the
  // day's to-do list. Picking a time on a task that isn't planned puts it on today.

  const ICON_CAL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';
  const ICON_LIST = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>';
  const ICON_WHEN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function timeOptions(current) {
    const times = [];
    for (let m = 0; m < 24 * 60; m += 30) times.push(m);
    if (current != null && !times.includes(current)) times.push(current);
    times.sort((a, b) => a - b);
    return `<option value="">No time</option>${times.map(m =>
      `<option value="${m}" ${m === current ? 'selected' : ''}>${formatTime(m)}</option>`).join('')}`;
  }

  function moveHtml(t) {
    const today = todayISO(), tomorrow = addDays(today, 1);
    const date = t.doneOn ? null : t.planDate;           // the day it's planned for (if any)
    const timed = date && t.startMin != null;
    const late = date && date < today;                    // overdue: still has its old day and time
    const otherDate = date && date !== today && date !== tomorrow ? date : '';
    const own = Tasks.list(t.list) || Tasks.list(TRIAGE_LIST.id);
    const waiting = !date && !t.doneOn;
    const lists = Tasks.allLists();
    return `
      <section class="tv-move" aria-label="Move this task">
        <div class="tv-row">
          <span class="tv-label"><i>${ICON_WHEN}</i><b>When</b></span>
          <div class="tv-when">
            <button type="button" data-day="${today}" class="${date === today ? 'on' : ''}">Today</button>
            <button type="button" data-day="${tomorrow}" class="${date === tomorrow ? 'on' : ''}">Tomorrow</button>
            <span class="tv-pick ${otherDate ? 'on' : ''} ${late ? 'late' : ''}">
              ${ICON_CAL}<span>${otherDate ? formatDay(otherDate) : 'Date'}</span>
              <input type="date" class="tv-date" min="${today}" value="${otherDate && !late ? otherDate : ''}" tabindex="-1" aria-label="Pick a day">
            </span>
            <select class="tv-time ${timed ? 'on' : ''}" title="A time puts it on the calendar">${timeOptions(timed ? t.startMin : null)}</select>
            ${timed ? `<select class="tv-dur" title="How long">${[15, 30, 45, 60, 90, 120, 180].map(m =>
                `<option value="${m}" ${m === t.duration ? 'selected' : ''}>${m < 60 ? `${m} min` : `${m / 60} h`}</option>`).join('')}</select>` : ''}
          </div>
          ${late ? `<p class="tv-late">Overdue: it was planned for ${formatDay(date)}${timed ? ` at ${formatTime(t.startMin)}` : ''}. Pick a new day, or move it back to its list.</p>` : ''}
        </div>
        <div class="tv-row">
          <span class="tv-label"><i>${ICON_LIST}</i><b>List</b></span>
          <div class="tv-when">
            ${waiting ? '' : `<button type="button" class="tv-back" title="Take it off the plan, back into @${escapeHtml(own.name)}">Move back to @${escapeHtml(own.name)}</button>`}
            <select class="tv-list" title="Move it into another list (off the plan)">
              ${waiting ? '' : '<option value="" selected>Move to list…</option>'}
              ${lists.map(l => `<option value="${l.id}" ${waiting && l.id === own.id ? 'selected' : ''}>@${escapeHtml(l.name)}</option>`).join('')}
            </select>
            <a class="tv-open-project" href="${Project.href(own)}" title="Open @${escapeHtml(own.name)}">Open ↗</a>
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
    if (e.target.matches('.tv-time')) {
      const date = t.planDate && !t.doneOn ? t.planDate : todayISO();
      if (e.target.value === '') Tasks.moveToPlan(id, date, null);   // No time: the day's to-do list
      else Tasks.moveToCalendar(id, date, Number(e.target.value));
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
    if (e.target.closest('.tv-pick')) {   // the day chip: open the browser's date picker
      const input = dialog.querySelector('.tv-date');
      try { input.showPicker(); } catch { input.focus(); input.click(); }
      return;
    }
    if (e.target.closest('.tv-back')) {   // off the plan, back into the list it belongs to
      Tasks.moveToList(id, Tasks.get(id).list || TRIAGE_LIST.id, null);
      return afterMove();
    }
    if (e.target.closest('.tv-open-project')) dialog.close();   // the link opens the project page
    const prio = e.target.closest('[data-prio]');
    if (prio) {   // tap a priority to set it; tap the chosen one again to clear it
      const n = Number(prio.dataset.prio);
      Tasks.update(id, { priority: Tasks.get(id).priority === n ? null : n });
      return draw();
    }
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
