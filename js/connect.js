// connect.js — the "Use Planner from Claude, ChatGPT or Gemini" window (#connect-dialog in
// index.html). Any button with data-connect opens it: on the landing page and in the app's footer.
// The server it describes is supabase/functions/mcp; signing in goes through js/consent.js.

(() => {
  const dialog = document.getElementById('connect-dialog');

  document.addEventListener('click', e => {
    if (e.target.closest('[data-connect]')) dialog.showModal();
  });

  dialog.addEventListener('click', async e => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close();   // outside or ×
    const copy = e.target.closest('[data-copy]');
    if (!copy) return;
    const url = document.getElementById('connect-url').textContent;
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Copied';
    } catch {
      getSelection().selectAllChildren(document.getElementById('connect-url'));   // copy by hand
      copy.textContent = 'Press ⌘C';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1800);
  });
})();
