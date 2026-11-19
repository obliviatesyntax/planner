// planner.ts — the Planner MCP server: lets Claude (or another AI app) read your Planner.
//
// MCP ("Model Context Protocol") is how AI apps call outside tools. Claude sends small JSON
// requests ("which tools do you have?", "run get_plan for tomorrow") over HTTPS, and this answers.
//
//   Who you are: every request carries your Supabase sign-in token (Authorization: Bearer …).
//   We read the database AS YOU with that token, so the same row-level security as the app
//   applies: you only ever see your own tasks. No admin key is used anywhere here.
//
//   Read-only for now: get_plan, get_lists, search_tasks, get_task. Nothing here writes.
//
// The rules for where a task shows up are the same as js/tasks.js (listTasks, planList,
// calendarList, doneList); keep them in step. One difference: the app moves unfinished tasks
// from past days to @overdue when it opens; here, without writing, we show them as overdue.
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
const SERVER_INFO = { name: 'planner', title: 'Planner', version: '0.1.0' };
const INSTRUCTIONS = `Planner is the user's daily planner. Tasks either wait in lists (@triage is the inbox,
@overdue holds unfinished tasks from past days, other lists are projects like @salesDeck) or are planned
on a day: on that day's calendar (with a time) or its to-do list (no time). Done tasks are logged on the
day they were done. Priorities: P1 must do, P2 should do, P3 nice to have. Labels look like #w (Work).
Dates are in the user's time zone; get_plan with no date means today. This connection is read-only.`;

// ---- the tools -----------------------------------------------------------------------

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const TOOLS = [
  {
    name: 'get_plan',
    title: 'Get the plan',
    description: "The user's plan for one or more days: each day's calendar (timed tasks), to-do list (no time) and what was done. Defaults to today.",
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'First day, YYYY-MM-DD. Default: today in the user\'s time zone.' },
        days: { type: 'integer', minimum: 1, maximum: 14, description: 'How many days from that date. Default 1.' },
      },
    },
    annotations: { title: 'Get the plan', ...READ_ONLY },
  },
  {
    name: 'get_lists',
    title: 'Get lists',
    description: 'Tasks waiting in lists, not yet planned on a day: @overdue (unfinished from past days), @triage (inbox) and project lists. Also returns the labels that exist.',
    inputSchema: {
      type: 'object',
      properties: {
        list: { type: 'string', description: 'Only this list, by name (with or without @). Default: all lists.' },
      },
    },
    annotations: { title: 'Get lists', ...READ_ONLY },
  },
  {
    name: 'search_tasks',
    title: 'Search tasks',
    description: 'Find tasks whose title or description contains the text (not case-sensitive). Says where each one is: which list, day or time, or when it was done.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to look for.' },
        include_done: { type: 'boolean', description: 'Also search done tasks. Default false.' },
      },
      required: ['query'],
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

// ---- reading the database as the user ---------------------------------------------------

type Task = {
  id: string; title: string; priority: number | null; labels: string[]; list_id: string;
  plan_date: string | null; start_min: number | null; duration_min: number | null;
  sort_order: number; done_on: string | null; notes?: string | null;
};
type List = { id: string; name: string; sort_order: number; label_id?: string | null };
type Label = { id: string; name: string; shortcut: string; sort_order: number };
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

export type Data = { user: User; tasks: Task[]; lists: List[]; labels: Label[] };

