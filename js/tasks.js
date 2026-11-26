// tasks.js — all the data (tasks, lists, labels) and every action you can take on it.
//
// A task looks like:
//   {
//     id:        "lq3k9a2x",
//     title:     "Renew passport",
//     priority:  null | 1 | 2 | 3       null = not set
//     labels:    ["k2j3", ...]          ids of labels; can be empty
//     list:      "triage" | "k9x2…"     Its list (= project). Always set: @triage is the default
//                                       project (new tasks without an @list, tasks created straight
//                                       onto a day). A task keeps its list while it's planned on a
//                                       day, so it can be moved back there ("Move back to @x").
//     planDate:  null | "2026-11-17"    null = in its list; a date = committed to that day
//     startMin:  null | 570             null = in that day's to-do list; a number = on the
//                                       calendar at that many minutes after midnight (570 = 9:30)
//     duration:  30                     minutes, for the calendar block
//     order:     0, 1, 2 …              position inside its list / to-do list
//     createdAt: "2026-11-17T09:10:00.000Z",
//     doneOn:    null | "2026-11-17"    the day it was done
//     notes:     "Call before 5"         optional description (taskview.js)
//     deletedAt: "2026-11-26T…"          only in the trash (see below)
//   }
//
// Deleting a task moves it to the trash (kept apart from the live tasks, saved with deletedAt)
// for 30 days: Settings → Archive & trash can restore it. After 30 days it's removed for good.
//
// Where a task shows up:
//   done            → on that day: "Done today" for today, crossed out on past days
//   planDate + time → that day's calendar
//   planDate only   → that day's to-do list
//   neither         → its list (bottom section)
// The list changes only when a task is moved into another list (drag, the task window's "Move to
// list", the drop bar), or by "@list" in quick add.
//
// A list (= a project) looks like:  { id, name: "weekly", order, label, notes, archived }
//   archived: hidden from the Dashboard (its page, tasks and notes stay; Settings → Archive & trash)
//   (shown as @weekly; @triage is built in: always first, can't be renamed or deleted)
//   label: optional label id; all the project's tasks count as having it (labels.js matches)
//   notes: optional text, Markdown when it looks like Markdown (project.js)
// A label looks like: { id, name: "Personal", shortcut: "p", color: "#2b8a3e", order }
//
// UI code never edits data directly — it calls these functions, which save and
// then notify listeners (the page re-renders).

