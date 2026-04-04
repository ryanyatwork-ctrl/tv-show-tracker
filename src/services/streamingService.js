import { getSupabase } from "../lib/supabase";

/**
 * Fetch streaming availability for a single show.
 * Results are cached server-side for 7 days.
 */
export async function getStreamingInfo(showId, title, premiered) {
  try {
    const sp = getSupabase();
    if (!sp) return null;

    const year = premiered?.substring(0, 4) ?? "";

    const { data, error } = await sp.functions.invoke("get-streaming", {
      body: { show_id: showId, title, year },
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("getStreamingInfo failed:", err);
    return null;
  }
}
