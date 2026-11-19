// cards.js — how one task looks, and what clicking on it does (anywhere on the page).
//
//   checkbox  → mark done / not done, on every task (or drag a task onto "Done today")
//   P1/P2/P3  → click to cycle priority (no priority: no tag; hover shows a small "P" to set one)
//   # / tags  → click to pick labels (labels.js → openPicker)
//   🗑         → delete (lists, to-do lists and calendar), with Undo
//   anywhere else on the card → open it (taskview.js): rename, description, priority, labels, delete
//   drag      → see dnd.js

const Cards = (() => {
  // A small trash can (× is kept for closing windows, so it never means "delete").
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

  // where: "list" | "plan" | "calendar" | "done"
  // style: position (calendar blocks); size: "short" / "short tiny" for short calendar blocks.
  // Calendar blocks show a short time ("10–11") — or, when the calendar is cramped
  // (Calendar.isCompressed(): week view on desktop, 2+ days on a phone), no time and no P tag
  // (the coloured edge shows priority; the tag appears on hover). See docs/ui-mobile-vs-desktop.md.
  function html(task, where, style = '', size = '') {
    const timed = task.startMin != null;
    const time = !timed ? ''
      : where === 'calendar' ? (Calendar.isCompressed() ? '' : formatTimeRange(task.startMin, task.startMin + task.duration))
      : formatTime(task.startMin);
    const p = task.priority || 0;   // 0 = no priority set
    const canDelete = where !== 'done';   // lists, to-do lists and calendar blocks
    const hasLabels = Tasks.allLabels().length > 0;   // no labels exist yet: no "#" button
    return `
      <div class="card p${p} ${where === 'calendar' ? `event ${size} ${Calendar.isCompressed() ? 'compressed' : ''}` : ''} ${where === 'done' ? 'done' : ''}" draggable="true"
           data-task="${task.id}" ${style ? `style="${style}"` : ''}>
        <input type="checkbox" class="check" ${where === 'done' ? 'checked title="Mark as not done"' : 'title="Mark done"'}>
        <div class="body">
          ${time && where !== 'calendar' ? `<span class="time">${time}</span>` : ''}
          <span class="title">${escapeHtml(task.title)}</span>
          ${where === 'calendar' && time ? `<span class="time">${time}</span>` : ''}
          ${Labels.tagsHtml(task)}
          ${task.notes && task.notes.trim() ? '<span class="has-notes" title="Has a description">≡</span>' : ''}
        </div>
        <!-- Priority (when set) is always last and never moves. The hover buttons (P # ×) float
             over the text just left of it, on a see-through background, so nothing reflows. -->
        ${p ? `<button type="button" class="prio" title="${PRIORITIES[p]} (click to change)">P${p}</button>` : ''}
        ${!p || canDelete || hasLabels ? `<div class="card-actions">
          ${p ? '' : '<button type="button" class="prio-set" title="Set a priority">P</button>'}
          ${hasLabels ? '<button type="button" class="lbl-btn" title="Labels">#</button>' : ''}
          ${canDelete ? `<button type="button" class="del" title="Delete">${TRASH_ICON}</button>` : ''}
        </div>` : ''}
        ${where === 'calendar' ? '<div class="resize" title="Drag to change length"></div>' : ''}
      </div>`;
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('.card[data-task]');
    if (!card) return;
    const id = card.dataset.task;

    if (e.target.matches('.check')) {
      const task = Tasks.get(id);
      const wasDone = !!task.doneOn;
      Tasks.toggleDone(id);
      if (!wasDone) App.toast(`Done: “${task.title}”`, 'Undo', () => Tasks.toggleDone(id));
      return;
    }
    if (e.target.matches('.prio, .prio-set')) return Tasks.cyclePriority(id);
    if (e.target.matches('.lbl-btn, .tag')) return Labels.openPicker(id, e.target);
    if (e.target.closest('.del')) {
      const removed = Tasks.remove(id);
      return App.toast(`Deleted “${removed.title}”`, 'Undo', () => Tasks.restore(removed));
    }
    if (e.target.closest('button, input, .resize') || Date.now() < quietUntil) return;
    TaskView.open(id);   // a plain click on the card
  });

  // Right after a swipe or a resize, the browser also sends a "click": ignore it.
  let quietUntil = 0;
  function ignoreNextClick() { quietUntil = Date.now() + 400; }

  return { html, ignoreNextClick };
})();
