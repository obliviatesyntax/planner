// auth.js — sign in, create an account, sign out. Two ways in, same account:
//
//   1. Email + password. "Create account" first proves you own the email: we email a code,
//      you type it in, and only then is the password saved. This also works for people whose
//      account was made by signing in with a code (it gives them a password), and for anyone
//      who forgot their password (it replaces it, after the same email check).
//   2. Emailed code ("Email me a sign-in code"): no password at all.
//
// Both use ONE email (Supabase's "Magic Link" template) containing
//   • a 6-digit code: type it into this page (works everywhere, even a double-clicked index.html)
//   • a sign-in link: click it to open the site signed in (only for plain sign-in; it can't
//     finish creating a password, so "Create account" asks for the code)
// Set the email's wording in Supabase: Authentication → Emails → Magic Link. It must contain
// {{ .Token }} (the code) and {{ .ConfirmationURL }} (the link).
//
// Supabase remembers the sign-in in this browser, so you only do it once per device.

const Auth = (() => {
  const signinView = document.getElementById('signin');
  const signinForm = document.getElementById('signin-form');
  const emailInput = document.getElementById('signin-email');
  const passwordInput = document.getElementById('signin-password');
  const codeForm = document.getElementById('code-form');
  const codeInput = document.getElementById('code-input');
  const message = document.getElementById('signin-message');
  const isFile = location.protocol === 'file:';
  // Where emailed links should land. A file on disk can't be a link target, so then
  // Supabase uses the project's Site URL instead.
  const linkOptions = isFile ? {} : { emailRedirectTo: location.origin + location.pathname };
  let email = '';
  let newPassword = null;   // set during "Create account": saved once the email code checks out

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
      message.textContent = 'Enter a password of at least 6 characters (or use the emailed code below).';
      passwordInput.focus();
      return;
    }

    setBusy(signinForm, true);
    if (action === 'signin') await signInWithPassword(password);
    if (action === 'signup') await signUp(password);
    if (action === 'code') { newPassword = null; await sendCode(); }
    setBusy(signinForm, false);
  });

  async function signInWithPassword(password) {
    message.textContent = 'Signing in…';
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (!error) return location.reload();
    message.textContent = error.message === 'Invalid login credentials'
      ? 'Wrong email or password. No password yet, or forgot it? Click "Create account" to set one (we\'ll email you a code first).'
      : `Could not sign in: ${error.message}`;
  }

  // "Create account": check the email first (code), the password is saved after that.
  async function signUp(password) {
    newPassword = password;
    await sendCode();
  }

  async function sendCode() {
    message.textContent = 'Sending…';
    const { error } = await db.auth.signInWithOtp({ email, options: linkOptions });
    if (error) {
      message.textContent = `Could not send the email: ${error.message}`;
      return;
    }
    signinForm.hidden = true;
    codeForm.hidden = false;
    codeInput.value = '';
    codeInput.focus();
    codeForm.querySelector('button[type="submit"]').textContent = newPassword ? 'Verify email & create account' : 'Sign in';
    message.textContent = newPassword
      ? `We emailed ${email} a code. Type it here to confirm it's your email and finish creating your account.`
      : `We emailed ${email} a code${isFile ? '' : ' and a sign-in link'}. Type the code here${isFile ? '' : ', or just click the link'}.`;
  }

  // ---- code step --------------------------------------------------------

  codeForm.addEventListener('submit', async e => {
    e.preventDefault();
    setBusy(codeForm, true);
    message.textContent = 'Checking…';
    const { error } = await db.auth.verifyOtp({ email, token: codeInput.value.trim(), type: 'email' });
    setBusy(codeForm, false);
    if (error) {
      message.textContent = 'That code did not work. Check it, or request a new one.';
      return;
    }
    if (newPassword) {   // email confirmed: now save the password chosen in "Create account"
      message.textContent = 'Saving your password…';
      const { error: pwError } = await db.auth.updateUser({ password: newPassword });
      // "same as the old password" is fine; anything else, say so (they are signed in either way)
      if (pwError && !/different from the old/i.test(pwError.message)) {
        alert(`You're signed in, but the password could not be saved: ${pwError.message}`);
      }
      newPassword = null;
    }
    location.reload();   // now signed in: start the app fresh
  });

  document.getElementById('code-back').addEventListener('click', () => {
    codeForm.hidden = true;
    signinForm.hidden = false;
    newPassword = null;
    message.textContent = '';
    emailInput.focus();
  });

  // ---- signed in: sign out ----------------------------------------------

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
  });

  function setBusy(form, busy) {
    form.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  }

  return { currentUser, showSignIn, showApp };
})();
