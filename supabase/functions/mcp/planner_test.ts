// Tests for planner.ts, with a pretend Supabase (no network). Run: deno test supabase/functions/mcp
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { handle, todayIn } from './planner.ts';

const env = { supabaseUrl: 'https://example.supabase.co', apiKey: 'test-key' };
const tz = 'America/Los_Angeles';
const today = todayIn(tz);
const shift = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const DB: Record<string, unknown[]> = {
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

// Pretend Supabase: /auth/v1/user and /rest/v1/<table>, only for the token "good".
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const auth = new Headers(init?.headers).get('Authorization');
  if (auth !== 'Bearer good') return new Response('{"msg":"bad jwt"}', { status: 401 });
  if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'u1', user_metadata: { time_zone: tz } });
  const name = url.match(/rest\/v1\/(\w+)/)![1];
  return Response.json(DB[name]);
}) as typeof fetch;

const post = (body: unknown, token = 'good') => handle(new Request('https://x/mcp', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env);
const call = async (name: string, args = {}) => {
  const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const body = await res.json();
  return body.result.content[0].text as string;
};

Deno.test('no or bad token: 401 asking to sign in', async () => {
  assertEquals((await post({ jsonrpc: '2.0', id: 1, method: 'initialize' }, '')).status, 401);
  const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'bad');
  assertEquals(res.status, 401);
  assert(res.headers.get('WWW-Authenticate')?.startsWith('Bearer'));
});

Deno.test('initialize, notifications and tools/list', async () => {
  const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
  assertEquals(init.result.protocolVersion, '2025-06-18');
  assertEquals(init.result.serverInfo.name, 'planner');
  assertEquals((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assertEquals(list.result.tools.map((t: { name: string }) => t.name), ['get_plan', 'get_lists', 'search_tasks', 'get_task']);
  assert(list.result.tools.every((t: any) => t.annotations.readOnlyHint));
});

Deno.test('get_plan: today, calendar / to-do / done', async () => {
  const text = await call('get_plan');
  assertStringIncludes(text, `Time zone: ${tz}`);
  assertStringIncludes(text, '[ ] Design review · 10:00 AM–11:00 AM · P2 · #w  [id: t1]');
  assertStringIncludes(text, '[ ] Reply to Sam · (has a description)');
  assertStringIncludes(text, '[x] Morning run');
  assert(!text.includes('Book flights'));   // yesterday's: in @overdue, not today
});

Deno.test('get_lists: overdue first, list labels, labels at the end', async () => {
  const text = await call('get_lists');
  assert(text.indexOf('@overdue') < text.indexOf('@triage'));
  assertStringIncludes(text, '[ ] Book flights · P2');
  assertStringIncludes(text, '## @salesDeck (label #w');
  assertStringIncludes(text, 'Labels: Work #w');
  assertStringIncludes(await call('get_lists', { list: '@nope' }), "There's no list called @nope");
});

Deno.test('search_tasks and get_task', async () => {
  assertStringIncludes(await call('search_tasks', { query: 'passport' }), 'Renew passport');
  assertStringIncludes(await call('search_tasks', { query: 'passport' }), 'Reply to Sam');   // matched its description
  assertStringIncludes(await call('search_tasks', { query: 'flights' }), '@overdue (was planned for Yesterday');
  assert(!(await call('search_tasks', { query: 'run' })).includes('Morning run'));
  assertStringIncludes(await call('search_tasks', { query: 'run', include_done: true }), 'done on Today');
  assertStringIncludes(await call('get_task', { id: 't2' }), 'about the passport form');
});
