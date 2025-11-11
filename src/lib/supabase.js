import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return null; // app still runs fully local
  if (!client) {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return client;
}
