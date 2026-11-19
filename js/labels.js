// labels.js — the label chips at the top: filter by label, create and delete labels.
//
// Nothing selected ("All") = every task shows. Select one or more labels = only tasks that
// have at least one of them show, everywhere on the main page. A task waiting in a list with
// a label (the list window sets it) counts as having that label too.

const Labels = (() => {
  const bar = document.getElementById('labels-bar');
  let selected = new Set();
  let adding = false;     // is the "new label" box open?

  // A task waiting in a list also counts as having that list's label (e.g. everything in
  // @salesDeck #w shows under Work), so tasks don't need to repeat their list's label.
  // Once it's on a day it has the label itself (it's added when the task is moved there).
  function matches(task) {
    if (!selected.size) return true;
    const list = !task.planDate && Tasks.list(task.list);
    return task.labels.some(id => selected.has(id)) || Boolean(list && list.label && selected.has(list.label));
  }

  function selectedIds() { return [...selected]; }

  function render() {
    const labels = Tasks.allLabels();
    selected = new Set([...selected].filter(id => labels.some(l => l.id === id)));   // forget deleted ones

    bar.innerHTML = `
      <button type="button" class="chip chip-all ${selected.size ? '' : 'active'}" data-all>All</button>
      ${labels.map(l => `
        <span class="chip ${selected.has(l.id) ? 'active' : ''}" style="--c:${l.color}" data-id="${l.id}"
              title="Show only ${escapeHtml(l.name)} tasks. Type #${l.shortcut} in quick add to use this label.">
          <span class="dot"></span>${escapeHtml(l.name)} <span class="sc">#${l.shortcut}</span>
          <button type="button" class="chip-del" title="Delete this label"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
        </span>`).join('')}
      ${adding
        ? `<input class="label-input" placeholder="Name, e.g. Personal #p" maxlength="40">`
        : `<button type="button" class="chip chip-add" title="New label">+</button>`}
      ${!labels.length && !adding ? '<span class="muted hint">Add labels like Work or Personal to filter tasks</span>' : ''}`;

    if (adding) bar.querySelector('.label-input').focus();
  }

  bar.addEventListener('click', e => {
    if (e.target.closest('[data-all]')) { selected.clear(); return App.renderAll(); }
    if (e.target.closest('.chip-add')) { adding = true; return render(); }

    const chip = e.target.closest('.chip[data-id]');
    if (!chip) return;
    const id = chip.dataset.id;
    if (e.target.closest('.chip-del')) {
      const l = Tasks.label(id);
      if (confirm(`Delete the label "${l.name}"? Tasks keep everything else, they just lose this label.`)) {
        Tasks.removeLabel(id);
      }
      return;
    }
    selected.has(id) ? selected.delete(id) : selected.add(id);
    App.renderAll();
  });

  // New label box: "Personal #p" → name "Personal", shortcut "p". Without "#…" a shortcut is picked.
  bar.addEventListener('keydown', e => {
    if (!e.target.matches('.label-input')) return;
    if (e.key === 'Escape') { adding = false; return render(); }
    if (e.key !== 'Enter') return;
    const text = e.target.value;
    const match = text.match(/#(\w+)/);
    const name = text.replace(/#\w+/g, '').trim();
    const result = Tasks.addLabel(name, match ? match[1] : '');
    if (typeof result === 'string') return App.toast(result);
    adding = false;
    render();
    App.toast(`Label "${result.name}" added. Type #${result.shortcut} in quick add to use it.`);
  });

  bar.addEventListener('focusout', e => {
    if (e.target.matches('.label-input') && !e.target.value.trim()) { adding = false; render(); }
  });

  // ---- label picker: click "#" (or a tag) on a card to add/remove its labels ----
  // Only tick existing labels here; new labels are made with "+" in the bar at the top.
  // (The "#" button only shows on cards once at least one label exists.)

  const picker = document.createElement('div');
  picker.className = 'label-picker';
  picker.hidden = true;
  document.body.appendChild(picker);
  let pickerTask = null;

  function openPicker(taskId, anchor) {
    pickerTask = taskId;
    renderPicker();
    picker.hidden = false;
    const r = anchor.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - picker.offsetWidth - 8);
    picker.style.left = `${Math.max(8, left) + window.scrollX}px`;
    picker.style.top = `${r.bottom + 4 + window.scrollY}px`;
  }

  function renderPicker() {
    const task = Tasks.get(pickerTask);
    if (!task) return closePicker();
    picker.innerHTML = `
      <div class="lp-title">Labels for “${escapeHtml(task.title)}”</div>
      ${Tasks.allLabels().map(l => `
        <button type="button" class="lp-item ${task.labels.includes(l.id) ? 'on' : ''}" data-id="${l.id}" style="--c:${l.color}">
          <span class="lp-box"></span>${escapeHtml(l.name)} <span class="sc">#${l.shortcut}</span>
        </button>`).join('')}`;
  }

  function closePicker() { picker.hidden = true; pickerTask = null; }

  picker.addEventListener('click', e => {
    const item = e.target.closest('.lp-item');
    if (!item) return;
    const task = Tasks.get(pickerTask);
    const id = item.dataset.id;
    Tasks.update(task.id, { labels: task.labels.includes(id) ? task.labels.filter(x => x !== id) : [...task.labels, id] });
    renderPicker();
  });

  picker.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });

  // Click anywhere else (or press Escape) to close.
  document.addEventListener('mousedown', e => {
    if (!picker.hidden && !picker.contains(e.target) && !e.target.closest('.lbl-btn, .card .tag')) closePicker();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !picker.hidden) closePicker(); });

  // Small coloured tags shown on cards.
  function tagsHtml(task) {
    return task.labels.map(id => Tasks.label(id)).filter(Boolean)
      .map(l => `<span class="tag" style="--c:${l.color}" title="${escapeHtml(l.name)}">#${l.shortcut}</span>`).join('');
  }

  return { render, matches, selectedIds, tagsHtml, openPicker };
})();
