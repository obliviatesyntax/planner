// planner.ts — the Planner MCP server: lets Claude, ChatGPT or Gemini use your Planner.
//
// MCP ("Model Context Protocol") is how AI apps call outside tools. Claude sends small JSON
// requests ("which tools do you have?", "run get_plan for tomorrow") over HTTPS, and this answers.
//
//   Who you are: every request carries your Supabase sign-in token (Authorization: Bearer …).
//   We read the database AS YOU with that token, so the same row-level security as the app
//   applies: you only ever see your own tasks. No admin key is used anywhere here.
//
//   Reading:  get_plan, get_lists, search_tasks, get_task.
//   Changing: add_task, update_task, move_task, complete_task, uncomplete_task, delete_task
//             (those four take several ids at once, so the AI app asks you once),
//             create_list, rename_list, set_list_color, archive_list.
//   Projects are never deleted, only archived (with their unfinished tasks, off the plan).
//   The AI apps ask you before running a tool that changes things (and warn more for deletes).
//
// The rules are the same as js/tasks.js; keep them in step:
//   where a task shows (listTasks, planList, calendarList, doneList), what moving does
//   (moveToList, moveToPlan, moveToCalendar), done / not done (toggleDone,
//   markDone) and lists (addList, renameList, setListColor, setArchived). (Labels were removed in
//   Nov 2026; projects have a colour instead.)
// "Overdue" is a view in both, not a list: unfinished tasks planned for a past day show there, but keep their
// day and time in the database until moved.
// An open Planner tab picks up changes made here in the background (js/tasks.js → refresh).
//
// Signing in (OAuth): Supabase Auth is the sign-in server (Authentication → OAuth Server in the
// dashboard). A request without a valid token gets "401" plus a pointer to this server's
// "protected resource metadata", which names Supabase as where to sign in. Claude then registers
// itself, sends you to Planner's "Allow" page (js/consent.js), and comes back with a token.
//
// The protocol part is the "Streamable HTTP" transport, in its simplest form: each POST is one
// JSON-RPC request and gets one JSON answer. No sessions, no streaming.

export type Env = { supabaseUrl: string; apiKey: string };

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'planner', title: 'Planner', version: '0.4.0' };
const INSTRUCTIONS = `Planner is the user's daily planner. Tasks either wait in lists (@triage is the inbox,
other lists are projects like @salesDeck) or are planned
on a day: on that day's calendar (with a time) or its to-do list (no time). A task planned from a list remembers it (to move back later); one added straight onto a day has no list. Done tasks are logged on the
day they were done. Unfinished tasks planned for a past day are "overdue": they keep that day and time
and show in an Overdue section (not a list) until moved, completed or deleted. Priorities: P1 must do, P2 should do, P3 nice to have.
Dates are in the user's time zone; get_plan with no date means today. Tools that change a task need its
id: get it from get_plan, get_lists or search_tasks first. Lists can be named without @.
Start with get_plan: it has the date and time, the plan and every list, so most questions need nothing else.
To add several tasks use add_task with tasks: [...]; to move, complete or delete several, pass all their ids
in ONE call (ids: [...], from_list to move a whole list, or overdue: true for everything overdue): the user then confirms once instead of once per task.
Lists other than @triage (the default list for new tasks) are projects with notes: get_project shows one with all its tasks.
Moving a task to a list takes it off the plan. Projects can't be deleted, only archived (archive_list), and only when none
of their tasks is planned. Dates can be words (tomorrow, friday, next monday). Task lines include a short note; get_task has the full text.`;

// ---- the tools -----------------------------------------------------------------------

// Project colours, as in the app (js/config.js PROJECT_COLORS).
const COLORS: Record<string, string> = { red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e', teal: '#14b8a6', blue: '#3b82f6', violet: '#8b5cf6', pink: '#ec4899', slate: '#64748b' };
const COLOR_NAMES = Object.keys(COLORS).join(', ');

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const READ_TOOLS = [
  {
    name: 'get_plan',
    title: 'Get the plan',
    description: "Start here for most questions. The current date and time, the plan for one or more days (each day's calendar, to-do list and what was done), and by default overdue tasks, everything waiting in lists (@triage, projects) Every task line has its id, time, priority, the day it was added and a short note.",
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'First day: YYYY-MM-DD, or today, tomorrow, yesterday, a weekday ("friday", "next monday", "last friday"), "in 3 days". Default today.' },
        days: { type: 'integer', minimum: 1, maximum: 14, description: 'How many days from that date. Default 1.' },
        include_lists: { type: 'boolean', description: 'Also list overdue tasks and everything waiting in lists (@triage, projects). Default true.' },
      },
    },
    annotations: { title: 'Get the plan', ...READ_ONLY },
  },
  {
    name: 'get_lists',
    title: 'Get lists',
    description: 'Tasks not yet planned on a day: overdue tasks (unfinished from past days; not a list), @triage (the default list) and the other lists.',
    inputSchema: {
      type: 'object',
      properties: {
        list: { type: 'string', description: 'Only this list, by name (with or without @). Default: all lists.' },
      },
    },
    annotations: { title: 'Get lists', ...READ_ONLY },
  },
  {
    name: 'get_project',
    title: 'Get a project',
    description: "Everything about one project (a list other than @triage): its notes (Markdown or plain text), tasks not planned yet, tasks planned on a day (with their day and time) and done tasks (newest first). Tasks keep their project while planned.",
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'The project (list) name, with or without @.' },
        done_limit: { type: 'integer', minimum: 0, maximum: 200, description: 'How many done tasks to show. Default 10.' },
      },
      required: ['project'],
    },
    annotations: { title: 'Get a project', ...READ_ONLY },
  },
  {
    name: 'search_tasks',
    title: 'Search tasks',
    description: 'Find tasks by text (title or description, not case-sensitive) and/or filters: priority, list, the day they were added. Says where each one is: which list, day or time, or when it was done.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to look for in titles and descriptions (optional if a filter is given).' },
        priority: { type: 'integer', minimum: 0, maximum: 3, description: 'Only this priority (0 = none).' },
        list: { type: 'string', description: 'Only tasks waiting in this list.' },
        added_on: { type: 'string', description: 'Only tasks added on this day (YYYY-MM-DD or today, yesterday, a weekday…).' },
        include_done: { type: 'boolean', description: 'Also done tasks. Default false.' },
      },
    },
    annotations: { title: 'Search tasks', ...READ_ONLY },
  },
  {
    name: 'get_task',
    title: 'Get a task',
    description: 'Everything about one task, including its description. Use an id from the other tools.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task id.' } },
      required: ['id'],
    },
    annotations: { title: 'Get a task', ...READ_ONLY },
  },
];

