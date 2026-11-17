// auth.js — sign in, create an account, sign out. Two ways in, same account:
//
//   1. Email + password. "Create account" first proves you own the email (we email you),
//      and only then is the password saved. This also gives a password to people whose account
//      was made by email sign-in, and resets a forgotten password (after the same email check).
//   2. Email sign-in ("Email me a sign-in link/code"): no password at all.
//
// What the email contains depends on EMAIL_HAS_CODE in supabase-config.js:
//   false → a link only (Supabase's built-in email, which can't be customised).
//           "Create account": the link brings you back to this page with ?finish=signup,
//           where you confirm your password.
//   true  → a 6-digit code AND a link (needs custom SMTP + {{ .Token }} in the Magic Link
//           template). Type the code here — works everywhere, even a double-clicked index.html.
//
// Supabase remembers the sign-in in this browser, so you only do it once per device.

const Auth = (() => {
  const signinView = document.getElementById('signin');
  const signinForm = document.getElementById('signin-form');
  const emailInput = document.getElementById('signin-email');
  const passwordInput = document.getElementById('signin-password');
  const sentForm = document.getElementById('code-form');        // "check your email" step
  const codeInput = document.getElementById('code-input');
  const codeSubmit = sentForm.querySelector('button[type="submit"]');
  const finishForm = document.getElementById('finish-form');    // link mode: confirm password
  const message = document.getElementById('signin-message');
  const isFile = location.protocol === 'file:';
  const FINISH_PARAM = 'finish=signup';
  let email = '';
  let newPassword = null;   // set during "Create account": saved once the email is confirmed

  // Say "code" or "link" on the sign-in screen, depending on what the email contains.
  signinForm.querySelector('button[value="code"]').textContent =
    EMAIL_HAS_CODE ? 'Email me a sign-in code' : 'Email me a sign-in link';
  codeInput.hidden = codeSubmit.hidden = !EMAIL_HAS_CODE;
  codeInput.required = EMAIL_HAS_CODE;

  // Where the emailed link should land. A file on disk can't be a link target, so then
  // it goes to the public site. "Create account" links come back with ?finish=signup.
  function linkTarget() {
    const base = isFile ? SITE_URL : location.origin + location.pathname;
    return newPassword ? `${base}?${FINISH_PARAM}` : base;
  }

  async function currentUser() {
    const { data: { session } } = await db.auth.getSession();
    return session ? session.user : null;
  }

  function showSignIn() {
    signinView.hidden = false;
    document.getElementById('app').hidden = true;
    emailInput.focus();
  }

  function showApp(user) {
    signinView.hidden = true;
    document.getElementById('app').hidden = false;
    document.getElementById('user-email').textContent = user.email;
  }

  // ---- sign-in screen: one form, three buttons --------------------------

  signinForm.addEventListener('submit', async e => {
    e.preventDefault();
    const action = e.submitter ? e.submitter.value : 'signin';   // Enter key = "Sign in"
    email = emailInput.value.trim();
    const password = passwordInput.value;

    if (action !== 'code' && password.length < 6) {
      message.textContent = 'Enter a password of at least 6 characters (or use the email sign-in below).';
      passwordInput.focus();
      return;
    }

    setBusy(signinForm, true);
    if (action === 'signin') await signInWithPassword(password);
    if (action === 'signup') { newPassword = password; await sendEmail(); }
    if (action === 'code') { newPassword = null; await sendEmail(); }
    setBusy(signinForm, false);
  });

  async function signInWithPassword(password) {
    message.textContent = 'Signing in…';
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (!error) return location.reload();
    message.textContent = error.message === 'Invalid login credentials'
      ? 'Wrong email or password. No password yet, or forgot it? Click "Create account" to set one (we\'ll email you first to check it\'s you).'
      : `Could not sign in: ${error.message}`;
  }

  async function sendEmail() {
    message.textContent = 'Sending…';
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: linkTarget() } });
    if (error) {
      message.textContent = `Could not send the email: ${error.message}`;
      return;
    }
    signinForm.hidden = true;
    sentForm.hidden = false;
    if (EMAIL_HAS_CODE) {
      codeInput.value = '';
      codeInput.focus();
      codeSubmit.textContent = newPassword ? 'Verify email & create account' : 'Sign in';
      message.textContent = newPassword
        ? `We emailed ${email} a code. Type it here to confirm it's your email and finish creating your account.`
        : `We emailed ${email} a code${isFile ? '' : ' and a sign-in link'}. Type the code here${isFile ? '' : ', or just click the link'}.`;
    } else {
      message.textContent = newPassword
        ? `We emailed ${email} a link. Click it to confirm it's your email, then confirm your password to finish creating your account.`
        : `We emailed ${email} a sign-in link. Click it to sign in. You can close this tab.`;
    }
  }

  // ---- code step (only when EMAIL_HAS_CODE) ------------------------------

  sentForm.addEventListener('submit', async e => {
    e.preventDefault();
    setBusy(sentForm, true);
    message.textContent = 'Checking…';
    const { error } = await db.auth.verifyOtp({ email, token: codeInput.value.trim(), type: 'email' });
    setBusy(sentForm, false);
    if (error) {
      message.textContent = 'That code did not work. Check it, or request a new one.';
      return;
    }
    if (newPassword) await savePassword(newPassword);   // email confirmed: save the chosen password
    location.reload();   // now signed in: start the app fresh
  });

  document.getElementById('code-back').addEventListener('click', () => {
    sentForm.hidden = true;
    signinForm.hidden = false;
    newPassword = null;
    message.textContent = '';
    emailInput.focus();
  });

  // ---- link step: back from a "Create account" link, confirm the password ----

  function isFinishingSignup() {
    return location.search.includes(FINISH_PARAM);
  }

  function showFinishSignup(user) {
    signinView.hidden = false;
    document.getElementById('app').hidden = true;
    signinForm.hidden = true;
    finishForm.hidden = false;
    message.textContent = `Email confirmed for ${user.email}. Enter your password once more to finish creating your account.`;
    document.getElementById('finish-password').focus();
  }

  finishForm.addEventListener('submit', async e => {
    e.preventDefault();
    setBusy(finishForm, true);
    message.textContent = 'Saving your password…';
    await savePassword(document.getElementById('finish-password').value);
    history.replaceState(null, '', location.pathname);   // drop ?finish=signup
    location.reload();
  });

  document.getElementById('finish-skip').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    location.reload();
  });

  async function savePassword(password) {
    const { error } = await db.auth.updateUser({ password });
    // "same as the old password" is fine; anything else, say so (they are signed in either way)
    if (error && !/different from the old/i.test(error.message)) {
      alert(`You're signed in, but the password could not be saved: ${error.message}`);
    }
    newPassword = null;
  }

  // ---- signed in: sign out ----------------------------------------------

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
  });

  function setBusy(form, busy) {
    form.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  }

  return { currentUser, showSignIn, showApp, isFinishingSignup, showFinishSignup };
})();
