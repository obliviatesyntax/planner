// auth.js — the sign-in screen: two tabs, Sign in and Create account.
//
// Sign in
//   • Continue with Google / Apple / Facebook — only the providers turned on in Supabase
//     (Authentication → Sign In / Providers) are shown; the page asks Supabase which ones.
//   • Continue with email → then: password, or "Email me a sign-in link instead",
//     or "Forgot password?" (emails a link to choose a new one).
// Create account
//   • First name + email + password → Supabase stores the account and emails a confirmation
//     link; clicking it confirms the address and signs you in. (If "Confirm email" is turned off
//     in Supabase, you're signed in straight away.)
//
// When EMAIL_HAS_CODE is true (custom SMTP + {{ .Token }} in the email template), the sign-in
// email also has a 6-digit code you can type here — useful when the page is a local file.
// Supabase remembers the sign-in in this browser, so you only do it once per device.

const Auth = (() => {
  const $ = id => document.getElementById(id);
  const message = $('signin-message');
  const isFile = location.protocol === 'file:';
  const RESET_PARAM = 'finish=reset';
  let email = '';
  let lastSend = null;    // the last email we sent, so "Send it again" can repeat it

  // Where links in emails / from Google etc. should come back to. A file on disk can't be
  // a link target, so then it's the public site.
  const home = () => (isFile ? SITE_URL : location.origin + location.pathname);

  async function currentUser() {
    const { data: { session } } = await db.auth.getSession();
    return session ? session.user : null;
  }

  // "Navin" from the sign-up form, or from Google/Apple/Facebook; else the email.
  function displayName(user) {
    const m = user.user_metadata || {};
    return m.first_name || (m.full_name || m.name || '').split(' ')[0] || user.email;
  }

  function showApp(user) {
    $('signin').hidden = true;
    $('app').hidden = false;
    $('user-email').textContent = displayName(user);
    $('user-email').title = user.email;
  }

  // ---- panes ---------------------------------------------------------------

  const PANES = ['signin-form', 'password-form', 'signup-form', 'sent-pane', 'newpass-form'];
  function showPane(id, text = '') {
    PANES.forEach(p => { $(p).hidden = p !== id; });
    const choosing = id === 'signin-form' || id === 'signup-form';
    $('auth-tabs').hidden = !choosing;
    $('oauth-buttons').hidden = !choosing;
    $('oauth-or').hidden = !choosing || !$('oauth-buttons').children.length;
    say(text);
    const first = $(id).querySelector('input:not([hidden])');
    if (first) first.focus();
  }
  function say(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function showSignIn() {
    $('signin').hidden = false;
    $('app').hidden = true;
    showPane('signin-form');
    loadProviders();
  }

  $('auth-tabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    $('auth-tabs').querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('active', t === tab));
    showPane(tab.dataset.tab === 'signup' ? 'signup-form' : 'signin-form');
  });

  document.querySelectorAll('#signin [data-back]').forEach(b => b.addEventListener('click', () => {
    $('auth-tabs').querySelector('[data-tab="signin"]').click();
  }));

  // ---- Google / Apple / Facebook ---------------------------------------------

  const PROVIDERS = {
    google: { name: 'Google', icon: '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>' },
    apple: { name: 'Apple', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>' },
    facebook: { name: 'Facebook', icon: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>' },
  };

  // Ask Supabase which providers are turned on, and show a button for each.
  async function loadProviders() {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      const enabled = (await res.json()).external || {};
      $('oauth-buttons').innerHTML = Object.entries(PROVIDERS).filter(([id]) => enabled[id])
        .map(([id, p]) => `<button type="button" class="oauth-btn" data-provider="${id}">${p.icon}<span>Continue with ${p.name}</span></button>`)
        .join('');
    } catch (err) {
      $('oauth-buttons').innerHTML = '';   // offline etc.: email still works
    }
    $('oauth-or').hidden = $('oauth-buttons').hidden || !$('oauth-buttons').children.length;
  }

  $('oauth-buttons').addEventListener('click', async e => {
    const btn = e.target.closest('[data-provider]');
    if (!btn) return;
    const { error } = await db.auth.signInWithOAuth({ provider: btn.dataset.provider, options: { redirectTo: home() } });
    if (error) say(`Could not continue with ${PROVIDERS[btn.dataset.provider].name}: ${error.message}`, true);
  });

  // ---- sign in with email --------------------------------------------------------

  $('signin-form').addEventListener('submit', e => {
    e.preventDefault();
    email = $('signin-email').value.trim();
    $('who-email').textContent = email;
    showPane('password-form');
  });

  $('password-form').addEventListener('submit', async e => {
    e.preventDefault();
    busy($('password-form'), true);
    say('Signing in…');
    const { error } = await db.auth.signInWithPassword({ email, password: $('signin-password').value });
    busy($('password-form'), false);
    if (!error) return location.reload();
    if (/not confirmed/i.test(error.message)) {
      lastSend = { kind: 'confirm' };
      showPane('sent-pane');
      $('code-form').hidden = true;
      return sentText(`Please confirm your email first: we sent a link to ${email} when you signed up.`);
    }
    say(error.message === 'Invalid login credentials'
      ? 'Wrong email or password. Try again, or use a sign-in link or "Forgot password?" below.'
      : `Could not sign in: ${error.message}`, true);
  });

  $('send-link-btn').addEventListener('click', () => send({ kind: 'link' }));
  $('forgot-btn').addEventListener('click', () => send({ kind: 'reset' }));
  $('resend-btn').addEventListener('click', () => lastSend && send(lastSend));

  // Sends one of our emails and shows the "check your email" pane.
  async function send(what) {
    lastSend = what;
    say('Sending…');
    let error;
    if (what.kind === 'link') {
      // shouldCreateUser: false — signing in shouldn't quietly create accounts; that's the other tab.
      ({ error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: home() } }));
    } else if (what.kind === 'reset') {
      ({ error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${home()}?${RESET_PARAM}` }));
    } else if (what.kind === 'confirm') {
      ({ error } = await db.auth.resend({ type: 'signup', email, options: { emailRedirectTo: home() } }));
    }
    if (error) {
      return say(/signups not allowed|not found/i.test(error.message)
        ? `There's no account for ${email} yet. Create one in the "Create account" tab.`
        : `Could not send the email: ${error.message}`, true);
    }
    showPane('sent-pane');
    const withCode = EMAIL_HAS_CODE && what.kind === 'link';
    $('code-form').hidden = !withCode;
    if (withCode) $('code-input').focus();
    sentText({
      link: withCode ? `We emailed ${email} a sign-in link and a code. Click the link, or type the code here.`
                     : `We emailed ${email} a sign-in link. Click it to sign in; you can close this tab.`,
      reset: `We emailed ${email} a link to choose a new password.`,
      confirm: `We sent a new confirmation link to ${email}.`,
    }[what.kind]);
  }
  function sentText(text) { $('sent-text').textContent = text; }

  $('code-form').addEventListener('submit', async e => {
    e.preventDefault();
    say('Checking…');
    const { error } = await db.auth.verifyOtp({ email, token: $('code-input').value.trim(), type: 'email' });
    if (error) return say('That code did not work. Check it, or send a new one.', true);
    location.reload();
  });

  // ---- create account ---------------------------------------------------------------

  $('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    email = $('signup-email').value.trim();
    busy($('signup-form'), true);
    say('Creating your account…');
    const { data, error } = await db.auth.signUp({
      email,
      password: $('signup-password').value,
      options: { data: { first_name: $('signup-name').value.trim() }, emailRedirectTo: home() },
    });
    busy($('signup-form'), false);
    if (error) return say(`Could not create the account: ${error.message}`, true);
    if (data.session) return location.reload();   // "Confirm email" is off in Supabase: straight in
    // Supabase doesn't say outright that an email is taken (privacy); an empty identity list means it is.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return say(`${email} already has an account. Sign in instead (use "Forgot password?" if you don't have one).`, true);
    }
    lastSend = { kind: 'confirm' };
    showPane('sent-pane');
    $('code-form').hidden = true;
    sentText(`Almost there! We emailed ${email} a link to confirm your address. Click it and you're in.`);
  });

  // ---- back from a "Forgot password" email: choose a new one -------------------------

  function needsNewPassword() { return location.search.includes(RESET_PARAM); }

  function showNewPassword(user) {
    $('signin').hidden = false;
    $('app').hidden = true;
    showPane('newpass-form', `Signed in as ${user.email}.`);
  }

  $('newpass-form').addEventListener('submit', async e => {
    e.preventDefault();
    busy($('newpass-form'), true);
    const { error } = await db.auth.updateUser({ password: $('newpass').value });
    busy($('newpass-form'), false);
    if (error && !/different from the old/i.test(error.message)) return say(`Could not save: ${error.message}`, true);
    history.replaceState(null, '', location.pathname);   // drop ?finish=reset
    location.reload();
  });

  // ---- signed in: sign out ------------------------------------------------------------

  $('signout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
  });

  function busy(form, on) { form.querySelectorAll('button').forEach(b => { b.disabled = on; }); }

  return { currentUser, showSignIn, showApp, needsNewPassword, showNewPassword };
})();