// Tools that change things. destructiveHint: deleting can't be undone from here.
const CHANGE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DELETE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const str = (description: string) => ({ type: 'string', description });
const WHERE = {
  list: str('Put it in this list, by name (e.g. "salesDeck"). A new name creates the list. Wins over date.'),
  date: str('Plan it on this day: YYYY-MM-DD, or today, tomorrow, a weekday ("friday", "next monday"), "in 3 days". Without start_time it goes on that day\'s to-do list.'),
  start_time: str('Put it on that day\'s calendar at this time, 24-hour HH:MM (e.g. "17:30"). Needs date.'),
  duration_minutes: { type: 'integer', minimum: 5, maximum: 720, description: 'Length on the calendar. Default: the user\'s setting (usually 30).' },
};
const WRITE_TOOLS = [
  {
    name: 'add_task', title: 'Add a task',
    description: 'Add a task, or several at once with tasks: [...] (one confirmation for all). With nothing else it goes to @triage (the inbox); or give a list, or a date (and a time for the calendar). Fields at the top level apply to every task in tasks unless a task sets its own.',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('What to do (for one task).'),
        tasks: { type: 'array', description: 'Several tasks: each a title string, or an object with title and any of the other fields.', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { title: str('What to do.'), list: str('List name.'), date: str('Day.'), start_time: str('HH:MM.'), duration_minutes: { type: 'integer' }, priority: { type: 'integer' }, description: str('Notes.') }, required: ['title'] }] } },
        ...WHERE,
        priority: { type: 'integer', minimum: 0, maximum: 3, description: '1 must do, 2 should do, 3 nice to have, 0 none. Default: the user\'s setting.' },
        description: str('Optional notes.'),
      },
    },
    annotations: { title: 'Add tasks', ...CHANGE },
  },
  {
    name: 'update_task', title: 'Change a task',
    description: 'Rename a task, or change its priority or description. Only the fields given change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('The task id.'), title: str('New title.'),
        priority: { type: 'integer', minimum: 0, maximum: 3, description: '1, 2, 3, or 0 for none.' },
        description: str('New description; "" removes it.'),
        project: str('The list it belongs to (list name, or "" for none). A planned task keeps its day; one not planned moves into that list (@triage for "").'),
      },
      required: ['id'],
    },
    annotations: { title: 'Change a task', ...CHANGE, idempotentHint: true },
  },
  {
    name: 'move_task', title: 'Move tasks',
    description: "Move one task (id) or several (ids) to a list, to a day's to-do list (date), or to a day's calendar (date + start_time; several tasks are placed one after another from that time). Moving a done task makes it not done. Prefer one call with ids over many calls.",
    inputSchema: { type: 'object', properties: { id: str('The task id.'), ids: { type: 'array', items: { type: 'string' }, description: 'Several task ids at once (one confirmation for all of them).' }, from_list: str('Instead of ids: every task waiting in this list.'), overdue: { type: 'boolean', description: 'Instead of ids: every overdue task (unfinished, planned for a past day).' }, ...WHERE } },
    annotations: { title: 'Move tasks', ...CHANGE, idempotentHint: true },
  },
  {
    name: 'complete_task', title: 'Mark tasks done',
    description: 'Mark one task (id) or several (ids) done: today by default, or on another day (they then show in that day\'s done list).',
    inputSchema: { type: 'object', properties: { id: str('The task id.'), ids: { type: 'array', items: { type: 'string' }, description: 'Several task ids at once (one confirmation for all of them).' }, date: str('Done on this day, YYYY-MM-DD. Default today.') } },
    annotations: { title: 'Mark tasks done', ...CHANGE, idempotentHint: true },
  },
  {
    name: 'uncomplete_task', title: 'Mark tasks not done',
    description: 'Undo "done" for one task (id) or several (ids). Each goes back where it was; if that was a past day, it shows as overdue.',
    inputSchema: { type: 'object', properties: { id: str('The task id.'), ids: { type: 'array', items: { type: 'string' }, description: 'Several task ids at once (one confirmation for all of them).' } } },
    annotations: { title: 'Mark tasks not done', ...CHANGE, idempotentHint: true },
  },
  {
    name: 'delete_task', title: 'Delete tasks',
    description: 'Delete one task (id) or several (ids). They go to the trash, where the user can restore them in the app for 30 days.',
    inputSchema: { type: 'object', properties: { id: str('The task id.'), ids: { type: 'array', items: { type: 'string' }, description: 'Several task ids at once (one confirmation for all of them).' } } },
    annotations: { title: 'Delete tasks', ...DELETE },
  },
  {
    name: 'create_list', title: 'Create a list',
    description: 'Create a list (one word, letters and digits, like "weekly" or "kitchenReno"), optionally with a colour.',
    inputSchema: { type: 'object', properties: { name: str('List name.'), color: str(`Optional colour: ${COLOR_NAMES}.`) }, required: ['name'] },
    annotations: { title: 'Create a list', ...CHANGE },
  },
  {
    name: 'rename_list', title: 'Rename a list',
    description: 'Rename a list. @triage is built in and can\'t be renamed.',
    inputSchema: { type: 'object', properties: { list: str('Current name.'), new_name: str('New name.') }, required: ['list', 'new_name'] },
    annotations: { title: 'Rename a list', ...CHANGE, idempotentHint: true },
  },
  {
    name: 'set_list_color', title: "Set a project's colour",
    description: `Give a project a colour (it tints its list and its tasks in the app), or "" for none (white). Colours: ${COLOR_NAMES}. Not @triage.`,
    inputSchema: { type: 'object', properties: { list: str('Project (list) name.'), color: str('A colour name, or "" for none.') }, required: ['list', 'color'] },
    annotations: { title: "Set a project's colour", ...CHANGE, idempotentHint: true },
  },

  {
    name: 'archive_list', title: 'Archive a project',
    description: 'Archive a project (projects are never deleted): it leaves the Dashboard, nothing is lost. Only possible when none of its tasks is planned (complete, unplan or delete those first). archived: false brings it back. @triage can\'t be archived.',
    inputSchema: { type: 'object', properties: { list: str('Project (list) name.'), archived: { type: 'boolean', description: 'false to unarchive. Default true.' } }, required: ['list'] },
    annotations: { title: 'Archive a project', ...CHANGE, idempotentHint: true },
  },

];
const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

