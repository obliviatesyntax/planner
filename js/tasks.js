// tasks.js — all the data (tasks + labels) and every action you can take on it.
//
// A task looks like:
//   {
//     id:        "lq3k9a2x",
//     title:     "Snippets RFC",
//     priority:  1 | 2 | 3,
//     labels:    ["k2j3", ...]          ids of labels (see below); can be empty
//     bucket:    "today" | "week" | "month" | "eventually"   its triage bucket
//     planDate:  null | "2026-11-17"    null = still in triage; a date = committed to that day
//     startMin:  null | 570             null = in that day's plan list; a number = on the
//                                       calendar at that many minutes after midnight (570 = 9:30)
//     duration:  30                     minutes, for the calendar block
//     order:     0, 1, 2 …              position inside its list
//     createdAt: "2026-11-17T09:10:00.000Z",
//     doneOn:    null | "2026-11-17"    the day it was marked done
//   }
//
// Where a task shows up:
//   done            → Done today panel (if done today) and the Done log
//   planDate + time → that day's calendar
//   planDate only   → that day's plan list
//   neither         → its triage bucket
//
// A label looks like: { id, name: "Personal", shortcut: "p", color: "#2b8a3e", order }
//
// UI code never edits data directly — it calls these functions, which save and
// then notify listeners (the page re-renders).

