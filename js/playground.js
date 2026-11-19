// playground.js — the try-it-out page (playground.html). Loaded INSTEAD of supabase-config.js,
// auth.js and store.js: the real app runs on top of it, but there is no account and no database.
// Everything lives in memory and is gone on reload. It starts with the tasks from the landing
// page's animation, placed around today's date and the current time.

// No Supabase here. Settings and "first name" call db.auth.updateUser: accept and keep in memory.
const playgroundUser = { email: 'playground', user_metadata: { first_name: 'Guest' } };
const db = {
  auth: {
    async updateUser({ data }) {
      Object.assign(playgroundUser.user_metadata, data);
      return { data: { user: playgroundUser }, error: null };
    },
  },
};

const Auth = (() => {
  const $ = id => document.getElementById(id);
  return {
    currentUser: async () => playgroundUser,
    needsNewPassword: () => false,
    showApp(user) {
      $('app').hidden = false;
      $('user-email').textContent = this.displayName(user);
      $('user-email').title = 'Playground: nothing is saved';
    },
    displayName: user => user.user_metadata.first_name || 'Guest',
    sendPasswordReset: async () => ({ message: 'there are no accounts in the playground' }),
  };
})();

// Same shape as js/store.js, but saving does nothing.
const Store = (() => {
  function load() {
    const today = todayISO(), tomorrow = addDays(today, 1), yesterday = addDays(today, -1);
    // Calendar times near "now", so they're in view (the calendar starts an hour before now).
    const nextHour = Math.min(Math.max(Math.floor(minutesNow() / 60) + 1, 8), 20) * 60;

    const labels = [
      { id: 'lbl-w', name: 'Work', shortcut: 'w', color: '#5f3dc4', order: 0 },
      { id: 'lbl-p', name: 'Personal', shortcut: 'p', color: '#2b8a3e', order: 1 },
    ];
    const lists = [
      { ...TRIAGE_LIST, order: -1 },
      { id: 'l-sales', name: 'salesDeck', order: 0, label: 'lbl-w' },
      { id: 'l-kitchen', name: 'kitchenReno', order: 1 },
      { id: 'l-bird', name: 'birdhouse', order: 2 },
    ];
    let n = 0;
    const task = (title, fields = {}) => ({
      id: `pg${n}`, title, priority: null, labels: [], list: TRIAGE_LIST.id, planDate: null,
      startMin: null, duration: 30, order: n++, createdAt: new Date().toISOString(), doneOn: null, ...fields,
    });
    const tasks = [
      // today
      task('Design review', { planDate: today, startMin: nextHour, duration: 60, priority: 2, labels: ['lbl-w'] }),
      task('Gym', { planDate: today, startMin: Math.min(nextHour + 120, 22 * 60), duration: 60, priority: 3, labels: ['lbl-p'] }),
      task('Reply to Sam', { planDate: today, priority: 2 }),
      task('Water the plants', { planDate: today }),
      task('Morning run', { planDate: today, doneOn: today, labels: ['lbl-p'] }),
      task('Pay rent', { planDate: today, doneOn: today }),
      task('Standup notes', { planDate: today, doneOn: today, labels: ['lbl-w'] }),
      // tomorrow
      task('Plan weekend trip', { planDate: tomorrow, priority: 3 }),
      task('Dentist appointment', { planDate: tomorrow, startMin: 17 * 60, priority: 1, labels: ['lbl-p'] }),
      // yesterday: one done; the two unfinished ones roll over to @overdue on load
      task('Ran 5k', { planDate: yesterday, doneOn: yesterday }),
      task('Call the insurer', { planDate: yesterday }),
      task('Book flights', { planDate: yesterday, priority: 2 }),
      // lists
      task('Renew passport'),
      task('Call the bank'),
      task('Update pricing slide', { list: 'l-sales', priority: 1, labels: ['lbl-w'] }),
      task('Collect customer quotes', { list: 'l-sales', labels: ['lbl-w'] }),
      task('Add Q3 numbers', { list: 'l-sales', labels: ['lbl-w'] }),
      task('Get 3 contractor quotes', { list: 'l-kitchen', priority: 1 }),
      task('Pick cabinet colour', { list: 'l-kitchen' }),
      task('Buy cedar planks', { list: 'l-bird' }),
      task('Find a 1.5" hole saw', { list: 'l-bird', priority: 3 }),
    ];
    return Promise.resolve({ tasks, lists, labels });
  }
  return { load, save() {}, onSaveError() {} };
})();

// "Start over" in the banner and the footer.
document.addEventListener('click', e => {
  if (e.target.closest('[data-reset]')) location.reload();
});