// ---- reading the database as the user ---------------------------------------------------

type Task = {
  id: string; title: string; priority: number | null; list_id: string;
  plan_date: string | null; start_min: number | null; duration_min: number | null;
  sort_order: number; done_on: string | null; notes?: string | null; created_at?: string;
  deleted_at?: string | null;   // in the trash (the app keeps it 30 days)
};
type List = { id: string; name: string; sort_order: number; color?: string | null; notes?: string | null; archived?: boolean };
type User = { id: string; email?: string; user_metadata?: Record<string, any> };

export class AuthError extends Error {}

export async function getUser(env: Env, token: string): Promise<User> {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env.apiKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new AuthError('Sign-in token is missing, wrong or expired.');
  return await res.json();
}

async function table<T>(env: Env, token: string, name: string): Promise<T[]> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${name}?select=*`, {
    headers: { apikey: env.apiKey, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('Sign-in token expired.');
  if (!res.ok) throw new Error(`Could not read ${name}: ${res.status} ${await res.text()}`);
  return await res.json();
}

// Changes, also as the user (row-level security applies; new rows get user_id = you).
export class Db {
  constructor(private env: Env, private token: string) {}
  private async send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.env.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: this.env.apiKey, Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) throw new AuthError('Sign-in token expired.');
    if (!res.ok) throw new Error(`Could not save (${res.status}): ${await res.text()}`);
  }
  insert(table: string, row: object) { return this.send('POST', table, [row]); }
  update(table: string, id: string, changes: object) { return this.send('PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, changes); }
  updateMany(table: string, ids: string[], changes: object) {
    if (!ids.length) return Promise.resolve();
    return this.send('PATCH', `${table}?id=in.(${ids.map(id => `"${id.replace(/"/g, '')}"`).join(',')})`, changes);
  }
  remove(table: string, ids: string[]) {
    if (!ids.length) return Promise.resolve();
    return this.send('DELETE', `${table}?id=in.(${ids.map(id => `"${id.replace(/"/g, '')}"`).join(',')})`);
  }
}

export type Data = { user: User; tasks: Task[]; lists: List[] };

export async function loadData(env: Env, token: string, user: User): Promise<Data> {
  const [tasks, lists] = await Promise.all([
    table<Task>(env, token, 'tasks'), table<List>(env, token, 'lists'),
  ]);
  return { user, tasks, lists };
}

// ---- dates and formatting (in the user's time zone; the app saves it as user_metadata.time_zone) ----

function timeZoneOf(user: User): string {
  const tz = user.user_metadata?.time_zone;
  try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch { /* unknown zone */ }
  return 'UTC';
}
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayName(iso: string, today: string): string {
  const words: Record<string, string> = { [today]: 'Today', [addDays(today, 1)]: 'Tomorrow', [addDays(today, -1)]: 'Yesterday' };
  const long = new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return words[iso] ? `${words[iso]}, ${long}` : long;
}
function clock(min: number, hour12: boolean): string {
  const h = Math.floor(min / 60) % 24, m = String(min % 60).padStart(2, '0');
  return hour12 ? `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${m}`;
}

// ---- the view: same rules as js/tasks.js ---------------------------------------------------

class View {
  today: string; timeZone: string; hour12: boolean;
  constructor(public d: Data) {
    this.timeZone = timeZoneOf(d.user);
    this.today = todayIn(this.timeZone);
    this.hour12 = d.user.user_metadata?.settings?.clock !== '24';
    // Deleted tasks (the trash) aren't part of the plan at all.
    d.tasks = d.tasks.filter(t => !t.deleted_at);
    // A list that's gone: a planned or done task has none (''), a waiting one is in @triage.
    const known = new Set(['triage', ...d.lists.map(l => l.id)]);
    d.tasks.forEach(t => {
      if (t.list_id && !known.has(t.list_id)) t.list_id = t.plan_date || t.done_on ? '' : 'triage';
      if (!t.list_id && !t.plan_date && !t.done_on) t.list_id = 'triage';   // waiting always sits in a list
    });
  }
  // "Now: Thursday, Nov 19, 2026, 9:05 AM (America/Los_Angeles); today is 2026-11-19." Starts every
  // read, so an AI app knows the date and time without asking.
  nowLine() {
    const time = new Intl.DateTimeFormat('en-US', { timeZone: this.timeZone, hour: 'numeric', minute: '2-digit', hour12: this.hour12 }).format(new Date());
    const day = new Date(`${this.today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `Now: ${day}, ${time} (${this.timeZone}); today is ${this.today}.`;
  }
  added(t: Task) {   // the day the task was created, in the user's time zone
    return t.created_at ? todayIn(this.timeZone, new Date(t.created_at)) : null;
  }
  // Not done, planned on a day before today: overdue (shown in the Overdue section; they keep their day).
  isLate = (t: Task) => !t.done_on && !!t.plan_date && t.plan_date < this.today;
  listName(id: string) {
    if (id === 'triage') return 'triage';
    return this.d.lists.find(l => l.id === id)?.name ?? 'triage';   // unknown list: the app shows it in @triage
  }
  line(t: Task, { time = false, done = false } = {}) {
    const parts = [`${done || t.done_on ? '[x]' : '[ ]'} ${t.title}`];
    if (time && t.start_min != null) parts.push(`${clock(t.start_min, this.hour12)}–${clock(t.start_min + (t.duration_min || 30), this.hour12)}`);
    if (t.priority) parts.push(`P${t.priority}`);
    if ((t.plan_date || t.done_on) && t.list_id && t.list_id !== 'triage') {   // its project (waiting ones sit in it)
      const p = this.d.lists.find(l => l.id === t.list_id);
      if (p) parts.push(`@${p.name}`);
    }
    const added = this.added(t);
    if (added) parts.push(`added ${added === this.today ? 'today' : added}`);
    if (t.notes && t.notes.trim()) {   // shown inline (shortened), so apps rarely need get_task
      const note = t.notes.trim().replace(/\s+/g, ' ');
      parts.push(`note: "${note.length > 140 ? `${note.slice(0, 140)}…` : note}"`);
    }
    return `- ${parts.join(' · ')}  [id: ${t.id}]`;
  }
  where(t: Task) {
    if (t.done_on) return `done on ${dayName(t.done_on, this.today)}`;
    if (this.isLate(t)) return `overdue (planned for ${dayName(t.plan_date!, this.today)}${t.start_min != null ? ` at ${clock(t.start_min, this.hour12)}` : ''}; it keeps that day until moved)`;
    if (t.plan_date && t.start_min != null) return `on the calendar ${dayName(t.plan_date, this.today)} at ${clock(t.start_min, this.hour12)}`;
    if (t.plan_date) return `on the to-do list for ${dayName(t.plan_date, this.today)}`;
    return `in @${this.listName(t.list_id)}`;
  }
  // Overdue tasks (a view, not a list), oldest first.
  overdue() {
    return this.d.tasks.filter(this.isLate)
      .sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || (a.start_min ?? 1e4) - (b.start_min ?? 1e4) || a.sort_order - b.sort_order);
  }
  waiting(listId: string) {
    const byOrder = (a: Task, b: Task) => a.sort_order - b.sort_order;
    const tasks = this.d.tasks;
    const known = (id: string) => id === 'triage' || this.d.lists.some(l => l.id === id);
    return tasks.filter(t => !t.done_on && !t.plan_date && (t.list_id === listId || (listId === 'triage' && !known(t.list_id)))).sort(byOrder);
  }
}

