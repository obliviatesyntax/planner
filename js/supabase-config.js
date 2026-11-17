// supabase-config.js — which Supabase project the app talks to.
//
// Find both values in Supabase: Project Settings → API (or "Connect" at the top of the dashboard).
// The publishable/anon key is MEANT to be public: Row Level Security in supabase/schema.sql
// is what keeps each person's tasks private. Never put the secret/service_role key here.

const SUPABASE_URL = 'https://eiwoavnrsdnffiztwziq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kdR9wEYN5G9aiNnr9S9AIA_6pd3xhPB';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
