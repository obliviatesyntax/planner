// Tests for planner.ts, with a pretend Supabase (no network). Run: deno test supabase/functions/mcp
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { handle, todayIn } from './planner.ts';

const env = { supabaseUrl: 'https://example.supabase.co', apiKey: 'test-key' };
const tz = 'America/Los_Angeles';
const today = todayIn(tz);
const shift = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const BASE: Record<string, any[]> = {
  tasks: [
    { id: 't1', title: 'Design review', priority: 2, labels: ['w'], list_id: 'triage', plan_date: today, start_min: 600, duration_min: 60, sort_order: 0, done_on: null },
    { id: 't2', title: 'Reply to Sam', priority: null, labels: [], list_id: 'triage', plan_date: today, start_min: null, duration_min: 30, sort_order: 1, done_on: null, notes: 'about the passport form' },
    { id: 't3', title: 'Morning run', priority: null, labels: [], list_id: 'triage', plan_date: today, start_min: null, duration_min: 30, sort_order: 2, done_on: today },
    { id: 't4', title: 'Book flights', priority: 2, labels: [], list_id: 'triage', plan_date: shift(-1), start_min: null, duration_min: 30, sort_order: 0, done_on: null },
    { id: 't5', title: 'Renew passport', priority: null, labels: [], list_id: 'triage', plan_date: null, start_min: null, duration_min: 30, sort_order: 0, done_on: null },
    { id: 't6', title: 'Update pricing slide', priority: 1, labels: [], list_id: 'sales', plan_date: null, start_min: null, duration_min: 30, sort_order: 0, done_on: null },
  ],
  lists: [{ id: 'sales', name: 'salesDeck', sort_order: 0, label_id: 'w' }],
  labels: [{ id: 'w', name: 'Work', shortcut: 'w', sort_order: 0 }],
};

let DB: Record<string, any[]> = structuredClone(BASE);
const fresh = () => { DB = structuredClone(BASE); };
const row = (table: string, id: string) => DB[table].find(r => r.id === id);

// Pretend Supabase: /auth/v1/user and /rest/v1/<table> (read, insert, update, delete by id),
// only for the token "good".
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const auth = new Headers(init?.headers).get('Authorization');
  if (auth !== 'Bearer good') return new Response('{"msg":"bad jwt"}', { status: 401 });
  if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: 'u1', user_metadata: { time_zone: tz, settings: { defaultDuration: 45 } } });
  const name = url.pathname.match(/rest\/v1\/(\w+)/)![1];
  const method = init?.method ?? 'GET';
  const id = url.searchParams.get('id') ?? '';
  const ids = id.startsWith('eq.') ? [id.slice(3)] : id.startsWith('in.(') ? id.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : [];
  if (method === 'GET') return Response.json(DB[name]);
  if (method === 'POST') { DB[name].push(...JSON.parse(String(init!.body))); return new Response(null, { status: 201 }); }
  if (method === 'PATCH') { DB[name].filter(r => ids.includes(r.id)).forEach(r => Object.assign(r, JSON.parse(String(init!.body)))); return new Response(null, { status: 204 }); }
  if (method === 'DELETE') { DB[name] = DB[name].filter(r => !ids.includes(r.id)); return new Response(null, { status: 204 }); }
  return new Response('?', { status: 400 });
}) as typeof fetch;

const post = (body: unknown, token = 'good') => handle(new Request('https://x/mcp', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env);
const call = async (name: string, args = {}) => {
  const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const body = await res.json();
  return body.result.content[0].text as string;
};
const callError = async (name: string, args = {}) => {
  const body = await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).json();
  assert(body.result.isError, `${name} should have failed`);
  return body.result.content[0].text as string;
};

Deno.test('no or bad token: 401 asking to sign in', async () => {
  assertEquals((await post({ jsonrpc: '2.0', id: 1, method: 'initialize' }, '')).status, 401);
  const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'bad');
  assertEquals(res.status, 401);
  assertEquals(res.headers.get('WWW-Authenticate'),
    'Bearer resource_metadata="https://example.supabase.co/functions/v1/mcp/.well-known/oauth-protected-resource", scope="email"');
});

