// lists.js — the bottom section: your lists. New tasks without a day land in @triage; make your
// own with "+ New list" or by typing "@name" in quick add ("Renew passport @weekly" creates
// @weekly if needed). Drag a list's header to reorder; click it to open the list window, where you
// rename it, give it a label, or delete it (and its tasks, with Undo). Drag a task up to a day or a
// time to commit; if the list has a label, the task picks it up then.
//
// Lists sit in fixed columns, dealt in order (see render()).
//
// @overdue is not drawn here: it sits next to the plan, above Done today (planner.js), so its
// coming and going never shifts your lists around.

const Lists = (() => {
  const root = document.getElementById('lists');
  let creating = false;   // is the "new list" box open?

  // Lists are dealt into fixed columns in order: list 1 into column 1, list 2 into column 2…,
  // then round again under them (2 columns: 1 3 5 in the first, 2 4 6 in the second). So the
  // order always reads left to right, then down, a drop lands exactly where you drop it, and
  // each column stacks tightly (no holes under short lists). Re-dealt when the width changes.
  const MIN_COL = 260, GAP = 10;   // wide enough that most task names fit on one line
  let columns = 0;
  function columnCount() {
    const pad = getComputedStyle(root);
    const width = root.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    return Math.max(1, Math.floor((width + GAP) / (MIN_COL + GAP)));
  }

  function render() {
    columns = columnCount();
    const items = Tasks.allLists().map(listHtml)
      .map((html, i) => html.replace('class="list-col', `data-order="${i}" class="list-col`));
    // "+ New list" takes the spot the next list would get (dealt like a list, always last).
    items.push(`
      <div class="list-new">
        ${creating
          ? '<input class="list-new-input" placeholder="@listName, Enter" maxlength="31">'
          : '<button type="button" class="list-new-btn">+ New list</button>'}
      </div>`);
    const cols = Array.from({ length: columns }, (_, c) => items.filter((_, i) => i % columns === c).join(''));
    root.innerHTML = `
      <div class="section-head">
        <h2>Lists</h2>
      </div>
      <div class="lists-board" style="--cols:${columns}">
        ${cols.map(html => `<div class="lists-stack">${html}</div>`).join('')}
      </div>`;
    if (creating) root.querySelector('.list-new-input').focus();
  }
  // Re-deal when the width changes (but not before the first real draw, when there's no data yet).
  new ResizeObserver(() => { if (columns && columnCount() !== columns) render(); }).observe(root);

  function listHtml(l) {
    const tasks = Tasks.listTasks(l.id).filter(Labels.matches);
    const isTriage = l.id === TRIAGE_LIST.id;   // always first: not draggable
    // A project also counts its tasks already planned on a day (they're shown on the plan).
    const planned = isTriage ? 0 : Tasks.projectTasks(l.id).planned.filter(Labels.matches).length;
    return `
      <div class="list-col" data-drop="list" data-list="${l.id}">
        <div class="list-head ${isTriage ? '' : 'openable'}" ${isTriage ? '' : `data-list-open="${l.id}" draggable="true" data-list-drag="${l.id}" title="Click to open the project · drag to reorder"`}>
          <span class="list-name">@${escapeHtml(l.name)}</span>
          ${listTagHtml(l)}
          <span class="count" title="${tasks.length} not planned yet">${tasks.length}</span>
          ${planned ? `<span class="planned-count" title="${planned} more from this project planned on a day">+${planned} planned</span>` : ''}
        </div>
        <div class="list">${tasks.map(t => Cards.html(t, 'list')).join('')}</div>
        <button type="button" class="col-add" data-list="${l.id}">+ Add</button>
      </div>`;
  }

  // The list's label, shown next to its name ("@kitchenReno #p").
  function listTagHtml(l) {
    const lab = l.label && Tasks.label(l.label);
    return lab ? `<span class="tag" style="--c:${lab.color}" title="Tasks moved from this list onto a day get #${escapeHtml(lab.shortcut)}">#${escapeHtml(lab.shortcut)}</span>` : '';
  }

  root.addEventListener('click', e => {
    if (e.target.closest('.list-new-btn')) { creating = true; return render(); }
    const head = e.target.closest('.list-head.openable');
    if (head) location.hash = Project.href(Tasks.list(head.dataset.listOpen));   // the project page (project.js)
  });

  root.addEventListener('keydown', e => {
    if (!e.target.matches('.list-new-input')) return;
    if (e.key === 'Escape') { creating = false; return render(); }
    if (e.key !== 'Enter') return;
    const result = Tasks.addList(e.target.value);
    if (typeof result === 'string') return App.toast(result);
    creating = false;
    render();
  });

  root.addEventListener('focusout', e => {
    if (e.target.matches('.list-new-input') && !e.target.value.trim()) { creating = false; render(); }
  });

  return { render };
})();