function getPlan(v: View, args: any): string {
  const start = args?.date ? parseDate(v, args.date) : v.today;
  const days = Math.min(Math.max(Number(args?.days) || 1, 1), 14);
  const out = [v.nowLine()];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const open = v.d.tasks.filter(t => !t.done_on && t.plan_date === date);
    const calendar = open.filter(t => t.start_min != null).sort((a, b) => a.start_min! - b.start_min!);
    const todo = open.filter(t => t.start_min == null).sort((a, b) => a.sort_order - b.sort_order);
    const done = v.d.tasks.filter(t => t.done_on === date);
    out.push('', `## ${dayName(date, v.today)} (${date})`);
    if (date < v.today && (calendar.length || todo.length)) out.push(`(Its ${calendar.length + todo.length} unfinished task(s) are overdue now.)`);
    else {
      out.push('Calendar:', ...(calendar.length ? calendar.map(t => v.line(t, { time: true })) : ['- (nothing)']));
      out.push('To-do:', ...(todo.length ? todo.map(t => v.line(t)) : ['- (nothing)']));
    }
    out.push('Done:', ...(done.length ? done.map(t => v.line(t, { done: true })) : ['- (nothing)']));
  }
  // Everything not planned yet, too (unless asked not to), so one call answers most questions.
  if (args?.include_lists !== false) out.push('', '# Waiting in lists (not planned yet)', '', listsBody(v, ''));
  return out.join('\n');
}

function getLists(v: View, args: any): string {
  return `${v.nowLine()}\n\n${listsBody(v, String(args?.list ?? ''))}`;
}
function listsBody(v: View, list: string): string {
  const wanted = list.replace(/^@/, '').trim().toLowerCase();
  const own = [
    { id: 'triage', name: 'triage', color: null as string | null | undefined },
    ...[...v.d.lists].filter(l => l.id !== 'triage').sort((a, b) => a.sort_order - b.sort_order),
  ];
  // Archived projects are hidden in the app; only shown here when asked for by name.
  const lists = own.filter(l => wanted ? l.name.toLowerCase() === wanted : !(l as List).archived);
  // Overdue isn't a list, but it's shown first (and when asked for "overdue" with no such list).
  const showOverdue = !wanted || (wanted === 'overdue' && !lists.length);
  if (wanted && !lists.length && !showOverdue) return `There's no list called @${wanted}. Lists: ${listNames(v)}.`;
  const out: string[] = [];
  const late = showOverdue ? v.overdue() : [];
  if (late.length || (showOverdue && wanted)) {
    out.push('## Overdue (unfinished tasks from past days; not a list: each keeps its day until moved)');
    out.push(...(late.length ? late.map(t => v.line(t)) : ['- (nothing overdue)']), '');
  }
  for (const l of lists) {
    const tasks = v.waiting(l.id);
    const color = l.color && Object.keys(COLORS).find(k => COLORS[k] === l.color);
    const planned = v.d.tasks.filter(t => t.list_id === l.id && t.plan_date && !t.done_on).length;
    out.push(`## @${l.name}${color ? ` (colour: ${color})` : ''}${planned ? ` (+ ${planned} planned on a day: get_project shows them)` : ''}`);
    out.push(...(tasks.length ? tasks.map(t => v.line(t)) : ['- (empty)']), '');
  }
  return out.join('\n');
}

