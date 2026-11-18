// lists.js — the bottom section: your lists. New tasks without a day land in @triage; make your
// own with "+ New list" or by typing "@name" in quick add ("Renew passport @weekly" creates
// @weekly if needed). Drag a list's header to reorder; the trash icon deletes a list and its tasks (with Undo).
// Drag a task up to a day or a time when you commit to it.
//
// @overdue (built in) comes first, but only while it has tasks: yesterday's unfinished ones.
// Move each to a day or another list and it disappears. You can't add to it or drop into it.

const Lists = (() => {
  const root = document.getElementById('lists');
  let creating = false;   // is the "new list" box open?

  function render() {
    root.innerHTML = `
      <div class="section-head">
        <h2>Lists</h2>
        <span class="muted">Not planned yet. Drag a task up to a day or a time when you commit to it.</span>
      </div>
      <div class="lists-grid">
        ${overdueHtml()}
        ${Tasks.allLists().map(l => {
          const tasks = Tasks.listTasks(l.id).filter(Labels.matches);
          const isTriage = l.id === TRIAGE_LIST.id;
          return `
            <div class="list-col" data-drop="list" data-list="${l.id}">
              <div class="list-head" ${isTriage ? '' : `draggable="true" data-list-drag="${l.id}" title="Drag to reorder"`}>
                <span class="list-name">@${escapeHtml(l.name)}</span>
                <span class="count">${tasks.length}</span>
                ${isTriage ? '' : '<button type="button" class="list-del" title="Delete list and its tasks"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>'}
              </div>
              <div class="list">${tasks.map(t => Cards.html(t, 'list')).join('')}</div>
              <button type="button" class="col-add" data-list="${l.id}">+ Add</button>
            </div>`;
        }).join('')}
        <div class="list-new">
          ${creating
            ? '<input class="list-new-input" placeholder="@listName, Enter" maxlength="31">'
            : '<button type="button" class="list-new-btn">+ New list</button>'}
        </div>
      </div>`;
    if (creating) root.querySelector('.list-new-input').focus();
  }

  // The @overdue column: no drop target, no "+ Add", no delete, not draggable.
  function overdueHtml() {
    const all = Tasks.listTasks(OVERDUE_LIST.id);
    if (!all.length) return '';
    const tasks = all.filter(Labels.matches);
    return `
      <div class="list-col overdue-col" data-list="${OVERDUE_LIST.id}">
        <div class="list-head">
          <span class="list-name">@overdue</span>
          <span class="count">${all.length}</span>
        </div>
        <p class="overdue-note">Not done in time. Drag each to a day or a list; this list goes away once it's empty.</p>
        <div class="list">${tasks.map(t => Cards.html(t, 'list')).join('')}</div>
      </div>`;
  }

  root.addEventListener('click', e => {
    if (e.target.closest('.list-new-btn')) { creating = true; return render(); }
    const del = e.target.closest('.list-del');
    if (!del) return;
    const id = del.closest('.list-col').dataset.list;
    const l = Tasks.list(id);
    const n = Tasks.listTasks(id).length;
    if (!confirm(`Delete @${l.name}${n ? ` and its ${n} task${n === 1 ? '' : 's'}` : ''}?`)) return;
    const removed = Tasks.removeList(id);
    App.toast(`Deleted @${l.name}`, 'Undo', () => Tasks.restoreList(removed));
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
