// cards.js — how one task looks, and what clicking on it does (anywhere on the page).
//
//   checkbox  → mark done (only on committed tasks: plan list and calendar)
//   P1/P2/P3  → click to cycle priority
//   # / tags  → click to pick labels (labels.js → openPicker)
//   ×         → delete (triage and day lists), with Undo
//   title     → double-click to rename; shortcuts work there too ("… !1 #p" sets priority, adds label)
//   drag      → see dnd.js

const Cards = (() => {
  // where: "triage" | "plan" | "calendar"
  function html(task, where, style = '') {
    const committed = where !== 'triage';
    return `
      <div class="card p${task.priority} ${where === 'calendar' ? 'event' : ''}" draggable="true"
           data-task="${task.id}" ${style ? `style="${style}"` : ''}>
        ${committed ? '<input type="checkbox" class="check" title="Mark done">' : ''}
        <div class="body">
          <span class="title">${escapeHtml(task.title)}</span>
          ${where === 'calendar' ? `<span class="time">${formatTime(task.startMin)}–${formatTime(task.startMin + task.duration)}</span>` : ''}
          ${Labels.tagsHtml(task)}
        </div>
        <button type="button" class="lbl-btn ${task.labels.length ? 'has' : ''}" title="Labels">#</button>
        <button type="button" class="prio" title="${PRIORITIES[task.priority]} (click to change)">P${task.priority}</button>
        ${where === 'calendar' ? '' : '<button type="button" class="del" title="Delete">×</button>'}
        ${where === 'calendar' ? '<div class="resize" title="Drag to change length"></div>' : ''}
      </div>`;
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('.card[data-task]');
    if (!card) return;
    const id = card.dataset.task;

    if (e.target.matches('.check')) {
      const title = Tasks.get(id).title;
      Tasks.toggleDone(id);
      return App.toast(`Done: “${title}”`, 'Undo', () => Tasks.toggleDone(id));
    }
    if (e.target.matches('.prio')) return Tasks.cyclePriority(id);
    if (e.target.matches('.lbl-btn, .tag')) return Labels.openPicker(id, e.target);
    if (e.target.matches('.del')) {
      const removed = Tasks.remove(id);
      return App.toast(`Deleted “${removed.title}”`, 'Undo', () => Tasks.restore(removed));
    }
  });

  // Double-click a title to rename. Enter saves, Escape cancels, clicking away saves.
  document.addEventListener('dblclick', e => {
    const title = e.target.closest('.card[data-task] .title');
    if (!title) return;
    const card = title.closest('.card');
    const id = card.dataset.task;
    card.draggable = false;
    title.contentEditable = 'true';
    title.focus();
    document.getSelection().selectAllChildren(title);

    const finish = save => {
      title.removeEventListener('keydown', onKey);
      title.removeEventListener('blur', onBlur);
      const text = title.textContent.trim();
      const parsed = App.parseQuickAdd(text);   // "!1" and "#p" typed while renaming work too
      const task = Tasks.get(id);
      const changes = {};
      if (parsed.title && parsed.title !== task.title) changes.title = parsed.title;
      if (parsed.priority) changes.priority = parsed.priority;
      if (parsed.labels.some(l => !task.labels.includes(l))) changes.labels = [...new Set([...task.labels, ...parsed.labels])];
      if (save && Object.keys(changes).length) Tasks.update(id, changes);
      else App.renderAll();
    };
    const onKey = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') finish(false);
    };
    const onBlur = () => finish(true);
    title.addEventListener('keydown', onKey);
    title.addEventListener('blur', onBlur);
  });

  return { html };
})();