function getProject(v: View, args: any): string {
  const l = findList(v, args?.project);
  need(l && l.id !== 'triage', `No project called @${String(args?.project ?? '').replace(/^@/, '')} (@triage is the default list, not a project: use get_lists). Projects: ${listNames(v).replace('@triage, ', '')}.`);
  const mine = v.d.tasks.filter(t => t.list_id === l!.id);
  const waiting = v.waiting(l!.id);
  const planned = mine.filter(t => t.plan_date && !t.done_on)
    .sort((a, b) => a.plan_date!.localeCompare(b.plan_date!) || (a.start_min ?? 1e4) - (b.start_min ?? 1e4));
  const done = mine.filter(t => t.done_on).sort((a, b) => b.done_on!.localeCompare(a.done_on!));
  const limit = args?.done_limit !== undefined ? Number(args.done_limit) : 10;
  const notes = ((l as List).notes || '').trim();
  return [
    v.nowLine(), '',
    `# @${l!.name}`,
    `${waiting.length} not planned · ${planned.length} planned · ${done.length} done`, '',
    '## Notes', notes || '(none)', '',
    '## Not planned', ...(waiting.length ? waiting.map(t => v.line(t)) : ['- (none)']), '',
    '## Planned', ...(planned.length ? planned.map(t => `${v.line(t, { time: true })} — ${v.where(t)}`) : ['- (none)']), '',
    `## Done (newest first${done.length > limit ? `, ${limit} of ${done.length}` : ''})`,
    ...(done.length ? done.slice(0, limit).map(t => `${v.line(t, { done: true })} — ${v.where(t)}`) : ['- (none)']),
  ].join('\n');
}

function searchTasks(v: View, args: any): string {
  const q = String(args?.query ?? '').trim().toLowerCase();
  const priority = args?.priority !== undefined ? Number(args.priority) : null;
  const list = args?.list ? findList(v, args.list) : null;
  if (args?.list) need(list, `No list called @${String(args.list).replace(/^@/, '')}. Lists: ${listNames(v)}.`);
  const addedOn = args?.added_on ? parseDate(v, args.added_on) : null;
  need(q || priority !== null || list || addedOn, 'Give text to search for, or a filter: priority, list or added_on.');
  const found = v.d.tasks.filter(t => (args?.include_done || !t.done_on)
    && (!q || t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q))
    && (priority === null || (t.priority || 0) === priority)
    && (!list || (!t.plan_date && !t.done_on && t.list_id === list.id))
    && (!addedOn || v.added(t) === addedOn));
  const what = [q && `"${args.query}"`, priority !== null && `P${priority}`, list && `in @${list.name}`, addedOn && `added ${addedOn}`].filter(Boolean).join(', ');
  if (!found.length) return `${v.nowLine()}\nNo ${args?.include_done ? '' : 'open '}tasks match ${what}.`;
  return `${v.nowLine()}\n${found.length} ${args?.include_done ? '' : 'open '}task(s) match ${what}:\n`
    + found.slice(0, 100).map(t => `${v.line(t, { time: true })} — ${v.where(t)}`).join('\n')
    + (found.length > 100 ? `\n…and ${found.length - 100} more; narrow it down.` : '');
}

function getTask(v: View, args: any): string {
  const t = v.d.tasks.find(x => x.id === String(args?.id ?? ''));
  if (!t) return `No task with id ${args?.id}.`;
  return [
    `Title: ${t.title}`,
    `Where: ${v.where(t)}`,
    t.plan_date && t.start_min != null ? `Time: ${clock(t.start_min, v.hour12)}–${clock(t.start_min + (t.duration_min || 30), v.hour12)}` : '',
    `Priority: ${t.priority ? `P${t.priority}` : 'none'}`,
    `Added: ${v.added(t) ?? 'unknown'}`,
    `Description: ${t.notes && t.notes.trim() ? `\n${t.notes}` : 'none'}`,
    `Id: ${t.id}`,
  ].filter(Boolean).join('\n');
}


// ---- changing things: same rules as js/tasks.js ----------------------------------------------

const LIST_NAME = /^[A-Za-z][A-Za-z0-9]{0,29}$/;   // as in js/config.js
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   // as js/utils.js

class Problem extends Error {}   // a mistake in what was asked: told back to the AI as is
const need = (ok: unknown, message: string) => { if (!ok) throw new Problem(message); };

type Ctx = { v: View; db: Db };