const Tasks = (() => {
  let tasks = [];
  let trash = [];   // deleted tasks, newest first; each has deletedAt
  const TRASH_DAYS = 30;
  let lists = [];
  let labels = [];

  // Called once after sign-in: fetch this person's data from the database.
  async function init() {
    const data = await Store.load();
    // The trash: deleted tasks, kept 30 days. Older ones are dropped here, so the next save
    // deletes them from the database for good.
    const cutoff = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString();
    trash = data.tasks.filter(t => t.deletedAt && t.deletedAt >= cutoff).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    const purged = data.tasks.some(t => t.deletedAt && t.deletedAt < cutoff);
    tasks = data.tasks.filter(t => !t.deletedAt);
    lists = data.lists;
    labels = data.labels;
    if (!lists.some(l => l.id === TRIAGE_LIST.id)) lists.push({ ...TRIAGE_LIST, order: -1 });
    tasks.forEach(t => {   // no list, or a list that's gone: @triage
      if (!t.list || !list(t.list)) t.list = TRIAGE_LIST.id;
    });
    // Earlier versions wrote " → task" (or " ✓") after note lines turned into tasks. Notes are no
    // longer changed for that (project.js matches lines to tasks instead): take the old marks out.
    // (Clean-up for existing notes; can be removed once everyone's notes have been loaded once.)
    const OLD_MARK = /^(\s*(?:[-*+]|\d+[.)])\s.*?)[ \t]*(?:→ task|✓)[ \t]*$/gm;
    let cleaned = false;
    lists.forEach(l => {
      const notes = typeof l.notes === 'string' ? l.notes.replace(OLD_MARK, '$1') : l.notes;
      if (notes !== l.notes) { l.notes = notes; cleaned = true; }
    });
    if (cleaned) Store.save('lists', lists);
    if (purged) Store.save('tasks', [...tasks, ...trash]);
    rollover();
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function commit() {
    Store.save('tasks', [...tasks, ...trash]);   // the trash is saved too (with deletedAt)
    Store.save('lists', lists);
    Store.save('labels', labels);
    listeners.forEach(fn => fn());
  }

  // Unfinished tasks committed to a past day. By default nothing happens to them: they simply
  // show in @overdue (see listTasks). Only with the "end of the day" setting set to "the next
  // day's to-do list" are they really moved, onto today's to-do list.
  // Runs at start-up and every minute (for midnight). Returns how many moved.
  function rollover() {
    if (Settings.get('rolloverTo') !== 'nextDay') return 0;
    const today = todayISO();
    const late = tasks.filter(t => !t.doneOn && t.planDate && t.planDate < today);
    late.forEach(t => Object.assign(t, { planDate: today, startMin: null, order: 1e6 + t.order }));
    if (late.length) { renumber(planList(today)); commit(); }
    return late.length;
  }

  function get(id) { return tasks.find(t => t.id === id); }
  function allTasks() { return tasks; }   // (search reads them; never change them directly)

  // ---- what the page shows --------------------------------------------------

  const byOrder = (a, b) => a.order - b.order;

  // Overdue is a view, not a list: unfinished tasks planned for a day before today. They keep
  // their day and time in the database (nothing is moved); they just show under Overdue until
  // you move them, tick them off or delete them. Oldest first.
  const isLate = t => !t.doneOn && t.planDate && t.planDate < todayISO();
  function overdueTasks() {
    return tasks.filter(isLate)
      .sort((a, b) => a.planDate.localeCompare(b.planDate) || (a.startMin ?? 1e4) - (b.startMin ?? 1e4) || a.order - b.order);
  }
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

  // New tasks belong to a list (default @triage). With a day (planDate) or a calendar time
  // (planDate + startMin) they're planned right away, still belonging to that list
  // (e.g. "Dentist tomorrow 5pm @health").
  function add({ title, priority = Settings.get('defaultPriority'), labels: labelIds = [], list: listId = null,
                 planDate = null, startMin = null, duration = null }) {
    title = (title || '').trim();
    if (!title) return null;
    listId = listId && list(listId) ? listId : TRIAGE_LIST.id;
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

  // Tick box: done today / not done. Un-done tasks go back where they were (if that was a past
  // day, they show in @overdue).
  function toggleDone(id) {
    const task = get(id);
    if (task.doneOn) {
      task.doneOn = null;
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


  // Tasks of a project, by state: waiting in the list, planned on a day (not done), and done.
  function projectTasks(listId) {
    const mine = tasks.filter(t => t.list === listId);
    return {
      waiting: listTasks(listId),
      planned: mine.filter(t => t.planDate && !t.doneOn)
        .sort((a, b) => a.planDate.localeCompare(b.planDate) || (a.startMin ?? 1e4) - (b.startMin ?? 1e4) || a.order - b.order),
      done: mine.filter(t => t.doneOn).sort((a, b) => b.doneOn.localeCompare(a.doneOn)),
    };
  }

  function moveToPlan(id, date, beforeId) {
    const task = get(id);
    Object.assign(task, { planDate: date, startMin: null, doneOn: null });
    place(planList(date), task, beforeId);
    commit();
  }

  // Several tasks onto a day's to-do list at once (e.g. "Move all to today" in Overdue), in their
  // current order, after what's already there; one save. Returns what they were, for Undo.
  function moveAllToPlan(ids, date) {
    const before = ids.map(id => { const t = get(id); return { id, planDate: t.planDate, startMin: t.startMin, list: t.list, order: t.order, doneOn: t.doneOn }; });
    ids.forEach((id, i) => { Object.assign(get(id), { planDate: date, startMin: null, doneOn: null, order: 1e6 + i }); });
    renumber(planList(date));
    commit();
    return before;
  }
  // Put back what moveAllToPlan returned (one save).
  function restoreFields(snapshot) {
    snapshot.forEach(({ id, ...fields }) => { const t = get(id); if (t) Object.assign(t, fields); });
    commit();
  }

  function moveToCalendar(id, date, startMin) {
    Object.assign(get(id), { planDate: date, startMin, doneOn: null });
    commit();
  }

  // Delete = into the trash. Returns the task (for Undo: restore(task)).
  function remove(id) {
    const index = tasks.findIndex(t => t.id === id);
    const [removed] = tasks.splice(index, 1);
    removed.deletedAt = new Date().toISOString();
    trash.unshift(removed);
    commit();
    return removed;
  }

  // Undo a delete, or restore from the trash. Its list gone (or archived)? It goes to @triage.
  function restore(task) {
    trash = trash.filter(t => t.id !== task.id);
    task.deletedAt = null;
    if (!list(task.list)) task.list = TRIAGE_LIST.id;
    tasks.push(task);
    commit();
  }

  function trashed() { return trash; }
  // Gone for good (Settings → Archive & trash: "Delete forever" / "Empty trash").
  function purge(ids) {
    trash = ids ? trash.filter(t => !ids.includes(t.id)) : [];
    commit();
  }

  // ---- list actions -------------------------------------------------------------

  // @triage first, then the person's own order. Archived projects are left out unless asked for.
  function allLists({ archived = false } = {}) {
    return lists.filter(l => archived || !l.archived)
      .sort((a, b) => (b.id === TRIAGE_LIST.id) - (a.id === TRIAGE_LIST.id) || a.order - b.order);
  }
  function archivedLists() { return allLists({ archived: true }).filter(l => l.archived); }

  // Archive: hide a project from the Dashboard, keeping everything (not @triage).
  function setArchived(id, on) {
    const l = list(id);
    if (!l || id === TRIAGE_LIST.id) return;
    l.archived = Boolean(on);
    commit();
  }
  function list(id) { return lists.find(l => l.id === id); }
  function findList(name) {
    return lists.find(l => l.name.toLowerCase() === name.toLowerCase());
  }

  // Returns the list (existing or new), or an error message string.
  function addList(name) {
    name = name.replace(/^@/, '').trim();
    if (!LIST_NAME.test(name)) return 'A list name is one word: letters and digits, like @weekly or @upcomingE.';
    const existing = findList(name);
    if (existing) return existing;
    const newList = { id: newId(), name, order: lists.length };
    lists.push(newList);
    commit();
    return newList;
  }

  // A project's notes (free text; Markdown when it looks like Markdown).
  function setListNotes(id, notes) {
    const l = list(id);
    if (!l) return;
    l.notes = notes;
    commit();
  }

  // A list's label (one existing label, or null for none). All the project's tasks count as having it.
  function setListLabel(id, labelId) {
    const l = list(id);
    if (!l) return;
    l.label = labelId || null;
    commit();
  }

  // Rename a list (not @triage). Returns the list, or an error message string.
  function renameList(id, name) {
    name = name.replace(/^@/, '').trim();
    if (id === TRIAGE_LIST.id) return '@triage is built in and can\'t be renamed.';
    if (name.toLowerCase() === TRIAGE_LIST.name) return `@${name} is a built-in list name. Pick another.`;
    if (!LIST_NAME.test(name)) return 'A list name is one word: letters and digits, like @weekly or @upcomingE.';
    const clash = findList(name);
    if (clash && clash.id !== id) return `There's already a list called @${clash.name}.`;
    list(id).name = name;
    commit();
    return list(id);
  }

  // Drag-to-reorder: put list `id` just before `beforeId` (or last). @triage stays first.
  function moveList(id, beforeId) {
    if (id === TRIAGE_LIST.id || id === beforeId) return;
    const others = allLists().filter(l => l.id !== TRIAGE_LIST.id && l.id !== id);
    let index = beforeId ? others.findIndex(l => l.id === beforeId) : -1;
    if (index < 0) index = others.length;
    others.splice(index, 0, list(id));
    others.forEach((l, i) => { l.order = i; });
    commit();
  }

  // Deletes the list AND its (not yet planned) tasks. Returns what was removed, for Undo.
  function removeList(id) {
    if (id === TRIAGE_LIST.id) return null;
    const removedList = list(id);
    const removedTasks = listTasks(id);
    lists = lists.filter(l => l.id !== id);
    tasks = tasks.filter(t => !removedTasks.includes(t));
    const when = new Date().toISOString();   // its waiting tasks go to the trash (restorable for 30 days)
    removedTasks.forEach(t => { t.deletedAt = when; });
    trash.unshift(...removedTasks);
    const unlinked = tasks.filter(t => t.list === id).map(t => t.id);   // planned/done ones keep living,
    unlinked.forEach(tid => { get(tid).list = TRIAGE_LIST.id; });       // in @triage
    commit();
    return { list: removedList, tasks: removedTasks, unlinked };
  }

  function restoreList({ list: l, tasks: removed, unlinked = [] }) {
    lists.push(l);
    trash = trash.filter(t => !removed.includes(t));
    removed.forEach(t => { t.deletedAt = null; });
    tasks.push(...removed);
    unlinked.forEach(tid => { const t = get(tid); if (t) t.list = l.id; });   // link them back
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

  // Rename a label, change its shortcut or colour (Settings → Labels). Everything is checked
  // first; returns the label, or an error message string.
  function updateLabel(id, changes) {
    const l = label(id);
    if (!l) return 'That label no longer exists.';
    const next = { ...l };
    if ('name' in changes) {
      next.name = String(changes.name).trim();
      if (!next.name) return 'Give the label a name.';
      if (labels.some(x => x.id !== id && x.name.toLowerCase() === next.name.toLowerCase())) return `There's already a label called ${next.name}.`;
    }
    if ('shortcut' in changes) {
      next.shortcut = String(changes.shortcut).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!next.shortcut) return 'A shortcut needs letters or digits, like p or work.';
      if (labels.some(x => x.id !== id && x.shortcut === next.shortcut)) return `#${next.shortcut} is already used by another label.`;
    }
    if ('color' in changes) next.color = changes.color;
    Object.assign(l, next);
    commit();
    return l;
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
    init, onChange, rollover, get, allTasks,
    listTasks, overdueTasks, planList, calendarList, doneList,
    add, update, cyclePriority, toggleDone, markDone, moveToList, moveToPlan, moveAllToPlan, restoreFields, moveToCalendar, remove, restore, trashed, purge,
    allLists, archivedLists, setArchived, list, findList, addList, setListNotes, projectTasks, renameList, setListLabel, moveList, removeList, restoreList,
    allLabels, label, findLabel, addLabel, updateLabel, removeLabel,
    exportData, replaceAll,
  };
})();
