// tasks.js — all the data (tasks, lists, labels) and every action you can take on it.
//
// A task looks like:
//   {
//     id:        "lq3k9a2x",
//     title:     "Renew passport",
//     priority:  null | 1 | 2 | 3       null = not set
//     labels:    ["k2j3", ...]          ids of labels; can be empty
//     list:      "triage" | "overdue" | "k9x2…"   id of the list it sits in while not planned
//     planDate:  null | "2026-11-17"    null = in its list; a date = committed to that day
//     startMin:  null | 570             null = in that day's to-do list; a number = on the
//                                       calendar at that many minutes after midnight (570 = 9:30)
//     duration:  30                     minutes, for the calendar block
//     order:     0, 1, 2 …              position inside its list / to-do list
//     createdAt: "2026-11-17T09:10:00.000Z",
//     doneOn:    null | "2026-11-17"    the day it was done
//     notes:     "Call before 5"         optional description (taskview.js)
//   }
//
// Where a task shows up:
//   done            → on that day: "Done today" for today, crossed out on past days
//   planDate + time → that day's calendar
//   planDate only   → that day's to-do list
//   neither         → its list (bottom section)
//
// A list looks like:  { id, name: "weekly", order, label }   (shown as @weekly; @triage is built in)
//   label: optional label id; a task moved from this list onto a day or time gets that label
// A label looks like: { id, name: "Personal", shortcut: "p", color: "#2b8a3e", order }
//
// UI code never edits data directly — it calls these functions, which save and
// then notify listeners (the page re-renders).