Deno.test('any unsigned request points to sign-in; browsers may ask first (CORS)', async () => {
  for (const method of ['GET', 'HEAD', 'DELETE']) {
    const res = await handle(new Request('https://x/mcp', { method }), env);
    assertEquals(res.status, 401, method);
    assert(res.headers.get('WWW-Authenticate')?.includes('resource_metadata='), method);
    assertEquals(res.headers.get('Access-Control-Expose-Headers'), 'WWW-Authenticate, Mcp-Session-Id');
  }
  const pre = await handle(new Request('https://x/mcp', { method: 'OPTIONS' }), env);
  assertEquals(pre.status, 204);
  assertStringIncludes(pre.headers.get('Access-Control-Allow-Headers')!, 'Authorization');
  const signedInGet = await handle(new Request('https://x/mcp', { headers: { Authorization: 'Bearer good' } }), env);
  assertEquals(signedInGet.status, 405);
});

Deno.test('protected resource metadata names Supabase Auth as the sign-in server', async () => {
  const res = await handle(new Request('https://x/mcp/.well-known/oauth-protected-resource'), env);
  assertEquals(res.status, 200);
  const meta = await res.json();
  assertEquals(meta.resource, 'https://example.supabase.co/functions/v1/mcp');
  assertEquals(meta.authorization_servers, ['https://example.supabase.co/auth/v1']);
});

