// cards.js — how one task looks, and what clicking on it does (anywhere on the page).
//
//   checkbox  → mark done / not done (planned and done tasks; or drag a task onto "Done today")
//   P1/P2/P3  → click to cycle priority
//   # / tags  → click to pick labels (labels.js → openPicker)
//   ×         → delete (lists and to-do lists), with Undo
//   title     → double-click to rename; shortcuts work there too ("… p1 #p" sets priority, adds label)
//   drag      → see dnd.js

const Cards = (() => {
  // where: "list" | "plan" | "calendar" | "done"
  // style: position (calendar blocks); size: "short" / "short tiny" for short calendar blocks.
  function html(task, where, style = '', size = '') {
    const timed = task.startMin != null;
    const time = timed ? `${formatTime(task.startMin)}${where === 'calendar' ? `–${formatTime(task.startMin + task.duration)}` : ''}` : '';
    const p = task.priority || 0;   // 0 = no priority set
    const canDelete = where === 'list' || where === 'plan';
    const hasLabels = Tasks.allLabels().length > 0;   // no labels exist yet: no "#" button
    return `
      <div class="card p${p} ${where === 'calendar' ? `event ${size}` : ''} ${where === 'done' ? 'done' : ''}" draggable="true"
           data-task="${task.id}" ${style ? `style="${style}"` : ''}>
        ${where === 'list' ? '' : `<input type="checkbox" class="check" ${where === 'done' ? 'checked title="Mark as not done"' : 'title="Mark done"'}>`}
        <div class="body">
          ${time && where !== 'calendar' ? `<span class="time">${time}</span>` : ''}
          <span class="title">${escapeHtml(task.title)}</span>
          ${where === 'calendar' ? `<span class="time">${time}</span>` : ''}
          ${Labels.tagsHtml(task)}
        </div>
        <!-- Priority is always last and never moves. The hover buttons (× #) float over the
             text just left of it, on a see-through background, so nothing reflows. -->
        <button type="button" class="prio" title="${PRIORITIES[p]} (click to change)">${p ? `P${p}` : 'P–'}</button>
        ${canDelete || hasLabels ? `<div class="card-actions">
          ${hasLabels ? '<button type="button" class="lbl-btn" title="Labels">#</button>' : ''}
          ${canDelete ? '<button type="button" class="del" title="Delete">×</button>' : ''}
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
      const parsed = App.parseQuickAdd(text, { lists: false });   // "p1" and "#p" typed while renaming work too
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
