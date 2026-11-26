// store.js — the ONLY file that knows where data is saved.
//
// Two Supabase (Postgres) tables: `tasks` and `lists` (see supabase/schema.sql). Each
// signed-in person only ever sees their own rows (enforced by the database).
//
// The rest of the app thinks in terms of "load everything" and "save everything".
// To keep the database work small, save() compares against what was last saved and only
// sends the rows that were added, changed or deleted.

const Store = (() => {
  // App object  <->  database row (the database uses snake_case names)
  const TABLES = {
    tasks: {
      toRow: t => ({
        // list_id is NOT NULL in the database: "" there = no list (null here).
        id: t.id, title: t.title, priority: t.priority, list_id: t.list || '',
        plan_date: t.planDate, start_min: t.startMin, duration_min: t.duration,
        sort_order: t.order, created_at: t.createdAt, done_on: t.doneOn,
        // Only sent once a description has been written, so saving still works on a
        // database that hasn't run migrations/004-description.sql yet.
        ...(typeof t.notes === 'string' ? { notes: t.notes } : {}),
        // In the trash since (migrations/007); only sent once a task has been deleted.
        ...(t.deletedAt !== undefined ? { deleted_at: t.deletedAt } : {}),
      }),
      fromRow: r => ({
        id: r.id, title: r.title, priority: r.priority, list: r.list_id || null,
        planDate: r.plan_date, startMin: r.start_min, duration: r.duration_min,
        order: r.sort_order, createdAt: r.created_at, doneOn: r.done_on,
        ...(r.notes != null ? { notes: r.notes } : {}),
        ...(r.deleted_at ? { deletedAt: r.deleted_at } : {}),
      }),
    },
    lists: {
      // color (migrations/008) is only sent once a project has one, so saving works before it's run.
      // notes (project notes) only once written, so saving works before migrations/006-project-notes.sql.
      toRow: l => ({ id: l.id, name: l.name, sort_order: l.order, ...(l.color !== undefined ? { color: l.color } : {}), ...(typeof l.notes === 'string' ? { notes: l.notes } : {}), ...(l.archived !== undefined ? { archived: l.archived } : {}) }),
      fromRow: r => ({ id: r.id, name: r.name, order: r.sort_order, ...(r.color ? { color: r.color } : {}), ...(r.notes != null ? { notes: r.notes } : {}), ...(r.archived ? { archived: true } : {}) }),
    },
  };

  const lastSaved = { tasks: new Map(), lists: new Map() };   // id -> JSON as the database has it
  let queue = Promise.resolve();      // saves run one after another, never overlapping
  let onError = () => {};
  let pending = 0;   // saves sent but not finished yet

  // Returns { tasks: [...], lists: [...] } for the signed-in person. (Labels were removed in Nov
  // 2026; the old `labels` table and columns are simply no longer read or written.)
  // The three tables are asked for at the same time (one wait, not three in a row).
  async function load() {
    const result = await fetchAll();
    Object.keys(result).forEach(table => adopt(table, result[table]));
    return result;
  }

  // Both tables as the database has them now, without touching what we remember as saved.
  async function fetchAll() {
    const tables = Object.keys(TABLES);
    const answers = await Promise.all(tables.map(table => db.from(table).select('*')));
    const result = {};
    tables.forEach((table, i) => {
      const { data, error } = answers[i];
      if (error) throw error;
      result[table] = data.map(TABLES[table].fromRow);
    });
    return result;
  }

  // "This is what the database has": the next save only sends what differs from it.
  function adopt(table, items) {
    lastSaved[table] = new Map(items.map(x => [x.id, JSON.stringify(x)]));
  }

  // Called after every change with the whole list for one table. Sends only the differences.
  function save(table, items) {
    const current = new Map(items.map(x => [x.id, JSON.stringify(x)]));
    const changed = items.filter(x => current.get(x.id) !== lastSaved[table].get(x.id));
    const deleted = [...lastSaved[table].keys()].filter(id => !current.has(id));
    if (!changed.length && !deleted.length) return;
    lastSaved[table] = current;
    pending++;

    queue = queue.then(async () => {
      if (changed.length) {
        const { error } = await db.from(table).upsert(changed.map(TABLES[table].toRow), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
      if (deleted.length) {
        const { error } = await db.from(table).delete().in('id', deleted);
        if (error) throw error;
      }
    }).catch(err => {
      console.error(`Could not save ${table}`, err);
      onError(err);
    }).finally(() => { pending--; });
  }

  return {
    load, save, fetchAll, adopt,
    saving: () => pending > 0,   // a change of ours is still on its way to the database
    onSaveError: fn => { onError = fn; },
  };
})();