export async function loadData(env: Env, token: string, user: User): Promise<Data> {
  const [tasks, lists, labels] = await Promise.all([
    table<Task>(env, token, 'tasks'), table<List>(env, token, 'lists'), table<Label>(env, token, 'labels'),
  ]);
  return { user, tasks, lists, labels };
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
  }
  // Not done, planned on a day before today: the app moves these to @overdue when it opens.
  isLate = (t: Task) => !t.done_on && !!t.plan_date && t.plan_date < this.today;
  listName(id: string) {
    if (id === 'overdue') return 'overdue';
    if (id === 'triage') return 'triage';
    return this.d.lists.find(l => l.id === id)?.name ?? 'triage';   // unknown list: the app shows it in @triage
  }
  labelText(t: Task) {
    return (t.labels || []).map(id => this.d.labels.find(l => l.id === id)).filter(Boolean).map(l => `#${l!.shortcut}`).join(' ');
  }
  line(t: Task, { time = false, done = false } = {}) {
    const parts = [`${done || t.done_on ? '[x]' : '[ ]'} ${t.title}`];
    if (time && t.start_min != null) parts.push(`${clock(t.start_min, this.hour12)}–${clock(t.start_min + (t.duration_min || 30), this.hour12)}`);
    if (t.priority) parts.push(`P${t.priority}`);
    const labels = this.labelText(t);
    if (labels) parts.push(labels);
    if (t.notes && t.notes.trim()) parts.push('(has a description)');
    return `- ${parts.join(' · ')}  [id: ${t.id}]`;
  }
  where(t: Task) {
    if (t.done_on) return `done on ${dayName(t.done_on, this.today)}`;
    if (this.isLate(t)) return `@overdue (was planned for ${dayName(t.plan_date!, this.today)})`;
    if (t.plan_date && t.start_min != null) return `on the calendar ${dayName(t.plan_date, this.today)} at ${clock(t.start_min, this.hour12)}`;
    if (t.plan_date) return `on the to-do list for ${dayName(t.plan_date, this.today)}`;
    return `in @${this.listName(t.list_id)}`;
  }
  waiting(listId: string) {
    const byOrder = (a: Task, b: Task) => a.sort_order - b.sort_order;
    const tasks = this.d.tasks;
    if (listId === 'overdue') return tasks.filter(t => !t.done_on && ((!t.plan_date && t.list_id === 'overdue') || this.isLate(t))).sort(byOrder);
    const known = (id: string) => id === 'triage' || id === 'overdue' || this.d.lists.some(l => l.id === id);
    return tasks.filter(t => !t.done_on && !t.plan_date && (t.list_id === listId || (listId === 'triage' && !known(t.list_id)))).sort(byOrder);
  }
}

function getPlan(v: View, args: any): string {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(args?.date ?? '') ? args.date : v.today;
  const days = Math.min(Math.max(Number(args?.days) || 1, 1), 14);
  const out = [`Time zone: ${v.timeZone}. Today is ${dayName(v.today, v.today)}.`];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const open = v.d.tasks.filter(t => !t.done_on && t.plan_date === date);
    const calendar = open.filter(t => t.start_min != null).sort((a, b) => a.start_min! - b.start_min!);
    const todo = open.filter(t => t.start_min == null).sort((a, b) => a.sort_order - b.sort_order);
    const done = v.d.tasks.filter(t => t.done_on === date);
    out.push('', `## ${dayName(date, v.today)} (${date})`);
    if (date < v.today && (calendar.length || todo.length)) out.push('(Unfinished tasks from this day are in @overdue now.)');
    else {
      out.push('Calendar:', ...(calendar.length ? calendar.map(t => v.line(t, { time: true })) : ['- (nothing)']));
      out.push('To-do:', ...(todo.length ? todo.map(t => v.line(t)) : ['- (nothing)']));
    }
    out.push('Done:', ...(done.length ? done.map(t => v.line(t, { done: true })) : ['- (nothing)']));
  }
  return out.join('\n');
}

