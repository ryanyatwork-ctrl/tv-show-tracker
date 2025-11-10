// Lazy, optional Supabase client. Safe if env vars are absent.
let cached = null;

export async function getSupabase() {
  if (cached !== null) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    cached = null; // not configured
    return null;
  }
  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, anon);
  return cached;
}