const Tasks = (() => {
  let tasks = [];
  let labels = [];

  // Called once after sign-in: fetch this person's data from the database.
  async function init() {
    const data = await Store.load();
    tasks = data.tasks;
    labels = data.labels;
    rollover();
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function commit() {
    Store.save('tasks', tasks);
    Store.save('labels', labels);
    listeners.forEach(fn => fn());
  }

  // Unfinished tasks committed to a past day move into today's plan list.
  // Runs at start-up and when the app is left open past midnight.
  function rollover() {
    const today = todayISO();
    const late = tasks.filter(t => !t.doneOn && t.planDate && t.planDate < today);
    late.forEach(t => { t.planDate = today; t.startMin = null; t.order = 1e6 + t.order; });
    if (late.length) { renumber(planList(today)); commit(); }
    return late.length;
  }

  function get(id) { return tasks.find(t => t.id === id); }

  // ---- the lists the page shows -----------------------------------------

  const byOrder = (a, b) => a.order - b.order;

  function triageList(bucket) {
    return tasks.filter(t => !t.doneOn && !t.planDate && t.bucket === bucket).sort(byOrder);
  }
  function planList(date) {
    return tasks.filter(t => !t.doneOn && t.planDate === date && t.startMin == null).sort(byOrder);
  }
  function calendarList(date) {
    return tasks.filter(t => !t.doneOn && t.planDate === date && t.startMin != null)
      .sort((a, b) => a.startMin - b.startMin);
  }
  function doneList(date) {
    return tasks.filter(t => t.doneOn === date).sort((a, b) => a.priority - b.priority);
  }

  // [{ day: "2026-11-15", tasks: [...] }, ...] newest day first
  function doneByDay() {
    const days = [...new Set(tasks.filter(t => t.doneOn).map(t => t.doneOn))].sort().reverse();
    return days.map(day => ({ day, tasks: doneList(day) }));
  }

  function todayStats() {
    const today = todayISO();
    const done = doneList(today).length;
    const open = planList(today).length + calendarList(today).length;
    return { done, total: done + open };
  }

  // ---- ordering helpers ---------------------------------------------------

  function renumber(list) { list.forEach((t, i) => { t.order = i; }); }

  // Put `task` into `list` just before `beforeId` (or at the end), then renumber.
  function place(list, task, beforeId) {
    list = list.filter(t => t.id !== task.id);
    let index = beforeId ? list.findIndex(t => t.id === beforeId) : -1;
    if (index < 0) index = list.length;
    list.splice(index, 0, task);
    renumber(list);
  }

  // ---- task actions -------------------------------------------------------

  // New tasks always start in triage.
  function add({ title, priority = 2, labels: labelIds = [], bucket = 'today' }) {
    title = (title || '').trim();
    if (!title) return null;
    const task = {
      id: newId(), title, priority, labels: labelIds, bucket,
      planDate: null, startMin: null, duration: CALENDAR.defaultDuration,
      order: 0, createdAt: new Date().toISOString(), doneOn: null,
    };
    tasks.push(task);
    place(triageList(bucket), task, null);
    commit();
    return task;
  }

  function update(id, changes) {
    Object.assign(get(id), changes);
    commit();
  }

  function cyclePriority(id) {
    const task = get(id);
    task.priority = (task.priority % 3) + 1;   // 1 -> 2 -> 3 -> 1
    commit();
  }

  function toggleDone(id) {
    const task = get(id);
    if (task.doneOn) {
      // Un-done: back where it was, but never on a past day.
      task.doneOn = null;
      if (task.planDate && task.planDate < todayISO()) { task.planDate = todayISO(); task.startMin = null; }
    } else {
      task.doneOn = todayISO();
    }
    commit();
  }

  function moveToTriage(id, bucket, beforeId) {
    const task = get(id);
    Object.assign(task, { planDate: null, startMin: null, bucket });
    place(triageList(bucket), task, beforeId);
    commit();
  }

  function moveToPlan(id, date, beforeId) {
    const task = get(id);
    Object.assign(task, { planDate: date, startMin: null });
    place(planList(date), task, beforeId);
    commit();
  }

  function moveToCalendar(id, date, startMin) {
    Object.assign(get(id), { planDate: date, startMin });
    commit();
  }

  function remove(id) {
    const index = tasks.findIndex(t => t.id === id);
    const [removed] = tasks.splice(index, 1);
    commit();
    return removed;
  }

  function restore(task) {
    tasks.push(task);
    commit();
  }

  // ---- label actions ------------------------------------------------------

  function allLabels() { return [...labels].sort(byOrder); }
  function label(id) { return labels.find(l => l.id === id); }

  // Finds a label by its shortcut or its name, case-insensitive: "p" or "personal".
  function findLabel(word) {
    const w = word.toLowerCase();
    return labels.find(l => l.shortcut === w) || labels.find(l => l.name.toLowerCase() === w);
  }

  // Returns the new label, or an error message string.
  function addLabel(name, shortcut) {
    name = name.trim();
    if (!name) return 'Give the label a name.';
    shortcut = (shortcut || '').toLowerCase().replace(/[^a-z0-9]/g, '') || suggestShortcut(name);
    if (labels.some(l => l.shortcut === shortcut)) return `#${shortcut} is already used by another label.`;
    if (labels.some(l => l.name.toLowerCase() === name.toLowerCase())) return `There's already a label called ${name}.`;
    const newLabel = {
      id: newId(), name, shortcut,
      color: LABEL_COLORS[labels.length % LABEL_COLORS.length],
      order: labels.length,
    };
    labels.push(newLabel);
    commit();
    return newLabel;
  }

  // "Personal" -> "p", or "pe", "per"… if "p" is taken.
  function suggestShortcut(name) {
    const letters = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'label';
    for (let n = 1; n <= letters.length; n++) {
      if (!labels.some(l => l.shortcut === letters.slice(0, n))) return letters.slice(0, n);
    }
    let i = 2;
    while (labels.some(l => l.shortcut === letters + i)) i++;
    return letters + i;
  }

  // Deleting a label removes it from every task (the tasks themselves stay).
  function removeLabel(id) {
    labels = labels.filter(l => l.id !== id);
    tasks.forEach(t => { if (t.labels.includes(id)) t.labels = t.labels.filter(x => x !== id); });
    commit();
  }

  // ---- backup ---------------------------------------------------------------

  function exportData() { return { tasks, labels }; }

  function replaceAll(data) {
    tasks = data.tasks;
    labels = data.labels;
    commit();
  }

  return {
    init, onChange, rollover, get,
    triageList, planList, calendarList, doneList, doneByDay, todayStats,
    add, update, cyclePriority, toggleDone, moveToTriage, moveToPlan, moveToCalendar, remove, restore,
    allLabels, label, findLabel, addLabel, removeLabel,
    exportData, replaceAll,
  };
})();
