// consent.js — "Allow Claude to use your Planner?": the OAuth consent page.
//
// When you connect Planner in Claude (or another AI app), Supabase's OAuth server
// (Authentication → OAuth Server, "Authorization Path" = /index.html) sends you here as
// index.html?authorization_id=…  Signed in, you see who's asking and Allow / Deny; Supabase then
// hands the app a token to use Planner as you (see supabase/functions/mcp).
//
// Signed out: the normal sign-in shows first. The request is remembered for 10 minutes, so it
// carries on after signing in, even through an emailed link or Google.

const Consent = (() => {
  const KEY = 'planner.pendingAuthorization';
  const MAX_AGE = 10 * 60 * 1000;   // Supabase's authorization requests last 10 minutes
  const $ = id => document.getElementById(id);

  function pending() {
    if (PLAYGROUND) return null;
    const fromUrl = new URLSearchParams(location.search).get('authorization_id');
    if (fromUrl) { remember(fromUrl); return fromUrl; }
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && Date.now() - saved.at < MAX_AGE) return saved.id;
    } catch { /* storage blocked: only the URL counts */ }
    return null;
  }
  function remember(id) { try { localStorage.setItem(KEY, JSON.stringify({ id, at: Date.now() })); } catch { /* fine */ } }
  function forget() {
    try { localStorage.removeItem(KEY); } catch { /* fine */ }
    if (location.search.includes('authorization_id')) history.replaceState(null, '', location.pathname);
  }

  // Signed out: the landing page's sign-in card, with a note saying why.
  function askToSignIn() {
    Auth.showSignIn();
    const note = $('signin-message');
    note.textContent = 'Sign in to connect Planner to your AI app.';
    note.classList.remove('error');
    $('auth').scrollIntoView({ block: 'center' });
  }

  function page(html) {
    $('signin').hidden = true;
    $('app').hidden = true;
    $('consent').hidden = false;
    $('consent-card').innerHTML = html;
  }

  async function show(user, id) {
    page('<p class="muted">Loading…</p>');
    const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) {
      forget();
      return page(`<h1>This link has expired</h1>
        <p class="muted">Connection requests only last a few minutes. Start connecting again from your AI app.</p>
        <a class="primary consent-btn" href="./">Open Planner</a>`);
    }
    if (data.redirect_url && !data.authorization_id) {   // you allowed this app before: straight back
      forget();
      return location.assign(data.redirect_url);
    }
    const name = escapeHtml((data.client && data.client.name) || 'An app');
    let site = '';
    try { site = new URL(data.redirect_uri).host; } catch { /* no address to show */ }
    page(`
      <h1>Allow <b>${name}</b> to use your Planner?</h1>
      <p>${name} will be able to use Planner as you: see your tasks, lists and labels${site ? `, and send you back to <b>${escapeHtml(site)}</b>` : ''}.</p>
      <ul class="consent-list">
        <li>Only allow apps you trust.</li>
        <li>Right now, Planner's connector can only read. It can't add, change or delete anything.</li>
      </ul>
      <p class="muted consent-who">Signed in as ${escapeHtml(user.email || '')} · <button type="button" class="link-btn" data-consent="switch">Not you?</button></p>
      <div class="consent-actions">
        <button type="button" class="secondary consent-btn" data-consent="deny">Deny</button>
        <button type="button" class="primary consent-btn" data-consent="allow">Allow</button>
      </div>
      <p class="signin-message" id="consent-message"></p>`);

    $('consent-card').onclick = async e => {
      const action = e.target.closest('[data-consent]')?.dataset.consent;
      if (!action) return;
      if (action === 'switch') { await db.auth.signOut(); return location.reload(); }   // still remembered
      $('consent-card').querySelectorAll('button').forEach(b => { b.disabled = true; });
      const call = action === 'allow' ? db.auth.oauth.approveAuthorization : db.auth.oauth.denyAuthorization;
      const { data: result, error: err } = await call.call(db.auth.oauth, id);
      if (err || !result || !result.redirect_url) {
        $('consent-message').textContent = `Something went wrong: ${err ? err.message : 'no answer'}. Try connecting again from your AI app.`;
        $('consent-message').classList.add('error');
        return;
      }
      forget();
      location.assign(result.redirect_url);   // back to the AI app (with a code, or "denied")
    };
  }

  return { pending, askToSignIn, show };
})();