const Tasks = (() => {
  let tasks = [];
  let lists = [];
  let labels = [];

  // Called once after sign-in: fetch this person's data from the database.
  async function init() {
    const data = await Store.load();
    tasks = data.tasks;
    lists = data.lists;
    labels = data.labels;
    if (!lists.some(l => l.id === TRIAGE_LIST.id)) lists.push({ ...TRIAGE_LIST, order: -1 });
    tasks.forEach(t => { if (!list(t.list)) t.list = TRIAGE_LIST.id; });   // e.g. old buckets
    rollover();
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function commit() {
    Store.save('tasks', tasks);
    Store.save('lists', lists);
    Store.save('labels', labels);
    listeners.forEach(fn => fn());
  }

  // Unfinished tasks committed to a past day (to-do list or calendar) move on: to @overdue
  // (default), or to today's to-do list if the "end of the day" setting says so.
  // Runs at start-up and every minute (for midnight). Returns how many moved.
  function rollover() {
    const today = todayISO();
    const toToday = Settings.get('rolloverTo') === 'nextDay';
    const late = tasks.filter(t => !t.doneOn && t.planDate && t.planDate < today);
    late.forEach(t => {
      Object.assign(t, toToday
        ? { planDate: today, startMin: null, order: 1e6 + t.order }
        : { planDate: null, startMin: null, list: OVERDUE_LIST.id, order: 1e6 + t.order });
    });
    if (late.length) { renumber(toToday ? planList(today) : listTasks(OVERDUE_LIST.id)); commit(); }
    return late.length;
  }

  function get(id) { return tasks.find(t => t.id === id); }

  // ---- what the page shows --------------------------------------------------

  const byOrder = (a, b) => a.order - b.order;

  function listTasks(listId) {
    return tasks.filter(t => !t.doneOn && !t.planDate && t.list === listId).sort(byOrder);
  }
  function planList(date) {
    return tasks.filter(t => !t.doneOn && t.planDate === date && t.startMin == null).sort(byOrder);
  }
  function calendarList(date) {
    return tasks.filter(t => !t.doneOn && t.planDate === date && t.startMin != null)
      .sort((a, b) => a.startMin - b.startMin);
  }
  function doneList(date) {
    return tasks.filter(t => t.doneOn === date)
      .sort((a, b) => (a.startMin ?? 1e4) - (b.startMin ?? 1e4) || (a.priority || 9) - (b.priority || 9));
  }

  // ---- ordering helpers -------------------------------------------------------

  function renumber(list) { list.forEach((t, i) => { t.order = i; }); }

  // Put `task` into `items` just before `beforeId` (or at the end), then renumber.
  function place(items, task, beforeId) {
    items = items.filter(t => t.id !== task.id);
    let index = beforeId ? items.findIndex(t => t.id === beforeId) : -1;
    if (index < 0) index = items.length;
    items.splice(index, 0, task);
    renumber(items);
  }

  // ---- task actions -----------------------------------------------------------

  // New tasks go to a list (default @triage), unless a day (planDate) or a calendar
  // time (planDate + startMin) is given.
  function add({ title, priority = Settings.get('defaultPriority'), labels: labelIds = [], list: listId = TRIAGE_LIST.id,
                 planDate = null, startMin = null, duration = null }) {
    title = (title || '').trim();
    if (!title) return null;
    const task = {
      id: newId(), title, priority: priority || null, labels: labelIds, list: listId,
      planDate, startMin: planDate ? startMin : null, duration: duration || Settings.get('defaultDuration'),
      order: 0, createdAt: new Date().toISOString(), doneOn: null,
    };
    tasks.push(task);
    if (!planDate) place(listTasks(listId), task, null);
    else if (startMin == null) place(planList(planDate), task, null);
    commit();
    return task;
  }

  function update(id, changes) {
    Object.assign(get(id), changes);
    commit();
  }

  function cyclePriority(id) {
    const task = get(id);
    task.priority = { null: 1, 1: 2, 2: 3, 3: null }[task.priority || null];   // none -> P1 -> P2 -> P3 -> none
    commit();
  }

  // Tick box: done today / not done. Un-done tasks go back where they were, or to @triage
  // if that was a past day.
  function toggleDone(id) {
    const task = get(id);
    if (task.doneOn) {
      task.doneOn = null;
      if (task.planDate && task.planDate < todayISO()) Object.assign(task, { planDate: null, startMin: null, list: OVERDUE_LIST.id });
    } else {
      task.doneOn = todayISO();
    }
    commit();
  }

  // Dragged onto "Done today" or onto a past day: done on that day.
  function markDone(id, date) {
    const task = get(id);
    task.doneOn = date;
    if (!task.planDate || task.planDate !== date) Object.assign(task, { planDate: date, startMin: null });
    commit();
  }

  // Moves (by drag) also un-do a done task.
  function moveToList(id, listId, beforeId) {
    const task = get(id);
    Object.assign(task, { planDate: null, startMin: null, list: listId, doneOn: null });
    place(listTasks(listId), task, beforeId);
    commit();
  }

  // A task leaving a list for a day or a calendar time picks up that list's label (if it has one).
  function inheritListLabel(task) {
    if (task.planDate || task.doneOn) return;            // not coming out of a list
    const from = list(task.list);
    if (from && from.label && label(from.label) && !task.labels.includes(from.label)) {
      task.labels = [...task.labels, from.label];
    }
  }

  function moveToPlan(id, date, beforeId) {
    const task = get(id);
    inheritListLabel(task);
    Object.assign(task, { planDate: date, startMin: null, doneOn: null });
    place(planList(date), task, beforeId);
    commit();
  }

  function moveToCalendar(id, date, startMin) {
    inheritListLabel(get(id));
    Object.assign(get(id), { planDate: date, startMin, doneOn: null });
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

  // ---- list actions -------------------------------------------------------------

  // @triage first, then the person's own order.
  function allLists() {
    return [...lists].sort((a, b) => (b.id === TRIAGE_LIST.id) - (a.id === TRIAGE_LIST.id) || a.order - b.order);
  }
  function list(id) { return id === OVERDUE_LIST.id ? OVERDUE_LIST : lists.find(l => l.id === id); }
  function findList(name) {
    if (name.toLowerCase() === OVERDUE_LIST.name) return OVERDUE_LIST;
    return lists.find(l => l.name.toLowerCase() === name.toLowerCase());
  }
  const isOverdue = name => name.replace(/^@/, '').trim().toLowerCase() === OVERDUE_LIST.name;

  // Returns the list (existing or new), or an error message string.
  function addList(name) {
    name = name.replace(/^@/, '').trim();
    if (isOverdue(name)) return '@overdue is a built-in list: it collects unfinished tasks from past days. Pick another name.';
    if (!LIST_NAME.test(name)) return 'A list name is one word: letters and digits, like @weekly or @upcomingE.';
    const existing = findList(name);
    if (existing) return existing;
    const newList = { id: newId(), name, order: lists.length };
    lists.push(newList);
    commit();
    return newList;
  }

  // A list's label (one existing label, or null for none). Tasks get it when moved onto the plan.
  function setListLabel(id, labelId) {
    const l = list(id);
    if (!l || id === OVERDUE_LIST.id) return;
    l.label = labelId || null;
    commit();
  }

  // Rename a list (not @triage or @overdue). Returns the list, or an error message string.
  function renameList(id, name) {
    name = name.replace(/^@/, '').trim();
    if (id === TRIAGE_LIST.id || id === OVERDUE_LIST.id) return 'Built-in lists can\'t be renamed.';
    if (isOverdue(name) || name.toLowerCase() === TRIAGE_LIST.name) return `@${name} is a built-in list name. Pick another.`;
    if (!LIST_NAME.test(name)) return 'A list name is one word: letters and digits, like @weekly or @upcomingE.';
    const clash = findList(name);
    if (clash && clash.id !== id) return `There's already a list called @${clash.name}.`;
    list(id).name = name;
    commit();
    return list(id);
  }

  // Drag-to-reorder: put list `id` just before `beforeId` (or last). @triage stays first.
  function moveList(id, beforeId) {
    if (id === TRIAGE_LIST.id || id === OVERDUE_LIST.id || id === beforeId) return;
    if (beforeId === OVERDUE_LIST.id) beforeId = null;
    const others = allLists().filter(l => l.id !== TRIAGE_LIST.id && l.id !== id);
    let index = beforeId ? others.findIndex(l => l.id === beforeId) : -1;
    if (index < 0) index = others.length;
    others.splice(index, 0, list(id));
    others.forEach((l, i) => { l.order = i; });
    commit();
  }

  // Deletes the list AND its (not yet planned) tasks. Returns what was removed, for Undo.
  function removeList(id) {
    if (id === TRIAGE_LIST.id || id === OVERDUE_LIST.id) return null;
    const removedList = list(id);
    const removedTasks = listTasks(id);
    lists = lists.filter(l => l.id !== id);
    tasks = tasks.filter(t => !removedTasks.includes(t));
    tasks.forEach(t => { if (t.list === id) t.list = TRIAGE_LIST.id; });   // planned/done ones keep living
    commit();
    return { list: removedList, tasks: removedTasks };
  }

  function restoreList({ list: l, tasks: removed }) {
    lists.push(l);
    tasks.push(...removed);
    commit();
  }

  // ---- label actions --------------------------------------------------------------

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
    lists.forEach(l => { if (l.label === id) l.label = null; });   // lists that used it lose it too
    commit();
  }

  // ---- backup ---------------------------------------------------------------------

  function exportData() { return { tasks, lists, labels }; }

  function replaceAll(data) {
    tasks = data.tasks;
    lists = data.lists || [{ ...TRIAGE_LIST, order: -1 }];
    labels = data.labels;
    commit();
  }

  return {
    init, onChange, rollover, get,
    listTasks, planList, calendarList, doneList,
    add, update, cyclePriority, toggleDone, markDone, moveToList, moveToPlan, moveToCalendar, remove, restore,
    allLists, list, findList, isOverdue, addList, renameList, setListLabel, moveList, removeList, restoreList,
    allLabels, label, findLabel, addLabel, removeLabel,
    exportData, replaceAll,
  };
})();