function getLists(v: View, args: any): string {
  const wanted = String(args?.list ?? '').replace(/^@/, '').trim().toLowerCase();
  const lists = [
    { id: 'overdue', name: 'overdue', label_id: null },
    { id: 'triage', name: 'triage', label_id: null },
    ...[...v.d.lists].filter(l => l.id !== 'triage').sort((a, b) => a.sort_order - b.sort_order),
  ].filter(l => !wanted || l.name.toLowerCase() === wanted);
  if (wanted && !lists.length) return `There's no list called @${wanted}. Lists: ${['overdue', 'triage', ...v.d.lists.filter(l => l.id !== 'triage').map(l => l.name)].map(n => `@${n}`).join(', ')}`;
  const out: string[] = [];
  for (const l of lists) {
    const tasks = v.waiting(l.id);
    if (l.id === 'overdue' && !tasks.length && !wanted) continue;   // the app hides an empty @overdue
    const label = l.label_id && v.d.labels.find(x => x.id === l.label_id);
    out.push(`## @${l.name}${label ? ` (label #${label.shortcut}: its tasks count as ${label.name})` : ''}`);
    out.push(...(tasks.length ? tasks.map(t => v.line(t)) : ['- (empty)']), '');
  }
  const labels = [...v.d.labels].sort((a, b) => a.sort_order - b.sort_order);
  out.push(`Labels: ${labels.length ? labels.map(l => `${l.name} #${l.shortcut}`).join(', ') : '(none)'}`);
  return out.join('\n');
}

function searchTasks(v: View, args: any): string {
  const q = String(args?.query ?? '').trim().toLowerCase();
  if (!q) return 'Give some text to search for.';
  const found = v.d.tasks.filter(t => (args?.include_done || !t.done_on)
    && (t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)));
  if (!found.length) return `No ${args?.include_done ? '' : 'open '}tasks match "${args.query}".`;
  return found.slice(0, 50).map(t => `${v.line(t)} — ${v.where(t)}`).join('\n')
    + (found.length > 50 ? `\n…and ${found.length - 50} more; search for something more specific.` : '');
}

function getTask(v: View, args: any): string {
  const t = v.d.tasks.find(x => x.id === String(args?.id ?? ''));
  if (!t) return `No task with id ${args?.id}.`;
  return [
    `Title: ${t.title}`,
    `Where: ${v.where(t)}`,
    t.plan_date && t.start_min != null ? `Time: ${clock(t.start_min, v.hour12)}–${clock(t.start_min + (t.duration_min || 30), v.hour12)}` : '',
    `Priority: ${t.priority ? `P${t.priority}` : 'none'}`,
    `Labels: ${v.labelText(t) || 'none'}`,
    `Description: ${t.notes && t.notes.trim() ? `\n${t.notes}` : 'none'}`,
    `Id: ${t.id}`,
  ].filter(Boolean).join('\n');
}

const RUN: Record<string, (v: View, args: any) => string> = {
  get_plan: getPlan, get_lists: getLists, search_tasks: searchTasks, get_task: getTask,
};

// ---- the protocol: JSON-RPC over HTTP POST ----------------------------------------------------

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };
const reply = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

// Answers one JSON-RPC message. `load` fetches the user's data (only called for tool calls).
export async function answer(msg: Rpc, load: () => Promise<Data>) {
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
        const text = run(new View(await load()), msg.params?.arguments ?? {});
        return reply(msg.id, { content: [{ type: 'text', text }], isError: false });
      } catch (err) {
        if (err instanceof AuthError) throw err;
        return reply(msg.id, { content: [{ type: 'text', text: `Something went wrong: ${(err as Error).message}` }], isError: true });
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
export async function handle(req: Request, env: Env): Promise<Response> {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const unauthorized = (message: string) => json({ error: 'unauthorized', message }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl(env)}", scope="email"`,
  });

  if (new URL(req.url).pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return json(protectedResourceMetadata(env), 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' });
  }
  if (req.method !== 'POST') return new Response('Planner MCP server: send MCP requests with POST.', { status: 405, headers: { Allow: 'POST' } });

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return unauthorized('Connect with your Planner sign-in token.');
  let user: User;
  try { user = await getUser(env, token); } catch (err) { return unauthorized((err as Error).message); }

  let body: any;
  try { body = await req.json(); } catch { return json(fail(null, -32700, 'Not valid JSON'), 400); }
  const messages: Rpc[] = Array.isArray(body) ? body : [body];
  let data: Promise<Data> | null = null;
  const load = () => (data ??= loadData(env, token, user));   // at most once per request

  const answers = [];
  try {
    for (const m of messages) {
      if (m.id === undefined || m.id === null) continue;   // a notification: nothing to answer
      answers.push(await answer(m, load));
    }
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    throw err;
  }
  if (!answers.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? answers : answers[0]);
}
