// settings.js — per-person preferences, behind the ⚙ Settings button in the header.
//
// Saved on the person's Supabase account (auth "user metadata"), so they follow you to every
// device and browser. No database table needed. Read anywhere with Settings.get('name').
//
// To add a setting: add it to OPTIONS below (with its group and default), then use
// Settings.get() where it matters. The settings window draws itself from GROUPS + OPTIONS.

const Settings = (() => {
  const VIEW_CHOICES = PLAN_VIEWS.map(v => [v.id, v.days ? `Calendar: ${v.label}` : v.label]);

  // Blocks in the settings window, top to bottom ("account" is drawn by hand: name, password).
  const GROUPS = [
    { id: 'account', title: 'Account' },
    { id: 'plan', title: 'Plan view' },
    { id: 'tasks', title: 'New tasks' },
    { id: 'day', title: 'End of the day' },
  ];

  const OPTIONS = [
    { group: 'plan', key: 'defaultViewDesktop', label: 'On a computer, open in', default: 'cal2', choices: VIEW_CHOICES },
    { group: 'plan', key: 'defaultViewPhone', label: 'On a phone, open in', default: 'cal1',
      choices: VIEW_CHOICES.filter(([id]) => id !== 'week') },   // no week view on phones
    { group: 'plan', key: 'minHours', label: 'Calendar shows at least', default: 4,
      choices: [4, 5, 6, 7, 8, 9].map(h => [h, `${h} hours`]) },
    { group: 'plan', key: 'weekStart', label: 'Week starts on', default: 'mon',
      choices: [['mon', 'Monday'], ['sun', 'Sunday']] },
    { group: 'plan', key: 'clock', label: 'Time format', default: '12',
      choices: [['12', '1:30 PM'], ['24', '13:30']] },
    { group: 'tasks', key: 'defaultPriority', label: 'Priority', default: 0,
      choices: [[0, 'None (set it when needed)'], [1, 'P1 · must do'], [2, 'P2 · should do'], [3, 'P3 · nice to have']] },
    { group: 'tasks', key: 'defaultDuration', label: 'Length on the calendar', default: 30,
      choices: [15, 30, 45, 60, 90].map(m => [m, `${m} minutes`]) },
    { group: 'day', key: 'rolloverTo', label: 'Unfinished planned tasks go to', default: 'overdue',
      choices: [['overdue', '@overdue, to re-plan'], ['nextDay', "The next day's to-do list"]] },
  ];

  // Bump when a default changes and existing accounts should get the new default too.
  //   2: "New tasks get priority" became None (it used to be P2).
  //   3: "Calendar shows at least" back to 4 hours (it was 6; the window is now 4–9 hours).
  //   4: one default view per device: the old "Plan opens in" becomes the computer one;
  //      phones open in 1 day.
  const VERSION = 4;

  let values = Object.fromEntries(OPTIONS.map(o => [o.key, o.default]));
  let user = null;

  // Called at start-up with the signed-in user.
  function load(signedIn) {
    user = signedIn;
    const saved = (user && user.user_metadata && user.user_metadata.settings) || {};
    OPTIONS.forEach(o => { if (saved[o.key] !== undefined) values[o.key] = saved[o.key]; });
    if (values.rolloverTo === 'triage') values.rolloverTo = 'overdue';   // older setting name
    if (saved.defaultView && saved.defaultViewDesktop === undefined) values.defaultViewDesktop = saved.defaultView;
    const version = saved.version || 1;
    if (values.defaultViewPhone === 'week') values.defaultViewPhone = 'cal2';   // week isn't offered on phones
    // Remember this device's time zone on the account, so the Claude connector
    // (supabase/functions/mcp) knows what "today" is for you.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (user && timeZone && (user.user_metadata || {}).time_zone !== timeZone) db.auth.updateUser({ data: { time_zone: timeZone } });
    if (version < VERSION && Object.keys(saved).length) {
      if (version < 2) values.defaultPriority = 0;   // version 2: everyone starts with "None"
      if (version < 3) values.minHours = 4;          // version 3: 4–9 hour calendar window
      if (version < 4) values.defaultViewPhone = 'cal1';   // version 4: phones open in 1 day
      save();
    }
  }

  async function save() {
    const { error } = await db.auth.updateUser({ data: { settings: { ...values, version: VERSION } } });
    if (error) App.toast(`Could not save the setting: ${error.message}`);
  }

  function get(key) { return values[key]; }

  async function set(key, value) {
    const option = OPTIONS.find(o => o.key === key);
    values[key] = typeof option.default === 'number' ? Number(value) : value;
    const deviceKey = window.matchMedia('(max-width: 700px)').matches ? 'defaultViewPhone' : 'defaultViewDesktop';
    if (key === deviceKey) Planner.setView(values[key]);   // the view for this device: switch now
    App.renderAll();
    await save();
  }

  // ---- the settings window -------------------------------------------------

  const dialog = document.getElementById('settings-dialog');

  function open() {
    dialog.innerHTML = `
      <form method="dialog" class="settings">
        <div class="settings-head">
          <h2>Settings</h2>
          <button type="submit" class="icon-btn" title="Close">×</button>
        </div>
        ${GROUPS.map(g => `
          <section class="settings-block">
            <h3>${g.title}</h3>
            ${g.id === 'account' ? accountHtml() : OPTIONS.filter(o => o.group === g.id).map(optionHtml).join('')}
          </section>`).join('')}
        <p class="muted settings-note">Saved to your account, so they apply on every device.</p>
      </form>`;
    dialog.showModal();
  }

  function accountHtml() {
    const name = Auth.displayName(user) === user.email ? '' : Auth.displayName(user);
    return `
      <label class="setting">
        <span>First name</span>
        <input id="set-first-name" maxlength="40" autocomplete="given-name" value="${escapeHtml(name)}" placeholder="Your first name">
      </label>
      <div class="setting">
        <span>Password</span>
        <button type="button" id="set-password" class="secondary">Email me a link to set a new password</button>
      </div>
      <div class="setting-signout">
        <span class="setting-sub">Signed in as ${escapeHtml(user.email)}</span>
        <button type="button" id="set-signout" class="secondary">Sign out</button>
      </div>`;
  }

  function optionHtml(o) {
    return `
      <label class="setting">
        <span>${o.label}</span>
        <select data-key="${o.key}">
          ${o.choices.map(([v, text]) => `<option value="${v}" ${String(values[o.key]) === String(v) ? 'selected' : ''}>${text}</option>`).join('')}
        </select>
      </label>`;
  }

  dialog.addEventListener('change', async e => {
    if (e.target.matches('select[data-key]')) set(e.target.dataset.key, e.target.value);
    if (e.target.id === 'set-first-name') {
      const name = e.target.value.trim();
      const { data, error } = await db.auth.updateUser({ data: { first_name: name } });
      if (error) return App.toast(`Could not save your name: ${error.message}`);
      user = data.user;
      Auth.showApp(user);   // header greeting
      App.toast('Name saved.');
    }
  });

  // Same flow as "Forgot password?": an email with a link to choose a new password.
  dialog.addEventListener('click', async e => {
    if (e.target.id === 'set-signout') {   // same as "Sign out" in the footer
      await db.auth.signOut();
      return location.reload();
    }
    if (e.target.id !== 'set-password') return;
    const error = await Auth.sendPasswordReset(user.email);
    App.toast(error ? `Could not send the email: ${error.message}` : `We emailed ${user.email} a link to set a new password.`);
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // click outside closes
  document.getElementById('settings-btn').addEventListener('click', open);          // gear, top right
  document.getElementById('footer-settings-btn').addEventListener('click', open);   // bottom of the page

  return { load, get };
})();
