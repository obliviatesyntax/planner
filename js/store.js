// store.js — the ONLY file that knows where tasks are saved.
//
// Now: the `tasks` table in Supabase (Postgres). Each signed-in person gets their own rows
// (enforced by the database, see supabase/schema.sql).
//
// The rest of the app still thinks in terms of "load everything" and "save everything".
// To keep the database work small, save() compares against what was last saved and only
// sends the tasks that were added, changed or deleted.

const Store = (() => {
  let lastSaved = new Map();          // id -> JSON of the task as the database has it
  let queue = Promise.resolve();      // saves run one after another, never overlapping
  let onError = () => {};

  // App task  <->  database row (the database uses snake_case names)
  const toRow = t => ({
    id: t.id, title: t.title, area: t.area, priority: t.priority, bucket: t.bucket,
    sort_order: t.order, created_at: t.createdAt, done_on: t.doneOn,
  });
  const fromRow = r => ({
    id: r.id, title: r.title, area: r.area, priority: r.priority, bucket: r.bucket,
    order: r.sort_order, createdAt: r.created_at, doneOn: r.done_on,
  });

  // Returns all of the signed-in person's tasks.
  async function load() {
    const { data, error } = await db.from('tasks').select('*');
    if (error) throw error;
    const tasks = data.map(fromRow);
    lastSaved = new Map(tasks.map(t => [t.id, JSON.stringify(t)]));
    return tasks;
  }

  // Called after every change, with the whole list. Sends only the differences.
  function save(tasks) {
    const current = new Map(tasks.map(t => [t.id, JSON.stringify(t)]));
    const changed = tasks.filter(t => current.get(t.id) !== lastSaved.get(t.id));
    const deleted = [...lastSaved.keys()].filter(id => !current.has(id));
    if (!changed.length && !deleted.length) return;
    lastSaved = current;

    queue = queue.then(async () => {
      if (changed.length) {
        const { error } = await db.from('tasks').upsert(changed.map(toRow), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
      if (deleted.length) {
        const { error } = await db.from('tasks').delete().in('id', deleted);
        if (error) throw error;
      }
    }).catch(err => {
      console.error('Could not save tasks', err);
      onError(err);
    });
  }

  return { load, save, onSaveError: fn => { onError = fn; } };
})();
