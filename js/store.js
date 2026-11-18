// store.js — the ONLY file that knows where data is saved.
//
// Three Supabase (Postgres) tables: `tasks`, `lists` and `labels` (see supabase/schema.sql). Each
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
        id: t.id, title: t.title, priority: t.priority, labels: t.labels, list_id: t.list,
        plan_date: t.planDate, start_min: t.startMin, duration_min: t.duration,
        sort_order: t.order, created_at: t.createdAt, done_on: t.doneOn,
      }),
      fromRow: r => ({
        id: r.id, title: r.title, priority: r.priority, labels: r.labels || [], list: r.list_id,
        planDate: r.plan_date, startMin: r.start_min, duration: r.duration_min,
        order: r.sort_order, createdAt: r.created_at, doneOn: r.done_on,
      }),
    },
    lists: {
      toRow: l => ({ id: l.id, name: l.name, sort_order: l.order }),
      fromRow: r => ({ id: r.id, name: r.name, order: r.sort_order }),
    },
    labels: {
      toRow: l => ({ id: l.id, name: l.name, shortcut: l.shortcut, color: l.color, sort_order: l.order }),
      fromRow: r => ({ id: r.id, name: r.name, shortcut: r.shortcut, color: r.color, order: r.sort_order }),
    },
  };

  const lastSaved = { tasks: new Map(), lists: new Map(), labels: new Map() };   // id -> JSON as the database has it
  let queue = Promise.resolve();      // saves run one after another, never overlapping
  let onError = () => {};

  // Returns { tasks: [...], lists: [...], labels: [...] } for the signed-in person.
  async function load() {
    const result = {};
    for (const table of Object.keys(TABLES)) {
      const { data, error } = await db.from(table).select('*');
      if (error) throw error;
      result[table] = data.map(TABLES[table].fromRow);
      lastSaved[table] = new Map(result[table].map(x => [x.id, JSON.stringify(x)]));
    }
    return result;
  }

  // Called after every change with the whole list for one table. Sends only the differences.
  function save(table, items) {
    const current = new Map(items.map(x => [x.id, JSON.stringify(x)]));
    const changed = items.filter(x => current.get(x.id) !== lastSaved[table].get(x.id));
    const deleted = [...lastSaved[table].keys()].filter(id => !current.has(id));
    if (!changed.length && !deleted.length) return;
    lastSaved[table] = current;

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
    });
  }

  return { load, save, onSaveError: fn => { onError = fn; } };
})();
