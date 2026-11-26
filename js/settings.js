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
    { id: 'labels', title: 'Labels' },
    { id: 'plan', title: 'Plan view' },
    { id: 'tasks', title: 'New tasks' },
    { id: 'day', title: 'End of the day' },
    { id: 'archive', title: 'Archive & trash' },
  ];

  const OPTIONS = [
    { group: 'plan', key: 'defaultViewDesktop', label: 'On a computer, open in', default: 'cal2', choices: VIEW_CHOICES },
    { group: 'plan', key: 'defaultViewPhone', label: 'On a phone, open in', default: 'cal1',
      choices: VIEW_CHOICES.filter(([id]) => id !== 'week') },   // no week view on phones
    { group: 'plan', key: 'minHours', label: 'Calendar shows at least', default: 4,
      choices: [4, 5, 6, 7, 8].map(h => [h, `${h} hours`]) },
    { group: 'plan', key: 'weekStart', label: 'Week starts on', default: 'mon',
      choices: [['mon', 'Monday'], ['sun', 'Sunday']] },
    { group: 'plan', key: 'clock', label: 'Time format', default: '12',
      choices: [['12', '1:30 PM'], ['24', '13:30']] },
    { group: 'tasks', key: 'defaultPriority', label: 'Priority', default: 0,
      choices: [[0, 'None (set it when needed)'], [1, 'P1 · must do'], [2, 'P2 · should do'], [3, 'P3 · nice to have']] },
    { group: 'tasks', key: 'defaultDuration', label: 'Length on the calendar', default: 30,
      choices: [15, 30, 45, 60, 90].map(m => [m, `${m} minutes`]) },
    { group: 'day', key: 'rolloverTo', label: 'Unfinished planned tasks go to', default: 'overdue',
      choices: [['overdue', 'Overdue, to re-plan'], ['nextDay', "The next day's to-do list"]] },
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
    if (values.minHours > 8) values.minHours = 8;   // the calendar window is now 4–8 hours
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
            ${g.id === 'account' ? accountHtml() : g.id === 'labels' ? `<div id="set-labels">${labelsHtml()}</div>` : g.id === 'archive' ? `<div id="set-archive">${archiveHtml()}</div>` : OPTIONS.filter(o => o.group === g.id).map(optionHtml).join('')}
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

  // ---- Settings → Labels: rename, change shortcut or colour, delete, add ---------------------
  // (Works the same on phones, where label chips have no hover buttons. Labels themselves live in
  // tasks.js: addLabel / updateLabel / removeLabel.)
  const TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  function labelsHtml() {
    return `
      ${Tasks.allLabels().map(l => `
        <div class="set-label" data-label="${l.id}">
          <button type="button" class="set-label-color" style="--c:${l.color}" title="Change colour" aria-label="Change colour"></button>
          <input class="set-label-name" value="${escapeHtml(l.name)}" maxlength="40" aria-label="Label name">
          <span class="set-label-hash">#</span><input class="set-label-sc" value="${escapeHtml(l.shortcut)}" maxlength="12" aria-label="Shortcut">
          <button type="button" class="set-label-del" title="Delete this label" aria-label="Delete">${TRASH}</button>
        </div>`).join('')}
      ${Tasks.allLabels().length ? '' : '<p class="setting-sub">No labels yet. Labels like Work or Personal let you colour-code tasks and show just one kind at a time.</p>'}
      <input class="set-label-new" placeholder="New label, e.g. Personal #p" maxlength="40">
      <p class="setting-sub">Type <b>#shortcut</b> in quick add to give a task that label.</p>`;
  }
  function refreshLabels() { const box = dialog.querySelector('#set-labels'); if (box) box.innerHTML = labelsHtml(); }

  function saveLabelField(input) {
    const row = input.closest('.set-label');
    const result = Tasks.updateLabel(row.dataset.label, input.matches('.set-label-name') ? { name: input.value } : { shortcut: input.value });
    if (typeof result === 'string') { App.toast(result); refreshLabels(); }
  }

  dialog.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('.set-label-name, .set-label-sc, .set-label-new')) return;
    e.preventDefault();   // Enter would otherwise submit the form and close the window
    if (e.target.matches('.set-label-new')) {
      const text = e.target.value;
      const match = text.match(/#(\w+)/);
      const result = Tasks.addLabel(text.replace(/#\w+/g, '').trim(), match ? match[1] : '');
      if (typeof result === 'string') return App.toast(result);
      refreshLabels();
      dialog.querySelector('.set-label-new').focus();
    } else e.target.blur();   // saves on blur (change)
  });
  dialog.addEventListener('change', e => {
    if (e.target.matches('.set-label-name, .set-label-sc')) saveLabelField(e.target);
  });
  dialog.addEventListener('click', e => {
    const row = e.target.closest('.set-label');
    if (!row) return;
    const l = Tasks.label(row.dataset.label);
    if (e.target.closest('.set-label-color')) {   // next colour in the palette
      Tasks.updateLabel(l.id, { color: LABEL_COLORS[(LABEL_COLORS.indexOf(l.color) + 1) % LABEL_COLORS.length] });
      return refreshLabels();
    }
    if (e.target.closest('.set-label-del') && confirm(`Delete the label "${l.name}"? Tasks keep everything else, they just lose this label.`)) {
      Tasks.removeLabel(l.id);
      refreshLabels();
    }
  });

  // ---- Settings → Archive & trash: archived projects, and deleted tasks (kept 30 days) ----------
  function archiveHtml() {
    const archived = Tasks.archivedLists();
    const trash = Tasks.trashed();
    const when = iso => { const d = toISO(new Date(iso)); return d === todayISO() ? 'today' : formatDay(d); };
    return `
      <h4 class="set-sub">Archived projects</h4>
      ${archived.length ? archived.map(l => {
        const { waiting, planned, done } = Tasks.projectTasks(l.id);
        const n = waiting.length + planned.length + done.length;
        return `<div class="set-row" data-list="${l.id}">
          <span class="set-row-main"><b>@${escapeHtml(l.name)}</b> <span class="setting-sub">${n} task${n === 1 ? '' : 's'}</span></span>
          <a class="link-btn" href="${Project.href(l)}" data-close-settings>Open</a>
          <button type="button" class="secondary set-unarchive">Unarchive</button>
        </div>`;
      }).join('') : '<p class="setting-sub">No archived projects. Archive one from its page (the box button next to 🗑) to hide it from the Dashboard without losing anything.</p>'}
      <h4 class="set-sub">Deleted tasks <span class="setting-sub">kept for 30 days</span></h4>
      ${trash.length ? `${trash.map(t => {
        const l = Tasks.list(t.list);
        return `<div class="set-row" data-trash="${t.id}">
          <span class="set-row-main">${escapeHtml(t.title)} <span class="setting-sub">deleted ${when(t.deletedAt)}${l ? ` · from @${escapeHtml(l.name)}` : ''}</span></span>
          <button type="button" class="secondary set-restore">Restore</button>
          <button type="button" class="link-btn set-forever" title="Delete for good">Delete forever</button>
        </div>`;
      }).join('')}
      <button type="button" class="secondary set-empty-trash">Empty trash (${trash.length})</button>` : '<p class="setting-sub">Nothing deleted in the last 30 days.</p>'}`;
  }
  function refreshArchive() { const box = dialog.querySelector('#set-archive'); if (box) box.innerHTML = archiveHtml(); }

  dialog.addEventListener('click', e => {
    if (e.target.closest('[data-close-settings]')) return dialog.close();   // "Open" an archived project
    const listRow = e.target.closest('.set-row[data-list]');
    if (listRow && e.target.closest('.set-unarchive')) {
      Tasks.setArchived(listRow.dataset.list, false);
      App.toast(`@${Tasks.list(listRow.dataset.list).name} is back on the Dashboard`);
      return refreshArchive();
    }
    const trashRow = e.target.closest('.set-row[data-trash]');
    const task = trashRow && Tasks.trashed().find(t => t.id === trashRow.dataset.trash);
    if (task && e.target.closest('.set-restore')) {
      Tasks.restore(task);
      const l = Tasks.list(task.list);
      App.toast(`Restored “${task.title}”${task.planDate || task.doneOn ? '' : ` to @${l.name}`}`);
      return refreshArchive();
    }
    if (task && e.target.closest('.set-forever') && confirm(`Delete “${task.title}” for good? This can't be undone.`)) {
      Tasks.purge([task.id]);
      return refreshArchive();
    }
    if (e.target.closest('.set-empty-trash')) {
      const n = Tasks.trashed().length;
      if (confirm(`Delete all ${n} task${n === 1 ? '' : 's'} in the trash for good? This can't be undone.`)) { Tasks.purge(); refreshArchive(); }
    }
  });

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
  // "Settings → Labels" links elsewhere (e.g. the list window): close that window, open Settings at Labels.
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-open-settings]')) return;
    e.target.closest('dialog')?.close();
    open();
    dialog.querySelector('#set-labels')?.closest('.settings-block').scrollIntoView({ block: 'start' });
    dialog.querySelector('.set-label-new')?.focus({ preventScroll: true });
  });

  return { load, get };
})();
