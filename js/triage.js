// triage.js — the bottom section: every new task lands here first, in one of four buckets.
// Drag a task up into a day's plan list or onto the calendar to commit to it.

const Triage = (() => {
  const root = document.getElementById('triage');

  function render() {
    root.innerHTML = `
      <div class="section-head"><h2>Triage</h2>
        <span class="muted">New tasks land here. Drag one up to a day or a time when you commit to it.</span></div>
      <div class="triage-grid">
        ${TRIAGE.map(b => {
          const tasks = Tasks.triageList(b.id).filter(Labels.matches);
          return `
            <div class="triage-col" data-drop="triage" data-bucket="${b.id}">
              <div class="col-head">${b.label} <span class="count">${tasks.length}</span></div>
              <div class="list">${tasks.map(t => Cards.html(t, 'triage')).join('')}</div>
              <button type="button" class="col-add" data-bucket="${b.id}">+ Add</button>
            </div>`;
        }).join('')}
      </div>`;
  }

  return { render };
})();
