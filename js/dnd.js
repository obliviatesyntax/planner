// dnd.js — drag and drop between triage, plan lists and the calendar.
//
// Anything with data-drop="…" is a place you can drop a card:
//   data-drop="triage"   data-bucket="week"        → Tasks.moveToTriage
//   data-drop="plan"     data-date="2026-11-17"    → Tasks.moveToPlan
//   data-drop="calendar" data-date="2026-11-17"    → Tasks.moveToCalendar (time from the mouse position)
// Lists show a blue line where the card will land; the calendar shows a ghost block.

const Dnd = (() => {
  let dragId = null;
  let grabOffset = 0;   // for calendar blocks: how far down the block you grabbed it
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  const ghost = document.createElement('div');
  ghost.className = 'cal-ghost';

  document.addEventListener('dragstart', e => {
    const card = e.target.closest && e.target.closest('.card[data-task]');
    if (!card || Calendar.isResizing()) { if (card) e.preventDefault(); return; }
    dragId = card.dataset.task;
    grabOffset = card.classList.contains('event') ? e.clientY - card.getBoundingClientRect().top : 0;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  document.addEventListener('dragend', () => {
    dragId = null;
    clear();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  });

  document.addEventListener('dragover', e => {
    const zone = dragId && e.target.closest('[data-drop]');
    if (!zone) return clear();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drag-over').forEach(el => { if (el !== zone) el.classList.remove('drag-over'); });
    zone.classList.add('drag-over');

    if (zone.dataset.drop === 'calendar') {
      indicator.remove();
      const start = Calendar.minutesAt(zone, e.clientY - grabOffset);
      const duration = Tasks.get(dragId).duration;
      Object.assign(ghost.style, Calendar.blockStyle(start, duration));
      ghost.textContent = formatTime(start);
      if (ghost.parentNode !== zone) zone.appendChild(ghost);
    } else {
      ghost.remove();
      const list = zone.querySelector('.list') || zone;
      const before = cardBelow(list, e.clientY);
      if (before) list.insertBefore(indicator, before); else list.appendChild(indicator);
    }
  });

  document.addEventListener('drop', e => {
    const zone = dragId && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    const id = dragId;
    const { drop, bucket, date } = zone.dataset;
    if (drop === 'calendar') {
      Tasks.moveToCalendar(id, date, Calendar.minutesAt(zone, e.clientY - grabOffset));
    } else {
      const list = zone.querySelector('.list') || zone;
      const before = cardBelow(list, e.clientY);
      const beforeId = before ? before.dataset.task : null;
      if (drop === 'triage') Tasks.moveToTriage(id, bucket, beforeId);
      if (drop === 'plan') Tasks.moveToPlan(id, date, beforeId);
    }
    clear();
  });

  // The first card in `list` whose middle is below the mouse (the drop goes before it).
  function cardBelow(list, y) {
    return [...list.querySelectorAll(':scope > .card:not(.dragging)')]
      .find(card => { const r = card.getBoundingClientRect(); return y < r.top + r.height / 2; });
  }

  function clear() {
    indicator.remove();
    ghost.remove();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  return {};
})();