function findTask(v: View, id: unknown): Task {
  const t = v.d.tasks.find(x => x.id === String(id ?? ''));
  need(t, `No task with id ${id}. Use search_tasks or get_lists to find the id.`);
  return t!;
}
// A list by name (Overdue isn't a list: move_task takes overdue: true for that).
function findList(v: View, name: unknown): List | { id: 'triage'; name: string } | undefined {
  const n = String(name ?? '').replace(/^@/, '').trim().toLowerCase();
  if (n === 'triage') return v.d.lists.find(l => l.id === 'triage') || { id: 'triage', name: 'triage' };
  return v.d.lists.find(l => l.name.toLowerCase() === n);
}
function listNames(v: View) {
  return ['triage', ...v.d.lists.filter(l => l.id !== 'triage').map(l => l.name)].map(n => `@${n}`).join(', ');
}
// Dates as YYYY-MM-DD, or in words: today, tomorrow, yesterday, a weekday ("friday" = the coming
// one, today if it's Friday; "next friday" = a week later than that if it's today), "in 3 days".
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function parseDate(v: View, date: unknown): string {
  const d = String(date ?? '').trim().toLowerCase();
  if (d === 'today') return v.today;
  if (d === 'tomorrow') return addDays(v.today, 1);
  if (d === 'yesterday') return addDays(v.today, -1);
  const inDays = d.match(/^in (\d{1,3}) days?$/);
  if (inDays) return addDays(v.today, Number(inDays[1]));
  const wd = d.match(/^(next |this |last )?([a-z]+)$/);
  const idx = wd ? WEEKDAYS.findIndex(w => w.startsWith(wd[2]) && wd[2].length >= 3) : -1;
  if (wd && idx >= 0) {
    const dow = new Date(`${v.today}T12:00:00Z`).getUTCDay();
    if (wd[1] === 'last ') return addDays(v.today, -((dow - idx + 7) % 7 || 7));
    const ahead = (idx - dow + 7) % 7;
    return addDays(v.today, wd[1] === 'next ' && ahead === 0 ? 7 : ahead);
  }
  need(/^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(`${d}T12:00:00Z`)), `"${date}" isn't a date: use YYYY-MM-DD, or today, tomorrow, yesterday, a weekday, "next friday", "in 3 days".`);
  return d;
}
function parseTime(time: unknown): number {
  const m = String(time ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  need(m && Number(m[1]) < 24 && Number(m[2]) < 60, `"${time}" isn't a time: use 24-hour HH:MM, like 09:30 or 17:00.`);
  return Number(m![1]) * 60 + Number(m![2]);
}
const nextOrder = (items: Task[]) => items.reduce((max, t) => Math.max(max, t.sort_order + 1), 0);
const toDoOn = (v: View, date: string) => v.d.tasks.filter(t => !t.done_on && t.plan_date === date && t.start_min == null);
const settings = (v: View) => v.d.user.user_metadata?.settings || {};

// Finds an existing list or creates one, like typing @name in quick add.
async function listFor(c: Ctx, name: unknown): Promise<{ id: string; name: string; created?: boolean }> {
  const n = String(name ?? '').replace(/^@/, '').trim();
  const found = findList(c.v, n);
  if (found) return found;
  need(LIST_NAME.test(n), `"${n}" can't be a list name: one word, letters and digits, like weekly or kitchenReno.`);
  const list = { id: newId(), name: n, sort_order: c.v.d.lists.length };
  await c.db.insert('lists', list);
  c.v.d.lists.push(list);
  return { ...list, created: true };
}

// Where a task goes, from { list | date [+ start_time] [+ duration_minutes] }. Shared by add and move.
// Where a task goes. With a date it's planned on that day, and a list given too becomes its project
// (as "Dentist tomorrow 5pm @health" in the app). With only a list it waits in that list.
async function placement(c: Ctx, args: any) {
  if (args.date) {
    const date = parseDate(c.v, args.date);
    const start = args.start_time ? parseTime(args.start_time) : null;
    const project = args.list ? await listFor(c, args.list) : null;
    return { kind: 'day' as const, date, start, project };
  }
  if (args.list) return { kind: 'list' as const, list: await listFor(c, args.list) };
  need(!args.start_time, 'A start_time needs a date too.');
  return null;
}
const done = (c: Ctx, t: Task, extra = '') => `${extra}${c.v.line(t, { time: true })} — ${c.v.where(t)}`;

async function addTask(c: Ctx, args: any) {
  // Several at once: tasks: [{ title, … }]; fields at the top level are defaults for all of them.
  const { tasks: many, ...defaults } = args;
  const items = Array.isArray(many) && many.length ? many.map((x: any) => ({ ...defaults, ...(typeof x === 'string' ? { title: x } : x) })) : [args];
  for (const x of items) {   // check them all before adding any
    need(String(x.title ?? '').trim(), 'Every task needs a title.');
    if (x.date) parseDate(c.v, x.date);
    if (x.start_time) parseTime(x.start_time);
  }
  const lines = [];
  for (const x of items) lines.push(await addOne(c, x));
  return lines.join('\n');
}

async function addOne(c: Ctx, args: any) {
  const title = String(args.title ?? '').trim();
  const where = await placement(c, args) ?? { kind: 'list' as const, list: { id: 'triage', name: 'triage' } };
  const priority = args.priority !== undefined ? Number(args.priority) : Number(settings(c.v).defaultPriority || 0);
  const t: Task = {
    id: newId(), title, priority: priority || null,
    list_id: where.kind === 'list' ? where.list.id : where.project ? where.project.id : '',   // straight onto a day: no list
    plan_date: where.kind === 'day' ? where.date : null, start_min: where.kind === 'day' ? where.start : null,
    duration_min: Number(args.duration_minutes) || Number(settings(c.v).defaultDuration) || 30,
    sort_order: 0, done_on: null, created_at: new Date().toISOString(), ...(args.description ? { notes: String(args.description) } : {}),
  };
  if (where.kind === 'list') t.sort_order = nextOrder(c.v.waiting(t.list_id));
  else if (t.start_min == null) t.sort_order = nextOrder(toDoOn(c.v, t.plan_date!));
  await c.db.insert('tasks', t);
  c.v.d.tasks.push(t);
  const made = where.kind === 'list' ? where.list : where.project;
  return done(c, t, `Added: ${made && made.created ? `(new list @${made.name}) ` : ''}`);
}

async function updateTask(c: Ctx, args: any) {
  const t = findTask(c.v, args.id);
  const changes: Partial<Task> = {};
  if (args.title !== undefined) { changes.title = String(args.title).trim(); need(changes.title, 'The title can\'t be empty.'); }
  if (args.priority !== undefined) changes.priority = Number(args.priority) || null;
  if (args.description !== undefined) changes.notes = String(args.description);
  if (args.project !== undefined) {   // link to a project; a planned task keeps its day
    const name = String(args.project ?? '').trim();
    const target = name ? await listFor(c, name) : null;
    if (t.plan_date || t.done_on) changes.list_id = target ? target.id : '';
    else Object.assign(changes, { list_id: target ? target.id : 'triage', sort_order: nextOrder(c.v.waiting(target ? target.id : 'triage')) });
  }
  need(Object.keys(changes).length, 'Nothing to change: give a title, priority, description or project.');
  await c.db.update('tasks', t.id, changes);
  Object.assign(t, changes);
  return done(c, t, 'Updated: ');
}

// The tasks a change is about: "ids" (several, one confirmation in the AI app) or "id". All are
// checked before anything changes, so a typo in one id doesn't leave the rest half done.
function targets(c: Ctx, args: any): Task[] {
  if (args.overdue === true) {   // every overdue task (unfinished, planned for a past day)
    const late = c.v.overdue();
    need(late.length, 'Nothing is overdue.');
    return late;
  }
  if (args.from_list) {   // every task waiting in a list
    const list = findList(c.v, args.from_list);
    need(list, `No list called @${String(args.from_list).replace(/^@/, '')}. Lists: ${listNames(c.v)}.`);
    const waiting = c.v.waiting(list!.id);
    need(waiting.length, `@${list!.name} is empty.`);
    return waiting;
  }
  const ids: unknown[] = Array.isArray(args.ids) && args.ids.length ? args.ids : args.id !== undefined ? [args.id] : [];
  need(ids.length, 'Say which task: an id, ids for several, or from_list for a whole list.');
  return [...new Set(ids.map(String))].map(id => findTask(c.v, id));
}
const each = async (tasks: Task[], fn: (t: Task) => Promise<string>) => {
  const lines = [];
  for (const t of tasks) lines.push(await fn(t));
  return lines.join('\n');
};

async function moveTask(c: Ctx, args: any) {
  const tasks = targets(c, args);
  const where = await placement(c, args);
  need(where, 'Say where: a list, or a date (and a start_time for the calendar).');
  let start = where!.kind === 'day' ? where!.start : null;   // several onto the calendar: one after another
  return each(tasks, async t => {
    const changes: Partial<Task> = { done_on: null };
    if (where!.kind === 'list') {
      Object.assign(changes, { plan_date: null, start_min: null, list_id: where!.list.id, sort_order: nextOrder(c.v.waiting(where!.list.id)) });
    } else {
      // Onto a day: it keeps the list it came from (to move back later), or takes the list given.
      const project = where!.project ? where!.project.id : t.list_id;
      Object.assign(changes, { plan_date: where!.date, start_min: start, list_id: project });
      if (start == null) changes.sort_order = nextOrder(toDoOn(c.v, where!.date).filter(x => x.id !== t.id));
    }
    if (args.duration_minutes) changes.duration_min = Number(args.duration_minutes);
    if (start != null) start = Math.min(start + (changes.duration_min ?? t.duration_min ?? 30), 24 * 60 - 15);
    await c.db.update('tasks', t.id, changes);
    Object.assign(t, changes);
    return done(c, t, 'Moved: ');
  });
}

async function completeTask(c: Ctx, args: any) {
  const tasks = targets(c, args);
  const date = args.date ? parseDate(c.v, args.date) : c.v.today;
  need(date <= c.v.today, "Can't mark a task done on a future day.");
  return each(tasks, async t => {
    const changes: Partial<Task> = { done_on: date };
    // Done on another day than today: it's logged on that day (markDone in js/tasks.js).
    if (date !== c.v.today && t.plan_date !== date) Object.assign(changes, { plan_date: date, start_min: null });
    await c.db.update('tasks', t.id, changes);
    Object.assign(t, changes);
    return done(c, t, 'Done: ');
  });
}

async function uncompleteTask(c: Ctx, args: any) {
  const tasks = targets(c, args);
  const notDone = tasks.find(t => !t.done_on);
  need(!notDone, `"${notDone?.title}" isn't done.`);
  return each(tasks, async t => {
    const changes: Partial<Task> = { done_on: null };   // a past day's task then shows as overdue (it keeps its day)
    await c.db.update('tasks', t.id, changes);
    Object.assign(t, changes);
    return done(c, t, 'Not done any more: ');
  });
}

async function deleteTask(c: Ctx, args: any) {
  const tasks = targets(c, args);
  // Into the trash, like the app: restorable for 30 days in Settings → Archive & trash.
  await c.db.updateMany('tasks', tasks.map(t => t.id), { deleted_at: new Date().toISOString() });
  const gone = new Set(tasks.map(t => t.id));
  c.v.d.tasks = c.v.d.tasks.filter(x => !gone.has(x.id));
  return `Deleted ${tasks.map(t => `"${t.title}"`).join(', ')} (in the trash for 30 days: Settings → Archive & trash in the app).`;
}

async function createList(c: Ctx, args: any) {
  const name = String(args.name ?? '').replace(/^@/, '').trim();
  need(!findList(c.v, name), `There's already a list called @${findList(c.v, name)?.name}.`);
  const color = args.color ? colorFor(args.color) : null;
  const list = await listFor(c, name);
  if (color) await c.db.update('lists', list.id, { color });
  return `Created @${list.name}${color ? ` (${String(args.color).toLowerCase()})` : ''}.`;
}

function ownList(c: Ctx, name: unknown, verb: string): List {
  const l = findList(c.v, name);
  need(l, `No list called @${String(name).replace(/^@/, '')}. Lists: ${listNames(c.v)}.`);
  need(l!.id !== 'triage', `@triage is built in and can't be ${verb}.`);
  return l as List;
}

async function renameList(c: Ctx, args: any) {
  const l = ownList(c, args.list, 'renamed');
  const name = String(args.new_name ?? '').replace(/^@/, '').trim();
  need(name.toLowerCase() !== 'triage', '@triage is a built-in list name. Pick another.');
  need(LIST_NAME.test(name), `"${name}" can't be a list name: one word, letters and digits.`);
  const clash = findList(c.v, name);
  need(!clash || clash.id === l.id, `There's already a list called @${clash?.name}.`);
  await c.db.update('lists', l.id, { name });
  const old = l.name;
  l.name = name;
  return `Renamed @${old} to @${name}.`;
}

function colorFor(name: unknown): string {
  const hex = COLORS[String(name).trim().toLowerCase()];
  need(hex, `No colour "${name}". Colours: ${COLOR_NAMES}, or "" for none.`);
  return hex;
}

async function setListColor(c: Ctx, args: any) {
  const l = ownList(c, args.list, 'given a colour');
  const color = String(args.color ?? '').trim() ? colorFor(args.color) : null;
  await c.db.update('lists', l.id, { color });
  l.color = color;
  return color ? `@${l.name} is now ${String(args.color).toLowerCase()}.` : `@${l.name} has no colour now (white).`;
}

async function archiveList(c: Ctx, args: any) {
  const l = ownList(c, args.list, 'archived');
  const on = args.archived !== false;
  const planned = c.v.d.tasks.filter(t => t.list_id === l.id && t.plan_date && !t.done_on);
  need(!on || !planned.length, `@${l.name} still has ${planned.length} planned task${planned.length === 1 ? '' : 's'} (${planned.map(t => `"${t.title}"`).join(', ')}). A project can only be archived when none of its tasks is planned: complete them, move them back to the list, or delete them first.`);
  await c.db.update('lists', l.id, { archived: on });
  l.archived = on;
  return on ? `Archived @${l.name}. Unarchive with archived: false.` : `@${l.name} is back on the Dashboard.`;
}


const RUN: Record<string, (c: Ctx, args: any) => string | Promise<string>> = {
  get_plan: (c, a) => getPlan(c.v, a), get_project: (c, a) => getProject(c.v, a), get_lists: (c, a) => getLists(c.v, a), search_tasks: (c, a) => searchTasks(c.v, a), get_task: (c, a) => getTask(c.v, a),
  add_task: addTask, update_task: updateTask, move_task: moveTask, complete_task: completeTask,
  uncomplete_task: uncompleteTask, delete_task: deleteTask, create_list: createList, rename_list: renameList,
  set_list_color: setListColor, archive_list: archiveList,
};

// ---- the protocol: JSON-RPC over HTTP POST ----------------------------------------------------

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };
const reply = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

