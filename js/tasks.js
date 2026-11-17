// tasks.js — the task list and every action you can take on it.
//
// A task looks like:
//   {
//     id:        "lq3k9a2x",          unique id
//     title:     "Snippets RFC",
//     area:      "work" | "personal",
//     priority:  1 | 2 | 3,
//     bucket:    "today" | "next3" | "week" | "nextweek" | "month" | "later",
//     order:     0, 1, 2 …            position inside its cell (bucket + area)
//     createdAt: "2026-11-15T22:10:00.000Z",
//     doneOn:    null | "2026-11-15"  the day you ticked it off
//   }
//
// UI code never edits tasks directly — it calls these functions, which save and
// then notify listeners (the board re-renders).

const Tasks = (() => {
  let tasks = [];

  // Called once after sign-in: fetch this person's tasks from the database.
  async function init() {
    tasks = await Store.load();
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function commit() {
    Store.save(tasks);
    listeners.forEach(fn => fn());
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function get(id) {
    return tasks.find(t => t.id === id);
  }

  // Done tasks stay on the board for the day you finish them, then live only in the Done log.
  function isOnBoard(task) {
    return !task.doneOn || task.doneOn === todayISO();
  }

  // Tasks in one cell, in display order: open tasks first, done tasks sink to the bottom.
  function inCell(bucket, area) {
    return tasks
      .filter(t => t.bucket === bucket && t.area === area && isOnBoard(t))
      .sort((a, b) => (!!a.doneOn - !!b.doneOn) || (a.order - b.order));
  }

  // All tasks in a cell sorted by `order` (optionally leaving one out).
  function cellList(bucket, area, excludeId) {
    return tasks
      .filter(t => t.bucket === bucket && t.area === area && t.id !== excludeId)
      .sort((a, b) => a.order - b.order);
  }

  function renumber(list) {
    list.forEach((t, i) => { t.order = i; });
  }

  // ---- actions ---------------------------------------------------------

  function add({ title, area = 'work', priority = 2, bucket = 'today' }) {
    title = (title || '').trim();
    if (!title) return null;
    const task = {
      id: newId(), title, area, priority, bucket,
      order: 0, createdAt: new Date().toISOString(), doneOn: null,
    };
    // Place it below the tasks of equal or higher priority, above lower-priority ones.
    const list = cellList(bucket, area);
    let index = 0;
    list.forEach((t, i) => { if (t.priority <= priority) index = i + 1; });
    list.splice(index, 0, task);
    renumber(list);
    tasks.push(task);
    commit();
    return task;
  }

  function update(id, changes) {
    Object.assign(get(id), changes);
    commit();
  }

  function toggleDone(id) {
    const task = get(id);
    task.doneOn = task.doneOn ? null : todayISO();
    commit();
  }

  function cyclePriority(id) {
    const task = get(id);
    task.priority = (task.priority % 3) + 1;   // 1 -> 2 -> 3 -> 1
    commit();
  }

  // Move a task to a cell, just before `beforeId` (or to the end if beforeId is null).
  function move(id, bucket, area, beforeId) {
    const task = get(id);
    const list = cellList(bucket, area, id);
    let index = beforeId ? list.findIndex(t => t.id === beforeId) : -1;
    if (index < 0) index = list.length;
    task.bucket = bucket;
    task.area = area;
    list.splice(index, 0, task);
    renumber(list);
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

  function replaceAll(newTasks) {
    tasks = newTasks;
    commit();
  }

  // ---- read-only views -------------------------------------------------

  function all() { return tasks; }

  // [{ day: "2026-11-15", tasks: [...] }, ...] newest day first
  function doneByDay() {
    const byDay = {};
    tasks.filter(t => t.doneOn).forEach(t => { (byDay[t.doneOn] = byDay[t.doneOn] || []).push(t); });
    return Object.keys(byDay).sort().reverse()
      .map(day => ({ day, tasks: byDay[day].sort((a, b) => a.priority - b.priority) }));
  }

  function todayStats() {
    const today = todayISO();
    const done = tasks.filter(t => t.doneOn === today).length;
    const open = tasks.filter(t => t.bucket === 'today' && !t.doneOn).length;
    return { done, total: done + open };
  }

  function openCount(bucket) {
    return tasks.filter(t => t.bucket === bucket && !t.doneOn).length;
  }

  return {
    init, onChange, get, inCell, add, update, toggleDone, cyclePriority, move,
    remove, restore, replaceAll, all, doneByDay, todayStats, openCount,
  };
})();

