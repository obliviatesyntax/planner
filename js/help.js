// help.js — the "i" button next to quick add: a popup with every way to add a task.
// The examples live in index.html (#help-dialog); this fills in your own lists
// and handles opening/closing. Press "?" anywhere (when not typing) to open it too.

const Help = (() => {
  const dialog = document.getElementById('help-dialog');

  function open() {
    const lists = Tasks.allLists().map(l => `<code>@${escapeHtml(l.name)}</code>`);
    document.getElementById('help-yours').innerHTML =
      `Your lists: ${lists.join(' ')}.`;
    dialog.showModal();
  }

  document.getElementById('help-btn').addEventListener('click', open);
  dialog.addEventListener('click', e => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();   // outside or ×
  });
  document.addEventListener('keydown', e => {
    const typing = e.target.matches('input, select, textarea, [contenteditable="true"]');
    if (!typing && e.key === '?' && !dialog.open) { e.preventDefault(); open(); }
  });

  return { open };
})();