// Answers one JSON-RPC message. `load` fetches the user's data (only called for tool calls);
// `db` saves changes.
export async function answer(msg: Rpc, load: () => Promise<Data>, db: Db) {
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return reply(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply(msg.id, {});
    case 'tools/list':
      return reply(msg.id, { tools: TOOLS });
    case 'tools/call': {
      const run = RUN[msg.params?.name];
      if (!run) return fail(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
      try {
        const text = await run({ v: new View(await load()), db }, msg.params?.arguments ?? {});
        return reply(msg.id, { content: [{ type: 'text', text }], isError: false });
      } catch (err) {
        if (err instanceof AuthError) throw err;
        const text = err instanceof Problem ? (err as Error).message : `Something went wrong: ${(err as Error).message}`;
        return reply(msg.id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      return fail(msg.id, -32601, `Unknown method: ${msg.method}`);
  }
}

// Where this server lives, and the document that tells AI apps where to sign in (RFC 9728).
export const resourceUrl = (env: Env) => `${env.supabaseUrl}/functions/v1/mcp`;
export const metadataUrl = (env: Env) => `${resourceUrl(env)}/.well-known/oauth-protected-resource`;
export function protectedResourceMetadata(env: Env) {
  return {
    resource: resourceUrl(env),
    authorization_servers: [`${env.supabaseUrl}/auth/v1`],
    scopes_supported: ['email'],
    bearer_methods_supported: ['header'],
    resource_name: 'Planner',
  };
}

// The whole HTTP side. `env` says which Supabase project to read.
// Some AI apps (possibly Gemini on the web) talk to the server from inside a web page, so every
// answer allows that (CORS), including reading the WWW-Authenticate sign-in pointer.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

export async function handle(req: Request, env: Env): Promise<Response> {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...headers } });
  const unauthorized = (message: string) => json({ error: 'unauthorized', message }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl(env)}", scope="email"`,
  });
  const path = new URL(req.url).pathname;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  // One line per request in Supabase's function logs (no tokens, no content): helps when an AI
  // app can't connect. Dashboard → Edge Functions → mcp → Logs.
  console.log(JSON.stringify({ method: req.method, path, signedIn: !!token, client: req.headers.get('User-Agent') }));

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });   // a browser asking first
  if (path.endsWith('/.well-known/oauth-protected-resource')) {
    return json(protectedResourceMetadata(env), 200, { 'Cache-Control': 'max-age=3600' });
  }
  // Not signed in: always "401 + where to sign in", whatever the method, so any app that checks
  // first (some send a GET before anything else) learns this server uses standard OAuth.
  if (!token) return unauthorized('Sign in to Planner to connect.');
  let user: User;
  try { user = await getUser(env, token); } catch (err) { return unauthorized((err as Error).message); }
  // Signed in: we only answer POSTs (no server-sent event stream, no sessions to delete).
  if (req.method !== 'POST') return new Response('Planner MCP server: send MCP requests with POST.', { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } });

  let body: any;
  try { body = await req.json(); } catch { return json(fail(null, -32700, 'Not valid JSON'), 400); }
  const messages: Rpc[] = Array.isArray(body) ? body : [body];
  let data: Promise<Data> | null = null;
  const load = () => (data ??= loadData(env, token, user));   // at most once per request
  const db = new Db(env, token);

  const answers = [];
  try {
    for (const m of messages) {
      if (m.id === undefined || m.id === null) continue;   // a notification: nothing to answer
      answers.push(await answer(m, load, db));
    }
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    throw err;
  }
  if (!answers.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? answers : answers[0]);
}