Deno.test('initialize, notifications and tools/list', async () => {
  const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
  assertEquals(init.result.protocolVersion, '2025-06-18');
  assertEquals(init.result.serverInfo.name, 'planner');
  assertEquals((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  const tools = Object.fromEntries(list.result.tools.map((t: any) => [t.name, t.annotations]));
  for (const name of ['get_plan', 'get_lists', 'search_tasks', 'get_task']) assert(tools[name].readOnlyHint);
  for (const name of ['add_task', 'move_task', 'complete_task', 'create_list']) assert(!tools[name].readOnlyHint && !tools[name].destructiveHint);
  for (const name of ['delete_task', 'delete_list', 'delete_label']) assert(tools[name].destructiveHint);
});

Deno.test('get_plan: today, calendar / to-do / done', async () => {
  fresh();
  const text = await call('get_plan', { include_lists: false });
  assertStringIncludes(text, `(${tz}); today is ${today}.`);
  assertStringIncludes(text, '[ ] Design review · 10:00 AM–11:00 AM · P2 · #w  [id: t1]');
  assertStringIncludes(text, '[ ] Reply to Sam · note: "about the passport form"');
  assertStringIncludes(text, '[x] Morning run');
  assert(!text.includes('Book flights'));   // yesterday's: in @overdue, not today
  // by default the lists come along, so one call answers most questions
  const all = await call('get_plan');
  assertStringIncludes(all, '# Waiting in lists');
  assertStringIncludes(all, '[ ] Book flights · P2');
  assertStringIncludes(all, 'Labels: Work #w');
  // dates in words
  assertStringIncludes(await call('get_plan', { date: 'yesterday', include_lists: false }), `## Yesterday`);
  assertStringIncludes(await call('get_plan', { date: 'in 2 days', include_lists: false }), `(${shift(2)})`);
});

Deno.test('get_lists: overdue first, list labels, labels at the end', async () => {
  const text = await call('get_lists');
  assert(text.indexOf('## Overdue') >= 0 && text.indexOf('## Overdue') < text.indexOf('@triage'));
  assertStringIncludes(text, '[ ] Book flights · P2');
  assertStringIncludes(text, '## @salesDeck (label #w');
  assertStringIncludes(text, 'Labels: Work #w');
  assertStringIncludes(await call('get_lists', { list: '@nope' }), "There's no list called @nope");
});

Deno.test('search_tasks and get_task', async () => {
  assertStringIncludes(await call('search_tasks', { query: 'passport' }), 'Renew passport');
  assertStringIncludes(await call('search_tasks', { query: 'passport' }), 'Reply to Sam');   // matched its description
  assertStringIncludes(await call('search_tasks', { query: 'flights' }), 'overdue (planned for Yesterday');
  assert(!(await call('search_tasks', { query: 'run' })).includes('Morning run'));
  assertStringIncludes(await call('search_tasks', { query: 'run', include_done: true }), 'done on Today');
  assertStringIncludes(await call('get_task', { id: 't2' }), 'about the passport form');
});

// ---- changing things --------------------------------------------------------------------------

Deno.test('add_task: @triage by default, a day, a calendar time, a new list', async () => {
  fresh();
  assertStringIncludes(await call('add_task', { title: 'Buy milk' }), 'in @triage');
  const t = DB.tasks.find(r => r.title === 'Buy milk');
  assertEquals([t.list_id, t.plan_date, t.duration_min, t.sort_order], ['triage', null, 45, 1]);   // after Renew passport

  assertStringIncludes(await call('add_task', { title: 'Call mom', date: today, start_time: '21:00', priority: 2, labels: ['work'] }),
    'Call mom · 9:00 PM–9:45 PM · P2 · #w');
  assertEquals(DB.tasks.find(r => r.title === 'Call mom').start_min, 21 * 60);

  assertStringIncludes(await call('add_task', { title: 'Sand it', list: 'birdhouse' }), '(new list @birdhouse)');
  assert(DB.lists.some(l => l.name === 'birdhouse'));

  assertStringIncludes(await call('add_task', { title: 'x', list: 'overdue' }), '(new list @overdue)');   // the name is free
  assertStringIncludes(await callError('add_task', { title: 'x', labels: ['nope'] }), 'No label "nope"');
  assertStringIncludes(await callError('add_task', { title: 'x', date: '2026-13-45' }), "isn't a date");
  assertStringIncludes(await callError('add_task', { title: 'x', date: today, start_time: '25:00' }), "isn't a time");
});

Deno.test("move_task: onto a day keeps its list (@triage too); to a list un-plans", async () => {
  fresh();
  const moved = await call('move_task', { id: 't6', date: today, start_time: '14:00' });
  assertStringIncludes(moved, `on the calendar Today`);
  assertStringIncludes(moved, '@salesDeck');                     // the planned task shows its project
  assertEquals([row('tasks', 't6').list_id, row('tasks', 't6').labels], ['sales', []]);   // kept; no label copied
  await call('move_task', { id: 't5', date: today });            // from @triage: stays in @triage
  assertEquals(row('tasks', 't5').list_id, 'triage');
  await call('move_task', { id: 't1', list: 'triage' });
  assertEquals([row('tasks', 't1').plan_date, row('tasks', 't1').start_min, row('tasks', 't1').list_id], [null, null, 'triage']);
  assertStringIncludes(await callError('move_task', { id: 't1' }), 'Say where');
  assertStringIncludes(await callError('move_task', { id: 'nope', list: 'triage' }), 'No task with id nope');
});

Deno.test('complete_task / uncomplete_task, and back to @overdue from a past day', async () => {
  fresh();
  await call('complete_task', { id: 't2' });
  assertEquals(row('tasks', 't2').done_on, today);
  await call('uncomplete_task', { id: 't2' });
  assertEquals([row('tasks', 't2').done_on, row('tasks', 't2').plan_date], [null, today]);

  await call('complete_task', { id: 't4', date: shift(-1) });   // yesterday's task, done yesterday
  assertEquals(row('tasks', 't4').done_on, shift(-1));
  await call('uncomplete_task', { id: 't4' });
  assertEquals([row('tasks', 't4').plan_date, row('tasks', 't4').done_on], [shift(-1), null]);   // keeps its day…
  assertStringIncludes(await call('get_lists', { list: 'overdue' }), 'Book flights');           // …and shows in @overdue
  assertStringIncludes(await callError('complete_task', { id: 't5', date: shift(2) }), 'future');
});

Deno.test('update_task and delete_task', async () => {
  fresh();
  await call('update_task', { id: 't5', title: 'Renew passport soon', priority: 1, labels: ['w'], description: 'form DS-82' });
  assertEquals([row('tasks', 't5').title, row('tasks', 't5').priority, row('tasks', 't5').labels, row('tasks', 't5').notes],
    ['Renew passport soon', 1, ['w'], 'form DS-82']);
  await call('update_task', { id: 't5', priority: 0 });
  assertEquals(row('tasks', 't5').priority, null);
  assertStringIncludes(await call('delete_task', { id: 't5' }), 'Deleted "Renew passport soon"');
  assertEquals(row('tasks', 't5'), undefined);
});

Deno.test('lists: create, rename, label, delete (with its waiting tasks)', async () => {
  fresh();
  assertStringIncludes(await call('create_list', { name: '@weekly', label: 'w' }), 'Created @weekly with label #w');
  assertStringIncludes(await callError('create_list', { name: 'weekly' }), 'already a list');
  assertStringIncludes(await call('rename_list', { list: 'salesDeck', new_name: 'salesQ4' }), 'Renamed @salesDeck to @salesQ4');
  assertStringIncludes(await callError('rename_list', { list: 'triage', new_name: 'inbox' }), "can't be renamed");
  assertStringIncludes(await call('set_list_label', { list: 'salesQ4', label: '' }), 'has no label');
  assertEquals(row('lists', 'sales').label_id, null);
  await call('move_task', { id: 't1', list: 'salesQ4' });
  await call('add_task', { title: 'Planned from sales', date: today });
  await call('move_task', { id: DB.tasks.at(-1).id, date: today });
  assertStringIncludes(await call('delete_list', { list: 'salesQ4' }), 'the 2 tasks waiting in it');
  assertEquals([row('tasks', 't6'), row('tasks', 't1'), row('lists', 'sales')], [undefined, undefined, undefined]);
});

Deno.test('labels: shortcut picked like the app, delete removes it everywhere', async () => {
  fresh();
  assertStringIncludes(await call('create_label', { name: 'Personal' }), '(#p)');
  assertStringIncludes(await call('create_label', { name: 'Pets' }), '(#pe)');
  assertStringIncludes(await callError('create_label', { name: 'personal' }), 'already a label');
  await call('delete_label', { label: 'w' });
  assertEquals([row('tasks', 't1').labels, row('lists', 'sales').label_id, row('labels', 'w')], [[], null, undefined]);
});

Deno.test('several tasks at once: move (one after another on the calendar), complete, delete', async () => {
  fresh();
  const text = await call('move_task', { ids: ['t5', 't6'], date: today, start_time: '09:00', duration_minutes: 60 });
  assertEquals([row('tasks', 't5').start_min, row('tasks', 't6').start_min], [9 * 60, 10 * 60]);
  assertEquals(text.split('\n').length, 2);
  await call('complete_task', { ids: ['t5', 't6'] });
  assertEquals([row('tasks', 't5').done_on, row('tasks', 't6').done_on], [today, today]);
  await call('uncomplete_task', { ids: ['t5', 't6'] });
  assertEquals(row('tasks', 't5').done_on, null);
  // one bad id: nothing changes
  assertStringIncludes(await callError('delete_task', { ids: ['t5', 'nope'] }), 'No task with id nope');
  assert(row('tasks', 't5'));
  assertStringIncludes(await call('delete_task', { ids: ['t5', 't6'] }), 'Deleted "Renew passport", "Update pricing slide"');
  assertEquals([row('tasks', 't5'), row('tasks', 't6')], [undefined, undefined]);
  assertStringIncludes(await callError('move_task', { list: 'triage' }), 'Say which task');
});

Deno.test('dates in words: weekdays, next / last', async () => {
  fresh();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayName = names[dow], tomorrowName = names[(dow + 1) % 7];
  for (const [word, expected] of [[todayName, today], [`next ${todayName}`, shift(7)], [tomorrowName, shift(1)], [`last ${todayName}`, shift(-7)], [tomorrowName.slice(0, 3), shift(1)]]) {
    await call('add_task', { title: `on ${word}`, date: word });
    assertEquals(DB.tasks.at(-1).plan_date, expected, word);
  }
  assertStringIncludes(await callError('add_task', { title: 'x', date: 'someday' }), "isn't a date");
});

Deno.test('add several tasks at once; top-level fields are defaults', async () => {
  fresh();
  const text = await call('add_task', { list: 'kitchenReno', priority: 2, tasks: ['Buy tiles', { title: 'Book a plumber', date: 'tomorrow', start_time: '10:00' }, 'Pick grout'] });
  assertEquals(text.split('\n').length, 3);
  assertStringIncludes(text, '(new list @kitchenReno)');
  const [a, b, c] = DB.tasks.slice(-3);
  assertEquals([a.title, a.priority, b.title, b.list_id === a.list_id, c.sort_order], ['Buy tiles', 2, 'Book a plumber', true, 1]);
  assertEquals([b.plan_date, b.start_min], [shift(1), 600]);   // a date plans it; the list is its project
  // one bad task: nothing is added
  const before = DB.tasks.length;
  assertStringIncludes(await callError('add_task', { tasks: ['ok', { title: 'bad', labels: ['nope'] }] }), 'No label "nope"');
  assertEquals(DB.tasks.length, before);
});

Deno.test('move everything overdue (overdue: true) to tomorrow', async () => {
  fresh();
  const text = await call('move_task', { overdue: true, date: 'tomorrow' });
  assertStringIncludes(text, 'Book flights');
  assertEquals(row('tasks', 't4').plan_date, shift(1));
  assertStringIncludes(await callError('move_task', { overdue: true, date: 'tomorrow' }), 'Nothing is overdue');
  // a list you call @overdue is just a list, and wins over the view by name
  await call('add_task', { title: 'Read the overdue book', list: 'overdue' });
  assertStringIncludes(await call('get_lists', { list: 'overdue' }), 'Read the overdue book');
});

Deno.test('search by filters only: priority, label, list, added_on', async () => {
  fresh();
  DB.tasks.find(r => r.id === 't5').created_at = new Date().toISOString();
  assertStringIncludes(await call('search_tasks', { priority: 1 }), 'Update pricing slide');
  assertStringIncludes(await call('search_tasks', { label: 'work' }), 'Design review');
  const inSales = await call('search_tasks', { list: 'salesDeck' });
  assertStringIncludes(inSales, '1 open task(s) match in @salesDeck');
  const addedToday = await call('search_tasks', { added_on: 'today' });
  assertStringIncludes(addedToday, 'Renew passport · added today');
  assertStringIncludes(await callError('search_tasks', {}), 'Give text to search for, or a filter');
});

Deno.test('projects: planned counts, update_task project keeps the day, get_project', async () => {
  fresh();
  await call('add_task', { title: 'Pricing call', list: 'salesDeck', date: 'tomorrow', start_time: '11:00' });
  const planned = DB.tasks.at(-1);
  assertEquals([planned.plan_date, planned.list_id], [shift(1), 'sales']);
  assertStringIncludes(await call('get_lists', { list: 'salesDeck' }), '(+ 1 planned on a day');
  // link a planned task (t2, today's to-do, no project) to a project: it stays on its day
  await call('update_task', { id: 't2', project: 'salesDeck' });
  assertEquals([row('tasks', 't2').plan_date, row('tasks', 't2').list_id], [today, 'sales']);
  await call('update_task', { id: 't2', project: '' });          // "" = back to @triage
  assertEquals(row('tasks', 't2').list_id, 'triage');
  // an unplanned task moves into the project's list
  await call('update_task', { id: 't5', project: 'salesDeck' });
  assertEquals([row('tasks', 't5').plan_date, row('tasks', 't5').list_id], [null, 'sales']);
  const page = await call('get_project', { project: '@salesDeck' });
  for (const s of ['# @salesDeck', '## Notes', '## Not planned', 'Renew passport', '## Planned', 'Pricing call', '## Done']) assertStringIncludes(page, s);
  assertStringIncludes(await call('get_project', { project: 'triage' }), '# @triage');   // @triage is a project too
  assertStringIncludes(await callError('get_project', { project: 'nope' }), 'No project called @nope');
  // deleting a project: its planned tasks stay, moved to @triage
  await call('delete_list', { list: 'salesDeck' });
  assertEquals([row('tasks', planned.id).plan_date, row('tasks', planned.id).list_id], [shift(1), 'triage']);
});
