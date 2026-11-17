// labels.js — the label chips at the top: filter by label, create and delete labels.
//
// Nothing selected ("All") = every task shows. Select one or more labels = only tasks that
// have at least one of them show, everywhere on the main page.

const Labels = (() => {
  const bar = document.getElementById('labels-bar');
  let selected = new Set();
  let adding = false;     // is the "new label" box open?

  function matches(task) {
    return !selected.size || task.labels.some(id => selected.has(id));
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
          <button type="button" class="chip-del" title="Delete this label">×</button>
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

  // Small coloured tags shown on cards.
  function tagsHtml(task) {
    return task.labels.map(id => Tasks.label(id)).filter(Boolean)
      .map(l => `<span class="tag" style="--c:${l.color}" title="${escapeHtml(l.name)}">#${l.shortcut}</span>`).join('');
  }

  return { render, matches, selectedIds, tagsHtml };
})();
