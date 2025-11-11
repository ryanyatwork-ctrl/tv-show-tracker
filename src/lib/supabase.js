// src/lib/supabase.js
let supabase = null;

export async function getSupabase() {
  if (supabase) return supabase;

  const url  = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return null; // keeps the app working even if auth isn't configured

  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(url, anon);
  return supabase;
}
