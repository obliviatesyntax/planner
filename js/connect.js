// connect.js — the "Use Planner from Claude, ChatGPT or Gemini" window (#connect-dialog in
// index.html). Any button with data-connect opens it: on the landing page and in the app's footer.
// Per-app steps are <details> (click to open); the example questions copy when clicked.
// The server it describes is supabase/functions/mcp; signing in goes through js/consent.js.

(() => {
  const dialog = document.getElementById('connect-dialog');

  document.addEventListener('click', e => {
    if (e.target.closest('[data-connect]')) dialog.showModal();
  });

  dialog.addEventListener('click', async e => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close();   // outside or ×
    // "Copy" next to the server URL, or an example question (copied to paste into the AI app).
    const copy = e.target.closest('[data-copy], [data-ask]');
    if (!copy) return;
    const isUrl = copy.matches('[data-copy]');
    const source = isUrl ? document.getElementById('connect-url') : copy;
    const label = copy.textContent;
    try {
      await navigator.clipboard.writeText(source.textContent.trim());
      if (isUrl) copy.textContent = 'Copied';
      copy.classList.add('copied');
    } catch {
      getSelection().selectAllChildren(source);   // clipboard blocked: select it to copy by hand
      if (isUrl) copy.textContent = 'Press ⌘C';
    }
    setTimeout(() => { copy.textContent = label; copy.classList.remove('copied'); }, 1500);
  });
})();
