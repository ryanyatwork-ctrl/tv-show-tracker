import { createClient } from '@supabase/supabase-js';

let client;
export function getSupabase() {
  if (client) return client;

  const url  = 'https://YOUR-PROJECT-ref.supabase.co'; // ← replace
  const anon = 'YOUR-ANON-PUBLIC-KEY';                  // ← replace

  client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return client;
}
