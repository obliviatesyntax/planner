// The Planner MCP server, run by Supabase Edge Functions at
//   https://<project>.supabase.co/functions/v1/mcp
// All the logic is in planner.ts. Deploy with (see README → "Use Planner from Claude"):
//   supabase functions deploy mcp --project-ref <project> --no-verify-jwt --use-api
// --no-verify-jwt: this function checks the sign-in token itself, so it can answer
// "401, please sign in" the way MCP apps expect.

import { handle } from './planner.ts';

// Supabase fills these in for every Edge Function. The publishable key is public (it's in the
// web app too) and is only a fallback.
const env = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? 'https://eiwoavnrsdnffiztwziq.supabase.co',
  apiKey: Deno.env.get('SUPABASE_ANON_KEY') ?? 'sb_publishable_kdR9wEYN5G9aiNnr9S9AIA_6pd3xhPB',
};

Deno.serve(req => handle(req, env));
