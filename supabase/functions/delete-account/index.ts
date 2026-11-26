// delete-account — Settings → Account → "Delete my account": removes the signed-in person's
// account for good. Their tasks, lists and labels go with it (the tables' user_id references
// auth.users "on delete cascade"), and every sign-in, including AI apps' tokens, stops working.
//
// Called by the web app with the person's own sign-in token; it can only ever delete that one
// account. Deleting a user needs the service-role key, which Supabase gives every Edge Function
// as SUPABASE_SERVICE_ROLE_KEY (never sent to browsers).
//
// Deploy: supabase functions deploy delete-account --project-ref <project> --no-verify-jwt --use-api
// (--no-verify-jwt so the browser's CORS check gets an answer; the token is checked below.)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
};

Deno.serve(async req => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in.' }, 401);

  // Who is asking? (Their own token, checked by Supabase Auth.)
  const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json({ error: 'Your sign-in has expired. Sign in again, then try once more.' }, 401);
  const user = await who.json();

  // A typed confirmation, so a stray request can't do this.
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);

  const del = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!del.ok) return json({ error: `Could not delete the account (${del.status}).` }, 500);
  console.log(JSON.stringify({ deleted: true }));   // no ids or emails in the logs
  return json({ deleted: true });
});
