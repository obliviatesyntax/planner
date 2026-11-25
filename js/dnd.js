// dnd.js — drag and drop.
//
// Tasks: anything with data-drop="…" is a place you can drop a task card:
//   data-drop="list"     data-list="triage"        → Tasks.moveToList
//   data-drop="plan"     data-date="2026-11-17"    → Tasks.moveToPlan (a day's to-do list)
//   data-drop="calendar" data-date="2026-11-17"    → Tasks.moveToCalendar (time from the mouse position)
//   data-drop="done"     data-date="2026-11-17"    → Tasks.markDone ("Done today", or a past day)
// Lists show a blue line where the card will land; the calendar shows a ghost block.
//
// Lists: drag a list's header (data-list-drag) left/right to reorder the lists.
//
// Drop bar (phone and desktop): while a task is being dragged, a bar slides up from the bottom
// with big targets (Today · Tomorrow · Triage · Delete), so you rarely need to scroll mid-drag.
// They're ordinary drop places (data-drop="…") handled by the same drop code; data-drop="delete"
// deletes the task (with Undo). Marking done isn't here on purpose: use the checkbox.

const Dnd = (() => {
  let dragId = null;      // task being dragged
  let listDragId = null;  // or: list being dragged
  let grabOffset = 0;     // for calendar blocks: how far down the block you grabbed it
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  const ghost = document.createElement('div');
  ghost.className = 'cal-ghost';

  document.addEventListener('dragstart', e => {
    dragId = listDragId = null;   // start clean (a drop that redraws the page can swallow "dragend")
    const card = e.target.closest && e.target.closest('.card[data-task]');
    const listHead = e.target.closest && e.target.closest('[data-list-drag]');
    if (card) {
      if (Calendar.isResizing()) return e.preventDefault();
      dragId = card.dataset.task;
      grabOffset = card.classList.contains('event') ? e.clientY - card.getBoundingClientRect().top : 0;
      e.dataTransfer.setData('text/plain', dragId);
      requestAnimationFrame(() => card.classList.add('dragging'));
      showDropBar(Tasks.get(dragId));
    } else if (listHead) {
      listDragId = listHead.dataset.listDrag;
      e.dataTransfer.setData('text/plain', listDragId);
      requestAnimationFrame(() => listHead.closest('.list-col').classList.add('dragging'));
    } else return;
    e.dataTransfer.effectAllowed = 'move';
  });

  document.addEventListener('dragend', () => {
    Cards.ignoreNextClick();
    dragId = listDragId = null;
    dropBar.hidden = true;
    clear();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  });

  document.addEventListener('dragover', e => {
    if (listDragId) return listDragOver(e);
    const zone = dragId && e.target.closest('[data-drop]');
    if (!zone) return clear();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drag-over').forEach(el => { if (el !== zone) el.classList.remove('drag-over'); });
    zone.classList.add('drag-over');

    if (zone.classList.contains('drop-target')) {   // a drop bar target: just highlight it
      indicator.remove();
      ghost.remove();
    } else if (zone.dataset.drop === 'calendar') {
      indicator.remove();
      const start = Calendar.minutesAt(zone, e.clientY - grabOffset);
      Object.assign(ghost.style, Calendar.blockStyle(start, Tasks.get(dragId).duration));
      ghost.textContent = formatTime(start);
      if (ghost.parentNode !== zone) zone.appendChild(ghost);
    } else if (zone.dataset.drop === 'done') {
      indicator.remove();
      ghost.remove();
    } else {
      ghost.remove();
      const list = zone.querySelector('.list') || zone;
      const before = cardBelow(list, e.clientY);
      if (before) list.insertBefore(indicator, before); else list.appendChild(indicator);
    }
  });

  document.addEventListener('drop', e => {
    if (listDragId) return listDrop(e);
    const zone = dragId && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    dropBar.hidden = true;
    const { drop, list: listId, date } = zone.dataset;
    if (drop === 'calendar') Tasks.moveToCalendar(id, date, Calendar.minutesAt(zone, e.clientY - grabOffset));
    else if (drop === 'delete') {
      const removed = Tasks.remove(id);
      App.toast(`Deleted “${removed.title}”`, 'Undo', () => Tasks.restore(removed));
    } else if (drop === 'done') {
      const title = Tasks.get(id).title;
      Cards.markJustDone(id);   // glow where it lands
      Tasks.markDone(id, date);
      App.toast(`Done: “${title}”`);
    } else {
      const list = zone.querySelector('.list') || zone;
      const before = cardBelow(list, e.clientY);
      const beforeId = before ? before.dataset.task : null;
      if (drop === 'list') Tasks.moveToList(id, listId, beforeId);
      if (drop === 'plan') Tasks.moveToPlan(id, date, beforeId);
    }
    clear();
  });

  // ---- reordering lists ----------------------------------------------------

  // The list column under the mouse, and whether the dragged list goes before it or after it.
  function listTarget(e) {
    const col = e.target.closest('.list-col');
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2 || col.dataset.list === TRIAGE_LIST.id;   // nothing goes before @triage
    return { col, after };
  }

  function listDragOver(e) {
    const target = listTarget(e);
    document.querySelectorAll('.list-col.drop-before, .list-col.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    if (!target) return;
    e.preventDefault();
    target.col.classList.add(target.after ? 'drop-after' : 'drop-before');
  }

  function listDrop(e) {
    const target = listTarget(e);
    if (!target) return;
    e.preventDefault();
    // in list order (data-order), not page order: lists are dealt into columns
    const cols = [...document.querySelectorAll('.list-col')].sort((a, b) => a.dataset.order - b.dataset.order);
    const next = target.after ? cols[cols.indexOf(target.col) + 1] : target.col;
    const id = listDragId;
    listDragId = null;
    Tasks.moveList(id, next ? next.dataset.list : null);
    clear();
  }

  // ---- helpers ----------------------------------------------------------------

  // The first card in `list` whose middle is below the mouse (the drop goes before it).
  function cardBelow(list, y) {
    return [...list.querySelectorAll(':scope > .card:not(.dragging)')]
      .find(card => { const r = card.getBoundingClientRect(); return y < r.top + r.height / 2; });
  }

  // ---- phone drop bar ----------------------------------------------------------

  const dropBar = document.getElementById('drop-bar');
  // Only places the task isn't already in: no "Today" for a task planned for today, and so on.
  // The third target is the task's own project ("@kitchenReno": unplan it back there) when it's
  // planned or done and has one; otherwise @triage (left out when it's already waiting there).
  function showDropBar(task) {
    const today = todayISO(), tomorrow = addDays(today, 1);
    const open = task && !task.doneOn;
    const project = task && (task.planDate || task.doneOn) && task.list && task.list !== TRIAGE_LIST.id && Tasks.list(task.list);
    const third = project
      ? `<div class="drop-target drop-project" data-drop="list" data-list="${project.id}" title="Unplan it, back into @${escapeHtml(project.name)}">@${escapeHtml(project.name)}</div>`
      : !(open && !task.planDate && task.list === TRIAGE_LIST.id) && `<div class="drop-target" data-drop="list" data-list="${TRIAGE_LIST.id}">Triage</div>`;
    const targets = [
      !(open && task.planDate === today) && `<div class="drop-target" data-drop="plan" data-date="${today}">Today</div>`,
      !(open && task.planDate === tomorrow) && `<div class="drop-target" data-drop="plan" data-date="${tomorrow}">Tomorrow</div>`,
      third,
      '<div class="drop-target delete" data-drop="delete">Delete</div>',
    ];
    dropBar.innerHTML = targets.filter(Boolean).join('');
    dropBar.hidden = false;
  }

  function clear() {
    indicator.remove();
    ghost.remove();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }

  return {};
})();
