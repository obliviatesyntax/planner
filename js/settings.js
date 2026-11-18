// settings.js — per-person preferences, behind the ⚙ Settings button in the header.
//
// Saved on the person's Supabase account (auth "user metadata"), so they follow you to every
// device and browser. No database table needed. Read anywhere with Settings.get('name').
//
// To add a setting: add it to OPTIONS below (and its default), then use Settings.get() where it
// matters. The settings window draws itself from OPTIONS.

const Settings = (() => {
  const OPTIONS = [
    { key: 'defaultView', label: 'Plan opens in', default: 'cal2',
      choices: PLAN_VIEWS.map(v => [v.id, v.days ? `Calendar: ${v.label}` : v.label]) },
    { key: 'rolloverTo', label: 'At the end of the day, unfinished planned tasks go to', default: 'overdue',
      choices: [['overdue', '@overdue, to re-plan'], ['nextDay', "The next day's to-do list"]] },
    { key: 'weekStart', label: 'Week starts on', default: 'mon',
      choices: [['mon', 'Monday'], ['sun', 'Sunday']] },
    { key: 'clock', label: 'Time format', default: '12',
      choices: [['12', '1:30 PM'], ['24', '13:30']] },
    { key: 'minHours', label: 'Calendar shows at least', default: 6,
      choices: [4, 6, 8, 10, 12].map(h => [h, `${h} hours`]) },
    { key: 'defaultDuration', label: 'New calendar tasks last', default: 30,
      choices: [15, 30, 45, 60, 90].map(m => [m, `${m} minutes`]) },
    { key: 'defaultPriority', label: 'New tasks get priority', default: 0,
      choices: [[0, 'None (set it when needed)'], [1, 'P1 · must do'], [2, 'P2 · should do'], [3, 'P3 · nice to have']] },
  ];

  // Bump when a default changes and existing accounts should get the new default too.
  //   2: "New tasks get priority" became None (it used to be P2).
  const VERSION = 2;

  let values = Object.fromEntries(OPTIONS.map(o => [o.key, o.default]));
  let user = null;

  // Called at start-up with the signed-in user.
  function load(signedIn) {
    user = signedIn;
    const saved = (user && user.user_metadata && user.user_metadata.settings) || {};
    OPTIONS.forEach(o => { if (saved[o.key] !== undefined) values[o.key] = saved[o.key]; });
    if (values.rolloverTo === 'triage') values.rolloverTo = 'overdue';   // older setting name
    if ((saved.version || 1) < VERSION && Object.keys(saved).length) {
      values.defaultPriority = 0;   // version 2: everyone starts with "None"
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
    if (key === 'defaultView') Planner.setView(values[key]);
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
        <div class="settings-group">
          <label class="setting">
            <span>First name</span>
            <input id="set-first-name" maxlength="40" autocomplete="given-name" value="${escapeHtml(Auth.displayName(user) === user.email ? '' : Auth.displayName(user))}" placeholder="Your first name">
          </label>
          <div class="setting">
            <span>Password</span>
            <button type="button" id="set-password" class="secondary">Email me a link to set a new password</button>
          </div>
        </div>
        ${OPTIONS.map(o => `
          <label class="setting">
            <span>${o.label}</span>
            <select data-key="${o.key}">
              ${o.choices.map(([v, text]) => `<option value="${v}" ${String(values[o.key]) === String(v) ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
          </label>`).join('')}
        <p class="muted settings-note">Saved to your account, so they apply on every device.</p>
      </form>`;
    dialog.showModal();
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
    if (e.target.id !== 'set-password') return;
    const error = await Auth.sendPasswordReset(user.email);
    App.toast(error ? `Could not send the email: ${error.message}` : `We emailed ${user.email} a link to set a new password.`);
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // click outside closes
  document.getElementById('settings-btn').addEventListener('click', open);

  return { load, get };
})();
