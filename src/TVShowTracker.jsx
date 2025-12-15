import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  Tv,
  RotateCcw,
  CheckCircle,
  Menu,
  DollarSign,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getSupabase } from "./lib/supabase";

/**
 * TVShowTracker (Supabase-enabled)
 * - LocalStorage persistence
 * - Optional cloud sync (Supabase) when signed in
 * - TVMaze search
 * - Multi-select add, “already added” badge
 * - Rewatch system (Watch #2, #3, …)
 * - One-click mark season complete/unmark
 * - Sort by: added/title/year/genre
 * - Progress bar switches purple->green at 100%
 * - Hamburger menu with Import/Export + Donate + Account (Google/email magic link)
 *
 * Adds:
 * - Per-show rating (1–5 stars, 0 = unrated) persisted with library
 * - Recommendations panel based on 4–5★ genres (TVMaze-based + cached)
 * - Cloud sync controls: Sync Now (push), Pull from Cloud
 * - Last sync time display
 * - Conflict detection + resolution (Cloud wins / This device wins / Merge)
 */

// ---------- UI preferences persistence (sort/filter) ----------
const UI_PREFS_KEY = "tvtracker.uiPrefs.v1";
function loadUIPrefs() {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      filterStatus: parsed?.filterStatus ?? "in-progress",
      sortBy: parsed?.sortBy ?? "title",
    };
  } catch {
    return { filterStatus: "in-progress", sortBy: "title" };
  }
}
function saveUIPrefs(next) {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// ---------- Recommendations cache ----------
const RECS_CACHE_KEY = "tvtracker.recs.v1";
const RECS_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
function loadRecsCache() {
  try {
    const raw = localStorage.getItem(RECS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.ts || !Array.isArray(parsed?.items)) return null;
    if (Date.now() - parsed.ts > RECS_CACHE_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}
function saveRecsCache(items) {
  try {
    localStorage.setItem(RECS_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch {
    /* ignore */
  }
}

// ---------- Sync meta ----------
const SYNC_META_KEY = "tvtracker.syncMeta.v1";
function randomId() {
  // simple device id; good enough for client-side conflict detection
  return "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}
function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const deviceId = parsed?.deviceId || randomId();
    const next = {
      deviceId,
      lastPulledAt: parsed?.lastPulledAt || 0,
      lastPushedAt: parsed?.lastPushedAt || 0,
      lastLocalChangeAt: parsed?.lastLocalChangeAt || 0,
      lastSeenRemoteUpdatedAt: parsed?.lastSeenRemoteUpdatedAt || 0,
    };
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(next));
    return next;
  } catch {
    const next = {
      deviceId: randomId(),
      lastPulledAt: 0,
      lastPushedAt: 0,
      lastLocalChangeAt: 0,
      lastSeenRemoteUpdatedAt: 0,
    };
    try {
      localStorage.setItem(SYNC_META_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return next;
  }
}
function saveSyncMeta(patch) {
  try {
    const cur = loadSyncMeta();
    const next = { ...cur, ...patch };
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}
function fmtTime(ts) {
  if (!ts) return "Never";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "Never";
  }
}

// ---------- Data normalization (supports legacy arrays, and v2 envelopes) ----------
function normalizeShow(s) {
  return {
    ...s,
    rating: typeof s.rating === "number" ? s.rating : 0,
  };
}
function normalizeLibrary(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeShow);
}
function unwrapRemoteData(remoteData) {
  // Backward compatible:
  // old: data = [shows...]
  // new: data = { v:2, updatedAt, deviceId, shows:[...] }
  if (Array.isArray(remoteData)) {
    return { shows: normalizeLibrary(remoteData), updatedAt: 0, deviceId: "" };
  }
  if (remoteData && typeof remoteData === "object" && Array.isArray(remoteData.shows)) {
    return {
      shows: normalizeLibrary(remoteData.shows),
      updatedAt: typeof remoteData.updatedAt === "number" ? remoteData.updatedAt : 0,
      deviceId: typeof remoteData.deviceId === "string" ? remoteData.deviceId : "",
    };
  }
  return { shows: [], updatedAt: 0, deviceId: "" };
}
function makeRemoteEnvelope(shows, meta) {
  return {
    v: 2,
    updatedAt: Date.now(),
    deviceId: meta?.deviceId || "",
    shows: shows,
  };
}

// ---------- Stars UI ----------
function Stars({ value, onChange, onClear, size = "text-lg" }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= (value || 0);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`${size} leading-none ${
              active ? "text-yellow-400" : "text-slate-500"
            } hover:text-yellow-300 transition-colors`}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            title={
              n === 1
                ? "Didn't like it"
                : n === 5
                ? "Loved it"
                : `${n} stars`
            }
          >
            ★
          </button>
        );
      })}
      <span className="ml-2 text-xs text-slate-400">{value ? `${value}/5` : "Unrated"}</span>
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-2 text-xs text-slate-400 hover:text-slate-200 underline"
          title="Clear rating"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

