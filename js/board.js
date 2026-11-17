// board.js — draws the board (columns = when, rows = work/personal) and handles
// clicks, inline editing and drag & drop on it.

const Board = (() => {
  const root = document.getElementById('board-view');
  let addingIn = null;   // "bucket|area" of the cell currently showing an inline add box
  let dragId = null;     // id of the task being dragged
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';

  // ---- rendering -------------------------------------------------------

  function render() {
    root.innerHTML = `
      <div class="board" style="--cols:${BUCKETS.length}">
        <div class="corner"></div>
        ${BUCKETS.map(headHtml).join('')}
        ${AREAS.map(area => `
          <div class="lane-head lane-${area.id}"><span>${area.label}</span></div>
          ${BUCKETS.map(b => cellHtml(b.id, area.id)).join('')}
        `).join('')}
      </div>`;
    const input = root.querySelector('.cell-add-input');
    if (input) input.focus();
  }

  function headHtml(bucket) {
    const n = Tasks.openCount(bucket.id);
    return `<div class="col-head ${bucket.id === 'today' ? 'is-today' : ''}" data-bucket="${bucket.id}">
      ${bucket.label}${n ? ` <span class="count">${n}</span>` : ''}
    </div>`;
  }

  function cellHtml(bucket, area) {
    const key = bucket + '|' + area;
    return `<div class="cell ${bucket === 'today' ? 'is-today' : ''}" data-bucket="${bucket}" data-area="${area}">
      ${Tasks.inCell(bucket, area).map(cardHtml).join('')}
      ${addingIn === key
        ? `<input class="cell-add-input" placeholder="New task — Enter to add, Esc to close">`
        : `<button type="button" class="cell-add">+ Add</button>`}
    </div>`;
  }

  function cardHtml(task) {
    return `<div class="card p${task.priority} ${task.doneOn ? 'done' : ''}" draggable="true" data-id="${task.id}">
      <input type="checkbox" class="check" ${task.doneOn ? 'checked' : ''} title="Mark done">
      <span class="title" title="Double-click to rename">${escapeHtml(task.title)}</span>
      <button type="button" class="prio" title="${PRIORITIES[task.priority]} — click to change">P${task.priority}</button>
      <button type="button" class="del" title="Delete">×</button>
    </div>`;
  }

  // Briefly highlight a card (e.g. right after adding it).
  function flash(id) {
    const card = root.querySelector(`.card[data-id="${id}"]`);
    if (card) card.classList.add('flash');
  }

  // ---- clicks ----------------------------------------------------------

  root.addEventListener('click', e => {
    const card = e.target.closest('.card');
    const id = card && card.dataset.id;

    if (e.target.matches('.check')) return Tasks.toggleDone(id);
    if (e.target.matches('.prio'))  return Tasks.cyclePriority(id);
    if (e.target.matches('.del')) {
      const removed = Tasks.remove(id);
      return App.toast(`Deleted “${removed.title}”`, 'Undo', () => Tasks.restore(removed));
    }
    if (e.target.matches('.cell-add')) {
      const cell = e.target.closest('.cell');
      addingIn = cell.dataset.bucket + '|' + cell.dataset.area;
      render();
    }
  });

  // Inline add box inside a cell
  root.addEventListener('keydown', e => {
    if (!e.target.matches('.cell-add-input')) return;
    const cell = e.target.closest('.cell');
    if (e.key === 'Enter') {
      const task = Tasks.add({ title: e.target.value, bucket: cell.dataset.bucket, area: cell.dataset.area, priority: 2 });
      if (task) flash(task.id);    // box stays open so you can add several in a row
    } else if (e.key === 'Escape') {
      addingIn = null;
      render();
    }
  });

  root.addEventListener('focusout', e => {
    if (!e.target.matches('.cell-add-input') || !e.target.isConnected) return;
    if (!e.target.value.trim()) { addingIn = null; render(); }
  });

  // Double-click a title to rename it
  root.addEventListener('dblclick', e => {
    const title = e.target.closest('.title');
    if (!title) return;
    const id = title.closest('.card').dataset.id;
    title.closest('.card').draggable = false;
    title.contentEditable = 'true';
    title.focus();
    document.getSelection().selectAllChildren(title);

    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      const value = title.textContent.trim();
      if (save && value) Tasks.update(id, { title: value });
      else render();
    };
    title.addEventListener('keydown', ev => {
      if (ev.key === 'Enter')  { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { finish(false); }
    });
    title.addEventListener('blur', () => finish(true));
  });

  // ---- drag & drop -----------------------------------------------------
  // Drop on a cell to put a task exactly there, or on a column header to send it
  // to that column (same lane, at the bottom).

  root.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  root.addEventListener('dragend', () => {
    dragId = null;
    clearDragStyles();
  });

  root.addEventListener('dragover', e => {
    if (!dragId) return;
    const cell = e.target.closest('.cell');
    const head = e.target.closest('.col-head');
    if (!cell && !head) return;
    e.preventDefault();
    if (head) {
      clearDragStyles(true);
      head.classList.add('drag-over');
      return;
    }
    root.querySelectorAll('.drag-over').forEach(el => { if (el !== cell) el.classList.remove('drag-over'); });
    cell.classList.add('drag-over');
    const before = cardBelow(cell, e.clientY);
    const anchor = before || cell.querySelector('.cell-add, .cell-add-input');
    if (indicator.nextSibling !== anchor || indicator.parentNode !== cell) cell.insertBefore(indicator, anchor);
  });

  root.addEventListener('drop', e => {
    if (!dragId) return;
    const cell = e.target.closest('.cell');
    const head = e.target.closest('.col-head');
    e.preventDefault();
    if (cell) {
      const before = cardBelow(cell, e.clientY);
      Tasks.move(dragId, cell.dataset.bucket, cell.dataset.area, before ? before.dataset.id : null);
    } else if (head) {
      const task = Tasks.get(dragId);
      Tasks.move(dragId, head.dataset.bucket, task.area, null);
      App.toast(`Moved to ${bucketLabel(head.dataset.bucket)}`);
    }
  });

  // The first card whose middle is below the mouse — we drop just above it.
  function cardBelow(cell, y) {
    const cards = [...cell.querySelectorAll('.card:not(.dragging)')];
    return cards.find(c => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    }) || null;
  }

  function clearDragStyles(keepDragging) {
    indicator.remove();
    root.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (!keepDragging) root.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }

  return { render, flash };
})();
