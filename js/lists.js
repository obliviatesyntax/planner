// lists.js — the bottom section: your lists. New tasks without a day land in @triage; make your
// own with "+ New list" or by typing "@name" in quick add ("Renew passport @weekly" creates
// @weekly if needed). Drag a list's header to reorder; click it to open the list window, where you
// rename it or delete it (and its tasks, with Undo). Drag a task up to a day or a time to commit.
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
              <div class="list-head ${isTriage ? '' : 'openable'}" ${isTriage ? '' : `draggable="true" data-list-drag="${l.id}" title="Click to rename or delete · drag to reorder"`}>
                <span class="list-name">@${escapeHtml(l.name)}</span>
                <span class="count">${tasks.length}</span>
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
    const head = e.target.closest('.list-head.openable');
    if (head) openList(head.dataset.listDrag);
  });

  // ---- the list window: click a list's header to rename or delete it -------------
  // (@triage and @overdue are built in: they can't be renamed or deleted.)

  const dialog = document.getElementById('list-dialog');
  let openId = null;

  function openList(id) {
    openId = id;
    const l = Tasks.list(id);
    const n = Tasks.listTasks(id).length;
    dialog.innerHTML = `
      <form method="dialog" class="taskview listview">
        <div class="tv-head">
          <span class="tv-where">☰ List · ${n} task${n === 1 ? '' : 's'}</span>
          <button type="submit" class="icon-btn" title="Close">×</button>
        </div>
        <div class="lv-name"><span>@</span><input class="lv-input" maxlength="30" value="${escapeHtml(l.name)}" aria-label="List name"></div>
        <p class="lv-hint">One word, letters and digits; camelCase is fine (e.g. kitchenReno).</p>
        <div class="tv-foot">
          <button type="button" class="tv-delete">Delete list${n ? ` and its ${n} task${n === 1 ? '' : 's'}` : ''}</button>
          <span class="muted tv-saved">Changes save automatically</span>
        </div>
      </form>`;
    dialog.showModal();
  }

  function saveName() {
    const input = dialog.querySelector('.lv-input');
    if (!input || !openId) return;
    const l = Tasks.list(openId);
    const name = input.value.trim().replace(/^@/, '');
    if (!l || name === l.name) return;
    const result = Tasks.renameList(openId, name);
    if (typeof result === 'string') { App.toast(result); input.value = l.name; }
  }

  dialog.addEventListener('keydown', e => {
    if (e.target.matches('.lv-input') && e.key === 'Enter') { e.preventDefault(); saveName(); dialog.close(); }
  });
  dialog.addEventListener('focusout', e => { if (e.target.matches('.lv-input')) saveName(); });
  dialog.addEventListener('click', e => {
    if (e.target === dialog) return dialog.close();
    if (!e.target.closest('.tv-delete')) return;
    const l = Tasks.list(openId);
    const n = Tasks.listTasks(openId).length;
    if (n && !confirm(`Delete @${l.name} and its ${n} task${n === 1 ? '' : 's'}?`)) return;
    const removed = Tasks.removeList(openId);
    openId = null;
    dialog.close();
    App.toast(`Deleted @${l.name}`, 'Undo', () => Tasks.restoreList(removed));
  });
  dialog.addEventListener('close', () => { saveName(); openId = null; });

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