// ---------- Merge helper (simple but sane) ----------
function watchedCount(show) {
  try {
    const seasons = show?.seasons || {};
    let n = 0;
    Object.values(seasons).forEach((eps) => {
      n += (eps || []).filter((e) => e?.watched).length;
    });
    return n;
  } catch {
    return 0;
  }
}
function mergeLibraries(localShows, remoteShows) {
  const map = new Map();
  for (const s of remoteShows) map.set(s.id, s);
  for (const s of localShows) {
    if (!map.has(s.id)) {
      map.set(s.id, s);
    } else {
      const r = map.get(s.id);
      // Prefer the one with more watched episodes; if tied, prefer the one with higher rating; else remote.
      const lw = watchedCount(s);
      const rw = watchedCount(r);
      if (lw > rw) map.set(s.id, s);
      else if (lw === rw && (s.rating || 0) > (r.rating || 0)) map.set(s.id, s);
    }
  }
  return Array.from(map.values());
}

export default function TVShowTracker() {
  const syncMetaRef = useRef(loadSyncMeta());

  // IMPORTANT: prevent pushing stale local data before first pull completes
  const hasPulledFromCloudRef = useRef(false);

  // ---------- Persistence (local) ----------
  const [myShows, setMyShows] = useState(() => {
    try {
      const saved = localStorage.getItem("tvShowTrackerData");
      return saved ? normalizeLibrary(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Track local changes for conflict detection
    syncMetaRef.current = saveSyncMeta({ lastLocalChangeAt: Date.now() }) || syncMetaRef.current;

    try {
      localStorage.setItem("tvShowTrackerData", JSON.stringify(myShows));
    } catch {
      /* ignore */
    }
  }, [myShows]);

  // ---------- Auth & cloud sync ----------
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  // sync status UI
  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastPulledAt, setLastPulledAt] = useState(syncMetaRef.current.lastPulledAt || 0);
  const [lastPushedAt, setLastPushedAt] = useState(syncMetaRef.current.lastPushedAt || 0);

  // conflict UI
  const [conflict, setConflict] = useState(null); // { remoteUpdatedAt, remoteDeviceId, localChangedAt, remoteCount, localCount }

  // fetch/push guards
  const pullingRef = useRef(false);
  const pushingRef = useRef(false);

  const getSessionUserId = async () => {
    const sp = getSupabase();
    if (!sp) return null;
    const { data: { session } } = await sp.auth.getSession();
    return session?.user?.id || null;
  };

  // Pull cloud library (optionally detect conflicts)
  const pullLibrary = async ({ allowOverwrite = true } = {}) => {
    if (pullingRef.current) return { ok: false, reason: "busy" };
    const sp = getSupabase();
    if (!sp) return { ok: false, reason: "no-supabase" };

    pullingRef.current = true;
    setSyncBusy(true);
    setSyncMsg("Pulling from cloud…");

    try {
      const { data: { session } } = await sp.auth.getSession();
      if (!session?.user) return { ok: false, reason: "no-session" };

      const { data, error } = await sp
        .from("tvtracker_library")
        .select("data")
        .eq("user_id", session.user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      const remoteWrap = unwrapRemoteData(data?.data);
      const remoteShows = remoteWrap.shows;
      const remoteUpdatedAt = remoteWrap.updatedAt || 0;
      const remoteDeviceId = remoteWrap.deviceId || "";

      // record that we've seen remote updatedAt
      syncMetaRef.current = saveSyncMeta({ lastSeenRemoteUpdatedAt: remoteUpdatedAt }) || syncMetaRef.current;

      const localChangedAt = syncMetaRef.current.lastLocalChangeAt || 0;
      const lastPulled = syncMetaRef.current.lastPulledAt || 0;

      // Conflict detection heuristic:
      // - remote was updated after our last pull
      // - AND local changed after our last pull
      // - AND remote deviceId differs (to reduce false positives)
      const looksLikeConflict =
        remoteUpdatedAt > lastPulled &&
        localChangedAt > lastPulled &&
        remoteDeviceId &&
        remoteDeviceId !== syncMetaRef.current.deviceId;

      if (looksLikeConflict) {
        setConflict({
          remoteUpdatedAt,
          remoteDeviceId,
          localChangedAt,
          remoteCount: remoteShows.length,
          localCount: myShows.length,
        });
        setSyncMsg("Conflict detected. Choose how to resolve in the menu.");
        return { ok: false, reason: "conflict", remoteShows };
      }

      // No conflict: adopt remote if allowed
      if (allowOverwrite) {
        setMyShows(remoteShows);
      }

      hasPulledFromCloudRef.current = true;
      const nextMeta = saveSyncMeta({ lastPulledAt: Date.now() }) || syncMetaRef.current;
      syncMetaRef.current = nextMeta;
      setLastPulledAt(nextMeta.lastPulledAt);
      setSyncMsg("Pulled from cloud.");
      return { ok: true, remoteShows };
    } catch (e) {
      console.warn("pullLibrary failed:", e?.message || e);
      setSyncMsg("Pull failed.");
      return { ok: false, reason: "error" };
    } finally {
      pullingRef.current = false;
      setSyncBusy(false);
      setTimeout(() => setSyncMsg(""), 2500);
    }
  };

  // Push cloud library
  const pushLibrary = async (payload) => {
    if (pushingRef.current) return { ok: false, reason: "busy" };
    const sp = getSupabase();
    if (!sp) return { ok: false, reason: "no-supabase" };

    // block push until initial pull is complete
    if (!hasPulledFromCloudRef.current) {
      return { ok: false, reason: "not-pulled-yet" };
    }

    pushingRef.current = true;
    setSyncBusy(true);
    setSyncMsg("Pushing to cloud…");

    try {
      const { data: { session } } = await sp.auth.getSession();
      if (!session?.user) return { ok: false, reason: "no-session" };

      const envelope = makeRemoteEnvelope(payload, syncMetaRef.current);

      await sp
        .from("tvtracker_library")
        .upsert({ user_id: session.user.id, data: envelope }, { onConflict: "user_id" });

      const nextMeta =
        saveSyncMeta({ lastPushedAt: Date.now(), lastSeenRemoteUpdatedAt: envelope.updatedAt }) ||
        syncMetaRef.current;
      syncMetaRef.current = nextMeta;
      setLastPushedAt(nextMeta.lastPushedAt);
      setSyncMsg("Synced to cloud.");
      return { ok: true };
    } catch (e) {
      console.warn("pushLibrary failed:", e?.message || e);
      setSyncMsg("Push failed.");
      return { ok: false, reason: "error" };
    } finally {
      pushingRef.current = false;
      setSyncBusy(false);
      setTimeout(() => setSyncMsg(""), 2500);
    }
  };

  // auth bootstrap + listener
  useEffect(() => {
    (async () => {
      const sp = getSupabase();
      if (!sp) return;

      const { data: { session } } = await sp.auth.getSession();
      if (session?.user) {
        setIsSignedIn(true);
        setUserEmail(session.user.email || "");
        // Always pull first on sign-in; do not allow push until done
        await pullLibrary({ allowOverwrite: true });
      }

      sp.auth.onAuthStateChange(async (_e, ses) => {
        const signed = !!ses?.user;
        setIsSignedIn(signed);
        setUserEmail(signed ? (ses.user.email || "") : "");
        if (signed) {
          await pullLibrary({ allowOverwrite: true });
        } else {
          hasPulledFromCloudRef.current = false;
          setConflict(null);
        }
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-push whenever local library changes (only if signed-in AND pulled)
  useEffect(() => {
    if (!isSignedIn) return;
    if (!hasPulledFromCloudRef.current) return;
    // If there's an unresolved conflict, don't auto-push.
    if (conflict) return;

    pushLibrary(myShows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, myShows, conflict]);

  // ---------- Email magic link UI state ----------
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  // --- Auth handlers ---
  const signInWithEmailMagicLink = async () => {
    setEmailMsg("");
    const email = emailInput.trim();
    if (!email) {
      setEmailMsg("Enter an email address.");
      return;
    }
    setEmailSending(true);
    try {
      const sp = getSupabase();
      if (!sp) {
        setEmailMsg("Supabase is not configured.");
        return;
      }
      const { error } = await sp.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setEmailMsg("Check your inbox for the sign-in link.");
    } catch (e) {
      setEmailMsg(e.message || "Could not send email.");
    } finally {
      setEmailSending(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const sp = getSupabase();
      if (!sp) {
        alert("Supabase is not configured.");
        return;
      }
      const { error } = await sp.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Google sign-in failed.");
    }
  };

  const signOut = async () => {
    try {
      const sp = getSupabase();
      if (!sp) return;
      await sp.auth.signOut();
    } catch {
      /* ignore */
    }
  };

  // ---------- UI state ----------
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedShows, setSelectedShows] = useState(new Set());

  const [expandedShow, setExpandedShow] = useState(null);
  const [expandedSeason, setExpandedSeason] = useState(null);

  // Persisted sort/filter
  const [filterStatus, setFilterStatus] = useState(() => loadUIPrefs().filterStatus);
  const [sortBy, setSortBy] = useState(() => loadUIPrefs().sortBy);
  useEffect(() => {
    saveUIPrefs({ filterStatus, sortBy });
  }, [filterStatus, sortBy]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // ---------- Helpers ----------
  const isShowAdded = (id) => myShows.some((s) => s.id === id);

  const getCurrentWatchData = (show) => {
    if (!show.currentRewatch || show.currentRewatch === 1) {
      return { watchNumber: 1, seasons: show.seasons };
    }
    const rw = show.rewatches?.find((r) => r.watchNumber === show.currentRewatch);
    return rw || { watchNumber: 1, seasons: show.seasons };
  };

  const getWatchProgress = (show) => {
    const { seasons } = getCurrentWatchData(show);
    let total = 0;
    let watched = 0;
    Object.values(seasons).forEach((eps) => {
      total += eps.length;
      watched += eps.filter((e) => e.watched).length;
    });
    const percentage = total > 0 ? Math.round((watched / total) * 100) : 0;
    return { watched, total, percentage };
  };

  const getSeasonProgress = (episodes) => {
    const watched = episodes.filter((e) => e.watched).length;
    return { watched, total: episodes.length };
  };

  const getSortedShows = (shows) => {
    const arr = [...shows];
    switch (sortBy) {
      case "title":
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "year":
        arr.sort((a, b) => {
          const ya = a.premiered ? parseInt(a.premiered.slice(0, 4)) : 0;
          const yb = b.premiered ? parseInt(b.premiered.slice(0, 4)) : 0;
          return yb - ya;
        });
        break;
      case "genre":
        arr.sort((a, b) => {
          const ga = (a.genres?.[0] || "zzz").toLowerCase();
          const gb = (b.genres?.[0] || "zzz").toLowerCase();
          return ga.localeCompare(gb);
        });
        break;
      case "added":
      default:
        arr.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
    }
    return arr;
  };

  const setShowRating = (id, rating) => {
    setMyShows((prev) => prev.map((s) => (s.id === id ? { ...s, rating } : s)));
  };

  // ---------- Recommendations ----------
  const [recs, setRecs] = useState(() => loadRecsCache() || []);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsMsg, setRecsMsg] = useState("");

  const lovedGenreProfile = useMemo(() => {
    const loved = myShows.filter((s) => (s.rating || 0) >= 4);
    const counts = {};
    loved.forEach((s) => {
      (s.genres || []).forEach((g) => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);
    return {
      lovedCount: loved.length,
      topGenres: ranked.slice(0, 6),
    };
  }, [myShows]);

  const fetchRecommendations = async () => {
    const { lovedCount, topGenres } = lovedGenreProfile;

    if (lovedCount < 1 || topGenres.length === 0) {
      setRecsMsg("Rate at least one show 4★ or 5★ to generate recommendations.");
      setRecs([]);
      saveRecsCache([]);
      return;
    }

    setRecsMsg("");
    setRecsLoading(true);

    try {
      const queries = topGenres.slice(0, 4);
      const pools = await Promise.all(
        queries.map(async (q) => {
          const res = await fetch(
            `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`
          );
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        })
      );

      const existingIds = new Set(myShows.map((s) => s.id));
      const topSet = new Set(topGenres.map((g) => g.toLowerCase()));

      const candidates = new Map();

      for (const pool of pools) {
        for (const item of pool) {
          const s = item?.show;
          if (!s?.id || !s?.name) continue;
          if (existingIds.has(s.id)) continue;

          const genres = Array.isArray(s.genres) ? s.genres : [];
          let score = 0;
          for (const g of genres) {
            if (topSet.has(String(g).toLowerCase())) score += 3;
          }
          for (const q of queries) {
            if (s.name.toLowerCase().includes(q.toLowerCase())) score += 1;
          }

          const prev = candidates.get(s.id);
          if (!prev || score > prev.score) {
            candidates.set(s.id, {
              id: s.id,
              name: s.name,
              premiered: s.premiered || "",
              genres,
              image: s.image?.medium || s.image?.original || "",
              score,
            });
          }
        }
      }

      const sorted = Array.from(candidates.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 18);

      setRecs(sorted);
      saveRecsCache(sorted);
      setRecsMsg(sorted.length ? "" : "No recommendations found. Try rating more shows 4★–5★.");
    } catch (e) {
      console.warn("fetchRecommendations failed:", e?.message || e);
      setRecsMsg("Could not fetch recommendations right now.");
    } finally {
      setRecsLoading(false);
    }
  };

  // ---------- Search ----------
  const doSearch = async (q) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => doSearch(searchQuery), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // ---------- Add shows ----------
  const toggleShowSelection = (id) => {
    const next = new Set(selectedShows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedShows(next);
  };

  const fetchShowDetails = async (id) => {
    try {
      const resp = await fetch(`https://api.tvmaze.com/shows/${id}?embed=episodes`);
      return await resp.json();
    } catch {
      return null;
    }
  };

  const addShow = async (show, clearAfter = true) => {
    if (isShowAdded(show.id)) return;

    const details = await fetchShowDetails(show.id);
    if (!details) return;

    const episodesBySeason = {};
    const eps = details?._embedded?.episodes || [];
    eps.forEach((ep) => {
      const s = ep.season;
      if (!episodesBySeason[s]) episodesBySeason[s] = [];
      episodesBySeason[s].push({
        id: ep.id,
        number: ep.number,
        name: ep.name,
        airdate: ep.airdate,
        watched: false,
      });
    });

    const newShow = {
      id: show.id,
      name: show.name,
      premiered: details.premiered || "",
      image: show.image?.medium || show.image?.original || "",
      genres: details.genres || [],
      source: "",
      seasons: episodesBySeason,
      addedDate: new Date().toISOString(),
      rewatches: [],
      rating: 0,
    };

    setMyShows((prev) => [newShow, ...prev]);

    if (clearAfter) {
      setSelectedShows(new Set());
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const addSelectedShows = async () => {
    const toAdd = searchResults
      .map((r) => r.show)
      .filter((s) => selectedShows.has(s.id) && !isShowAdded(s.id));

    for (const s of toAdd) {
      // eslint-disable-next-line no-await-in-loop
      await addShow(s, false);
    }
    setSelectedShows(new Set());
  };

  // ---------- Edit / track ----------
  const removeShow = (id) => {
    if (confirm("Remove this show and all watch history?")) {
      setMyShows((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const updateSource = (id, value) => {
    setMyShows((prev) => prev.map((s) => (s.id === id ? { ...s, source: value } : s)));
  };

  const toggleEpisodeWatched = (id, season, epId) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;

        const isFirst = !show.currentRewatch || show.currentRewatch === 1;

        if (isFirst) {
          return {
            ...show,
            seasons: {
              ...show.seasons,
              [season]: show.seasons[season].map((e) =>
                e.id === epId ? { ...e, watched: !e.watched } : e
              ),
            },
          };
        }

        return {
          ...show,
          rewatches: show.rewatches.map((rw) =>
            rw.watchNumber === show.currentRewatch
              ? {
                  ...rw,
                  seasons: {
                    ...rw.seasons,
                    [season]: rw.seasons[season].map((e) =>
                      e.id === epId ? { ...e, watched: !e.watched } : e
                    ),
                  },
                }
              : rw
          ),
        };
      })
    );
  };

  const markSeasonComplete = (id, season, watched = true) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;

        const isFirst = !show.currentRewatch || show.currentRewatch === 1;

        if (isFirst) {
          return {
            ...show,
            seasons: {
              ...show.seasons,
              [season]: show.seasons[season].map((e) => ({ ...e, watched })),
            },
          };
        }

        return {
          ...show,
          rewatches: show.rewatches.map((rw) =>
            rw.watchNumber === show.currentRewatch
              ? {
                  ...rw,
                  seasons: {
                    ...rw.seasons,
                    [season]: rw.seasons[season].map((e) => ({ ...e, watched })),
                  },
                }
              : rw
          ),
        };
      })
    );
  };

  // ---------- Rewatch ----------
  const startRewatch = (id) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;

        const nextNum = (show.rewatches?.length || 0) + 2;
        const clone = {};
        Object.keys(show.seasons).forEach((s) => {
          clone[s] = show.seasons[s].map((e) => ({ ...e, watched: false }));
        });

        return {
          ...show,
          rewatches: [...(show.rewatches || []), { watchNumber: nextNum, seasons: clone }],
          currentRewatch: nextNum,
        };
      })
    );
  };

  const switchToWatch = (id, watchNumber) => {
    setMyShows((prev) => prev.map((s) => (s.id === id ? { ...s, currentRewatch: watchNumber } : s)));
  };

  // ---------- Export / Import ----------
  const exportJSON = () => {
    const str = JSON.stringify(myShows, null, 2);
    const blob = new Blob([str], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tv-shows-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const header = [
      "Show Name",
      "Premiered",
      "Genres",
      "Source",
      "Rating",
      "Watched",
      "Total",
      "Progress %",
      "Status",
      "Rewatches",
    ];
    const rows = [header];

    myShows.forEach((show) => {
      const total = Object.values(show.seasons).reduce((n, eps) => n + eps.length, 0);
      const watched = Object.values(show.seasons).reduce(
        (n, eps) => n + eps.filter((e) => e.watched).length,
        0
      );
      const progress = total ? watched / total : 0;
      rows.push([
        show.name,
        show.premiered ? show.premiered.slice(0, 4) : "",
        (show.genres || []).join(", "),
        show.source || "",
        show.rating || "",
        watched,
        total,
        progress,
        progress === 1 ? "✓ COMPLETED" : "In Progress",
        show.rewatches?.length ? `${show.rewatches.length}` : "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 28 },
      { wch: 8 },
      { wch: 22 },
      { wch: 16 },
      { wch: 8 },
      { wch: 9 },
      { wch: 9 },
      { wch: 11 },
      { wch: 14 },
      { wch: 10 },
    ];
    for (let r = 1; r < rows.length; r++) {
      const cell = XLSX.utils.encode_cell({ r, c: 7 });
      if (ws[cell]) ws[cell].z = "0%";
    }
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    XLSX.writeFile(wb, `tv-shows-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = normalizeLibrary(JSON.parse(ev.target.result));
        setMyShows(data);
        alert("Imported!");
      } catch {
        alert("Import failed (invalid JSON).");
      }
    };
    reader.readAsText(file);
  };

  // ---------- Derived lists ----------
  const visibleShows = useMemo(() => {
    const filtered = myShows.filter((s) => {
      const p = getWatchProgress(s).percentage;
      if (filterStatus === "completed") return p === 100;
      if (filterStatus === "in-progress") return p > 0 && p < 100;
      return true;
    });
    return getSortedShows(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myShows, filterStatus, sortBy]);

  // ---------- Menu sync actions ----------
  const pullFromCloudNow = async () => {
    if (!isSignedIn) {
      setSyncMsg("Sign in to pull from cloud.");
      setTimeout(() => setSyncMsg(""), 2500);
      return;
    }
    await pullLibrary({ allowOverwrite: true });
  };

  const syncNowPush = async () => {
    if (!isSignedIn) {
      setSyncMsg("Sign in to sync.");
      setTimeout(() => setSyncMsg(""), 2500);
      return;
    }
    // Ensure we have pulled at least once to avoid overwriting remote with stale local
    if (!hasPulledFromCloudRef.current) {
      const res = await pullLibrary({ allowOverwrite: true });
      if (!res?.ok) return;
    }
    if (conflict) {
      setSyncMsg("Resolve conflict before syncing.");
      setTimeout(() => setSyncMsg(""), 2500);
      return;
    }
    await pushLibrary(myShows);
  };

  const resolveUseCloud = async () => {
    const res = await pullLibrary({ allowOverwrite: true });
    if (res?.ok) setConflict(null);
  };

  const resolveUseThisDevice = async () => {
    // Mark pulled so push is allowed, then push
    hasPulledFromCloudRef.current = true;
    setConflict(null);
    await pushLibrary(myShows);
  };

  const resolveMerge = async () => {
    const res = await pullLibrary({ allowOverwrite: false });
    if (res?.reason === "conflict" && res.remoteShows) {
      const merged = mergeLibraries(myShows, res.remoteShows);
      setMyShows(merged);
      hasPulledFromCloudRef.current = true;
      setConflict(null);
      await pushLibrary(merged);
      return;
    }
    // If no conflict was returned (or already resolved), just do a normal push after pull
    hasPulledFromCloudRef.current = true;
    setConflict(null);
    await pushLibrary(myShows);
  };

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4">
      {/* HEADER */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              TV Tracker
            </h1>
          </div>

          <div className="flex items-center">
            {isSignedIn && (
              <span className="hidden md:inline text-xs text-slate-300 mr-3">
                {userEmail ? `Signed in as ${userEmail}` : "Signed in"}
              </span>
            )}

            {/* Hamburger */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Open menu"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
              >
                <Menu className="w-6 h-6" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden z-50">
                  {/* Account */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                    Account
                  </div>

                  {isSignedIn ? (
                    <div className="px-4 py-3 border-b border-slate-700">
                      <div className="text-sm text-slate-200">
                        Signed in{userEmail ? ` as ${userEmail}` : ""}
                      </div>
                      <button
                        onClick={signOut}
                        className="mt-3 w-full rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-b border-slate-700 space-y-3">
                      <button
                        onClick={signInWithGoogle}
                        className="w-full rounded bg-purple-600 hover:bg-purple-700 px-3 py-2 text-sm font-medium"
                      >
                        Continue with Google
                      </button>

                      <button
                        onClick={() => setShowEmailForm((v) => !v)}
                        className="w-full rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm"
                      >
                        {showEmailForm ? "Hide email sign-in" : "Use email magic link"}
                      </button>

                      {showEmailForm && (
                        <div className="space-y-2">
                          <input
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full px-3 py-2 rounded bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <button
                            onClick={signInWithEmailMagicLink}
                            disabled={emailSending}
                            className="w-full rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 text-sm font-medium"
                          >
                            {emailSending ? "Sending…" : "Send magic link"}
                          </button>
                          {emailMsg && <div className="text-xs text-slate-300">{emailMsg}</div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sync */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                    Sync
                  </div>

                  <div className="px-4 py-3 border-b border-slate-700 space-y-2">
                    <div className="text-xs text-slate-300">
                      Last Pull: <span className="text-slate-200">{fmtTime(lastPulledAt)}</span>
                      <br />
                      Last Push: <span className="text-slate-200">{fmtTime(lastPushedAt)}</span>
                      {syncMsg ? (
                        <>
                          <br />
                          <span className="text-slate-200">{syncMsg}</span>
                        </>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={pullFromCloudNow}
                        disabled={syncBusy}
                        className="flex-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 text-sm"
                        title="Pull your library from the cloud (cloud → this device)"
                      >
                        Pull from Cloud
                      </button>
                      <button
                        onClick={syncNowPush}
                        disabled={syncBusy}
                        className="flex-1 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 text-sm font-medium"
                        title="Sync now (this device → cloud)"
                      >
                        Sync Now
                      </button>
                    </div>

                    {conflict && (
                      <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                        <div className="text-sm font-semibold text-amber-200">
                          Conflict detected
                        </div>
                        <div className="text-xs text-slate-200 mt-1">
                          Cloud updated: {fmtTime(conflict.remoteUpdatedAt)} <br />
                          This device changed: {fmtTime(conflict.localChangedAt)} <br />
                          Cloud shows: {conflict.remoteCount} • Local shows: {conflict.localCount}
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          <button
                            onClick={resolveUseCloud}
                            disabled={syncBusy}
                            className="w-full rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 text-sm"
                          >
                            Use Cloud Version (overwrite local)
                          </button>
                          <button
                            onClick={resolveUseThisDevice}
                            disabled={syncBusy}
                            className="w-full rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-2 text-sm"
                          >
                            Use This Device (overwrite cloud)
                          </button>
                          <button
                            onClick={resolveMerge}
                            disabled={syncBusy}
                            className="w-full rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-2 text-sm font-medium"
                          >
                            Merge & Sync (recommended)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Data */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                    Data
                  </div>

                  <label className="flex items-center gap-2 px-4 py-3 hover:bg-slate-700 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>Import Data (JSON)</span>
                    <input type="file" accept=".json" onChange={importData} className="hidden" />
                  </label>

                  <button
                    onClick={exportJSON}
                    disabled={myShows.length === 0}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    onClick={exportExcel}
                    disabled={myShows.length === 0}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Excel</span>
                  </button>

                  {/* Support */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-700">
                    Support
                  </div>
                  <a
                    href="https://paypal.me/Yelltom"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-3 hover:bg-slate-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    Donate via PayPal
                  </a>
                  <a
                    href="https://www.venmo.com/u/BellevilleSystems"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-3 hover:bg-slate-700"
                  >
                    <DollarSign className="w-4 h-4" />
                    Donate via Venmo
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-slate-300 mt-2">Never lose track of what you're watching</p>
      </header>

      {/* RECOMMENDATIONS */}
      <div className="mb-8 bg-slate-800 rounded-lg p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="text-yellow-300">★</span> Recommendations
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              Based on your 4–5★ shows{" "}
              {lovedGenreProfile.topGenres.length
                ? `(top genres: ${lovedGenreProfile.topGenres.join(", ")})`
                : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchRecommendations}
              disabled={recsLoading}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 font-semibold"
            >
              {recsLoading ? "Generating…" : "Generate"}
            </button>
            <button
              onClick={() => {
                setRecs([]);
                saveRecsCache([]);
                setRecsMsg("");
              }}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
            >
              Clear
            </button>
          </div>
        </div>

        {recsMsg && <div className="mt-3 text-sm text-slate-300">{recsMsg}</div>}

        {!recsMsg && lovedGenreProfile.lovedCount === 0 && (
          <div className="mt-3 text-sm text-slate-300">
            Rate a show 4★ or 5★ and hit <strong>Generate</strong>.
          </div>
        )}

        {recs.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {recs.map((r) => (
              <div key={r.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                <div className="flex gap-3">
                  {r.image ? (
                    <img src={r.image} alt={r.name} className="w-16 h-24 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-24 rounded bg-slate-600 flex items-center justify-center text-slate-300">
                      <Tv className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-slate-300 mt-1">
                      {r.premiered ? r.premiered.slice(0, 4) : ""}{" "}
                      {r.genres?.length ? `• ${r.genres.join(", ")}` : ""}
                    </div>
                    <div className="mt-3 flex gap-2 items-center">
                      <button
                        onClick={() =>
                          addShow(
                            {
                              id: r.id,
                              name: r.name,
                              image: r.image ? { medium: r.image, original: r.image } : undefined,
                            },
                            false
                          )
                        }
                        disabled={isShowAdded(r.id)}
                        className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-sm font-semibold"
                      >
                        {isShowAdded(r.id) ? "Added" : "Add"}
                      </button>
                      <span className="text-xs text-slate-400" title="Relevance score">
                        score {r.score}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SEARCH / ADD */}
      <div className="mb-8 bg-slate-800 rounded-lg p-6 shadow-xl">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-purple-400" />
          Add New Series
        </h2>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a TV show..."
            className="w-full pl-12 pr-4 py-3 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            type="text"
          />
        </div>

        {selectedShows.size > 0 && (
          <div className="mb-4 flex items-center justify-between bg-purple-900/50 p-3 rounded-lg">
            <span>{selectedShows.size} show(s) selected</span>
            <button
              onClick={addSelectedShows}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
            >
              Add Selected Shows
            </button>
          </div>
        )}

        {isSearching && <div className="mt-4 text-center text-slate-400">Searching…</div>}

        {!!searchResults.length && (
          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {searchResults.map((r) => {
              const s = r.show;
              const already = isShowAdded(s.id);
              const isChecked = selectedShows.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                    already
                      ? "bg-slate-600 opacity-60"
                      : isChecked
                      ? "bg-purple-700"
                      : "bg-slate-700 hover:bg-slate-600"
                  }`}
                >
                  {!already && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleShowSelection(s.id)}
                      className="w-5 h-5 rounded"
                    />
                  )}
                  {s.image?.medium && (
                    <img src={s.image.medium} alt={s.name} className="w-16 h-24 object-cover rounded" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{s.name}</h3>
                      {already && (
                        <span className="text-xs bg-green-600 px-2 py-1 rounded-full">✓ Already Added</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">
                      {s.premiered ? `Premiered: ${s.premiered.slice(0, 4)}` : "N/A"}
                    </p>
                  </div>
                  {!already && (
                    <button
                      onClick={() => addShow(s)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SORT / FILTER */}
      {myShows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl font-semibold">My Shows ({getSortedShows(myShows).length})</h2>
          <div className="flex gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="added">Sort: Recently Added</option>
              <option value="title">Sort: Title (A–Z)</option>
              <option value="year">Sort: Year (Newest)</option>
              <option value="genre">Sort: Genre</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Shows</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      )}

      {/* SHOWS GRID */}
      {visibleShows.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-lg">
          <Tv className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400">
            {myShows.length ? "No shows match the current filters." : "No shows yet. Add your first above!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visibleShows.map((show) => {
            const { seasons } = getCurrentWatchData(show);
            const progress = getWatchProgress(show);
            const pct = progress.percentage;
            const isExpanded = expandedShow === show.id;
            const hasRewatches = (show.rewatches?.length || 0) > 0;

            return (
              <article
                key={show.id}
                className={`bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 ${
                  pct === 100 ? "ring-2 ring-green-500/50 shadow-green-500/20" : ""
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {show.image && (
                      <img src={show.image} alt={show.name} className="w-20 h-28 object-cover rounded" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xl font-semibold">{show.name}</h3>
                            {pct === 100 && (
                              <span className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-xs font-bold text-white shadow-lg">
                                <Check className="w-4 h-4" />
                                COMPLETED
                              </span>
                            )}
                            {hasRewatches && (
                              <span className="flex items-center gap-1 px-2 py-1 bg-blue-600 rounded-full text-xs font-bold">
                                <RotateCcw className="w-3 h-3" />
                                {show.rewatches.length} rewatch{show.rewatches.length > 1 ? "es" : ""}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-400">
                            {(show.genres || []).join(", ")} • {show.premiered?.slice(0, 4) || ""}
                          </p>

                          <div className="mt-2">
                            <Stars
                              value={show.rating || 0}
                              onChange={(n) => setShowRating(show.id, n)}
                              onClear={() => setShowRating(show.id, 0)}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => removeShow(show.id)}
                          className="text-red-400 hover:text-red-300 p-2"
                          title="Remove show"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>

                      {hasRewatches && (
                        <div className="mb-3 flex items-center gap-2">
                          <span className="text-sm text-slate-400">Viewing:</span>
                          <select
                            value={show.currentRewatch || 1}
                            onChange={(e) => switchToWatch(show.id, parseInt(e.target.value))}
                            className="px-3 py-1 bg-slate-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value={1}>First Watch</option>
                            {show.rewatches.map((rw) => (
                              <option key={rw.watchNumber} value={rw.watchNumber}>
                                Watch #{rw.watchNumber}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="mb-3">
                        <div className="flex justify-between text-sm text-slate-400 mb-1">
                          <span>
                            Progress{" "}
                            {show.currentRewatch > 1 ? `(Watch #${show.currentRewatch})` : ""}
                          </span>
                          <span>
                            {progress.watched} / {progress.total} episodes ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded transition-[width,background-color] duration-300 ${
                              pct === 100 ? "bg-green-600" : "bg-purple-600"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="text-sm text-slate-400 mb-1 block">Watching on:</label>
                        <input
                          value={show.source}
                          onChange={(e) => updateSource(show.id, e.target.value)}
                          placeholder="Netflix, DVD, etc."
                          className="w-full px-3 py-2 bg-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setExpandedShow(isExpanded ? null : show.id)}
                          className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {isExpanded ? "Hide" : "Show"} Seasons & Episodes
                        </button>

                        {pct === 100 && (
                          <button
                            onClick={() => startRewatch(show.id)}
                            className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Re-watch this show
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {Object.keys(seasons)
                        .sort((a, b) => Number(a) - Number(b))
                        .map((sNum) => {
                          const eps = seasons[sNum] || [];
                          const sp = getSeasonProgress(eps);
                          const sid = `${show.id}-${sNum}`;
                          const isOpen = expandedSeason === sid;
                          const done = sp.watched === sp.total && sp.total > 0;

                          return (
                            <div key={sNum} className="bg-slate-700 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <button
                                  onClick={() => setExpandedSeason(isOpen ? null : sid)}
                                  className="flex items-center gap-2"
                                >
                                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  <span className="font-semibold">Season {sNum}</span>
                                  <span className="text-sm text-slate-300">
                                    ({sp.watched}/{sp.total})
                                  </span>
                                  {done && (
                                    <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 bg-green-600 rounded-full text-xs font-bold">
                                      <Check className="w-3 h-3" />
                                      Complete
                                    </span>
                                  )}
                                </button>

                                {!done ? (
                                  <button
                                    onClick={() => markSeasonComplete(show.id, sNum, true)}
                                    className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    Mark Complete
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => markSeasonComplete(show.id, sNum, false)}
                                    className="flex items-center gap-1 px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs"
                                  >
                                    Unmark All
                                  </button>
                                )}
                              </div>

                              {isOpen && (
                                <div className="space-y-2 mt-3">
                                  {eps.map((ep) => (
                                    <div
                                      key={ep.id}
                                      className="flex items-center gap-3 p-2 bg-slate-600 rounded hover:bg-slate-500 transition-colors"
                                    >
                                      <button
                                        onClick={() => toggleEpisodeWatched(show.id, sNum, ep.id)}
                                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                          ep.watched ? "bg-purple-600 border-purple-600" : "border-slate-400"
                                        }`}
                                      >
                                        {ep.watched && <Check className="w-4 h-4" />}
                                      </button>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">
                                            {ep.number}. {ep.name}
                                          </span>
                                        </div>
                                        {ep.airdate && (
                                          <span className="text-xs text-slate-300">{ep.airdate}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-8 text-center text-sm text-slate-300 bg-slate-800 rounded-lg p-4">
        <p className="mb-1">
          <strong>Your data saves automatically.</strong>
        </p>
        <p>Re-watch completed shows, mark seasons complete, sort your collection.</p>
      </div>
    </div>
  );
}
