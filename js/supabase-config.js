// supabase-config.js — which Supabase project the app talks to.
//
// Find both values in Supabase: Project Settings → API (or "Connect" at the top of the dashboard).
// The publishable/anon key is MEANT to be public: Row Level Security in supabase/schema.sql
// is what keeps each person's tasks private. Never put the secret/service_role key here.

const SUPABASE_URL = 'https://eiwoavnrsdnffiztwziq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kdR9wEYN5G9aiNnr9S9AIA_6pd3xhPB';

// Does the sign-in email contain a 6-digit code?
//   false: Supabase's built-in email sender, whose emails can only contain a link.
//   true:  after setting up custom SMTP and adding {{ .Token }} to the Magic Link email template.
const EMAIL_HAS_CODE = false;

// The public address of the site. Emailed links go here when the app is opened as a local file.
// Must also be listed in Supabase → Authentication → URL Configuration → Redirect URLs.
const SITE_URL = 'https://obliviatesyntax.github.io/';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
