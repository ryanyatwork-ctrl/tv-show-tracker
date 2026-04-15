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
  Lock,
  Archive,
  ArchiveRestore,
  RefreshCcw,
  X,
  Users,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getSupabase } from "./lib/supabase";
import { getStreamingInfo } from "./services/streamingService";
import StreamingBadges from "./components/StreamingBadges";
import ShowDetailModal from "./components/ShowDetailModal";
import AdminPanel from "./components/AdminPanel";
import HelpModal from "./components/HelpModal";

/**
 * TVShowTracker (Supabase-enabled)
 *
 * Core (FREE, capped to 15 tracked shows):
 * - Track progress across shows and episodes
 * - Want to Watch / In Progress / Completed categories
 * - Sync (Supabase) when signed in
 *
 * Paid (Stripe entitlement, server-truth):
 * - Ratings (stars) + advanced sorting options (Year/Genre) + Genre filter UI
 * - Recommendations are also paid-only (kept in hamburger menu)
 *
 * Data model changes:
 * - Each show now has:
 *    status: "want_to_watch" | "in_progress" | "completed"
 *    isArchived: boolean
 * - Status is based on FIRST WATCH progress (rewatches do not affect status)
 *
 * Category behavior:
 * - Adding a show => Want to Watch
 * - First episode watched (first watch) => In Progress
 * - 100% watched (first watch) => Completed
 * - New episodes added to a previously completed show => auto-downgrade to In Progress
 * - If user resets/unmarks all watched (first watch):
 *    - If Archived OR currently in a Rewatch view => do NOT force Want to Watch
 *    - Else => Want to Watch
 *
 * Paid entitlement:
 * - Reads from public.tvtracker_profiles (user_id, is_paid)
 * - Unlock button calls a Supabase Edge Function to create Checkout URL and redirects
 *   (you must implement the Edge Function; this file just invokes it).
 */

// -----------------------------
// Plan / gating
// -----------------------------
const FREE_SHOW_LIMIT = 10;

// -----------------------------
// Stripe price IDs (your live prices)
// -----------------------------
const STRIPE_PRICE_MONTHLY = "price_1TMK0iPovynVraMaDPTPO4qb";
const STRIPE_PRICE_YEARLY = "price_1TMK08PovynVraMa1zb7BfHB";

// -----------------------------
// Status model
// -----------------------------
const STATUS = {
  WANT: "want_to_watch",
  PROGRESS: "in_progress",
  DONE: "completed",
};

const FILTERS = [
  { key: "all", label: "All Shows" },
  { key: STATUS.PROGRESS, label: "In Progress" },
  { key: STATUS.WANT, label: "Want to Watch" },
  { key: STATUS.DONE, label: "Completed" },
  { key: "archived", label: "Archived" },
];

// -----------------------------
// Alpha jump + article-agnostic sorting
// -----------------------------
function normalizeTitleForSort(title) {
  if (!title) return "";
  return title
    .toString()
    .trim()
    .replace(/^(the|a|an)\s+/i, "")
    .toLowerCase();
}
function alphaGroupKey(title) {
  const normalized = normalizeTitleForSort(title);
  const first = (normalized[0] || "").toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

// ---------- UI preferences persistence (sort/filter) ----------
const UI_PREFS_KEY = "tvtracker.uiPrefs.v3";
function loadUIPrefs() {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      filterStatus: parsed?.filterStatus ?? STATUS.PROGRESS,
      sortBy: parsed?.sortBy ?? "title",
      genreFilter: parsed?.genreFilter ?? "all",
    };
  } catch {
    return { filterStatus: STATUS.PROGRESS, sortBy: "title", genreFilter: "all" };
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
function loadRecsCache(isPaid) {
  if (!isPaid) return null;
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
function saveRecsCache(isPaid, items) {
  if (!isPaid) return;
  try {
    localStorage.setItem(
      RECS_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), items })
    );
  } catch {
    /* ignore */
  }
}

// ---------- Sync meta ----------
const SYNC_META_KEY = "tvtracker.syncMeta.v1";
function randomId() {
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

// -----------------------------
// First-watch progress helpers (status is based on FIRST WATCH only)
// -----------------------------
function getFirstWatchSeasons(show) {
  return show?.seasons || {};
}
function firstWatchCounts(show) {
  try {
    const seasons = getFirstWatchSeasons(show);
    let total = 0;
    let watched = 0;
    Object.values(seasons).forEach((eps) => {
      total += (eps || []).length;
      watched += (eps || []).filter((e) => e?.watched).length;
    });
    return { watched, total };
  } catch {
    return { watched: 0, total: 0 };
  }
}
function inferStatusFromFirstWatch(show) {
  const { watched, total } = firstWatchCounts(show);
  if (watched === 0) return STATUS.WANT;
  if (total > 0 && watched >= total) return STATUS.DONE;
  return STATUS.PROGRESS;
}

// ---------- Data normalization (supports legacy arrays, and v2 envelopes) ----------
function normalizeShow(s) {
  const base = {
    ...s,
    rating: typeof s.rating === "number" ? s.rating : 0,
    isArchived: !!s.isArchived,
  };

  const valid =
    base.status === STATUS.WANT || base.status === STATUS.PROGRESS || base.status === STATUS.DONE;

  const status = valid ? base.status : inferStatusFromFirstWatch(base);

  return {
    ...base,
    status,
  };
}
function normalizeLibrary(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeShow);
}
function unwrapRemoteData(remoteData) {
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

// ---------- Stars UI (paid-gated) ----------
function Stars({ value, onChange, onClear, size = "text-lg", disabled = false, disabledHint }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= (value || 0);
        return (
          <button
            key={n}
            type="button"
            onClick={() => {
              if (disabled) return;
              onChange(n);
            }}
            className={`${size} leading-none ${
              active ? "text-yellow-400" : "text-slate-500"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:text-yellow-300"} transition-colors`}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            title={
              disabled
                ? disabledHint || "Paid feature"
                : n === 1
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
          onClick={() => {
            if (disabled) return;
            onClear();
          }}
          className={`ml-2 text-xs ${
            disabled ? "text-slate-500 cursor-not-allowed" : "text-slate-400 hover:text-slate-200 underline"
          }`}
          title={disabled ? disabledHint || "Paid feature" : "Clear rating"}
        >
          Clear
        </button>
      ) : null}
      {disabled ? (
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-300">
          <Lock className="w-3 h-3" />
          Paid
        </span>
      ) : null}
    </div>
  );
}

// ---------- Merge helper ----------
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
      const lw = watchedCount(s);
      const rw = watchedCount(r);
      if (lw > rw) map.set(s.id, s);
      else if (lw === rw && (s.rating || 0) > (r.rating || 0)) map.set(s.id, s);
    }
  }
  return Array.from(map.values()).map(normalizeShow);
}

// ---------- Modal ----------
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div className="text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-300 hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function TVShowTracker() {
  const syncMetaRef = useRef(loadSyncMeta());
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

  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastPulledAt, setLastPulledAt] = useState(syncMetaRef.current.lastPulledAt || 0);
  const [lastPushedAt, setLastPushedAt] = useState(syncMetaRef.current.lastPushedAt || 0);

  const [conflict, setConflict] = useState(null);

  const pullingRef = useRef(false);
  const pushingRef = useRef(false);

  // ---------- Paid entitlement ----------
  const [isPaid, setIsPaid] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Plan picker modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [pendingPlanPicker, setPendingPlanPicker] = useState(false);
  const ensureProfileRow = async (userId) => {
    const sp = getSupabase();
    if (!sp || !userId) return;
    try {
      await sp.from("tvtracker_profiles").upsert({ user_id: userId }, { onConflict: "user_id" });
    } catch {
      // ignore
    }
  };

  const refreshPaidStatus = async (userId) => {
    const sp = getSupabase();
    if (!sp || !userId) {
      setIsPaid(false);
      return;
    }
    try {
      await ensureProfileRow(userId);
      const { data, error } = await sp
        .from("tvtracker_profiles")
        .select("is_paid")
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      setIsPaid(!!data?.is_paid);
    } catch {
      setIsPaid(false);
    }
  };

  const startCheckout = async (plan = "monthly") => {
    if (!isSignedIn) {
      alert("Please sign in first so your purchase can attach to your account.");
      return;
    }

    const sp = getSupabase();
    if (!sp) {
      alert("Supabase is not configured.");
      return;
    }

    setCheckoutBusy(true);
    try {
      const { data: sessionData } = await sp.auth.getSession();
      const user = sessionData?.session?.user;

      if (!user?.email) {
        alert("Please sign in again.");
        return;
      }

      const priceId = plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

      const { data, error } = await sp.functions.invoke("create-checkout-session", {
        body: {
          priceId,
          customerEmail: user.email,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL not returned.");

      window.location.href = data.url;
    } catch (e) {
      alert(e?.message || "Could not start checkout.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  // Pull cloud library
  const pullLibrary = async ({ allowOverwrite = true } = {}) => {
    if (pullingRef.current) return { ok: false, reason: "busy" };
    const sp = getSupabase();
    if (!sp) return { ok: false, reason: "no-supabase" };

    pullingRef.current = true;
    setSyncBusy(true);
    setSyncMsg("Pulling from cloud…");

    try {
      const {
        data: { session },
      } = await sp.auth.getSession();
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

      syncMetaRef.current =
        saveSyncMeta({ lastSeenRemoteUpdatedAt: remoteUpdatedAt }) || syncMetaRef.current;

      const localChangedAt = syncMetaRef.current.lastLocalChangeAt || 0;
      const lastPulled = syncMetaRef.current.lastPulledAt || 0;

      const looksLikeConflict =
        remoteUpdatedAt > 0 &&
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

      if (allowOverwrite) {
        if (remoteShows.length === 0 && myShows.length > 0) {
          setSyncMsg("Cloud library empty — keeping local data.");
        } else {
          setMyShows(remoteShows.map(normalizeShow));
        }
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

    if (!hasPulledFromCloudRef.current) {
      return { ok: false, reason: "not-pulled-yet" };
    }

    pushingRef.current = true;
    setSyncBusy(true);
    setSyncMsg("Pushing to cloud…");

    try {
      const {
        data: { session },
      } = await sp.auth.getSession();
      if (!session?.user) return { ok: false, reason: "no-session" };

      const envelope = makeRemoteEnvelope(payload, syncMetaRef.current);

      await sp
        .from("tvtracker_library")
        .upsert({ user_id: session.user.id, data: envelope }, { onConflict: "user_id" });

      const nextMeta =
        saveSyncMeta({
          lastPushedAt: Date.now(),
          lastSeenRemoteUpdatedAt: envelope.updatedAt,
        }) || syncMetaRef.current;
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

      const {
        data: { session },
      } = await sp.auth.getSession();

      if (session?.user) {
        setIsSignedIn(true);
        setUserEmail(session.user.email || "");
        await refreshPaidStatus(session.user.id);
        await pullLibrary({ allowOverwrite: true });
      }

      sp.auth.onAuthStateChange(async (_e, ses) => {
        const signed = !!ses?.user;
        setIsSignedIn(signed);
        setUserEmail(signed ? ses.user.email || "" : "");
        if (signed) {
          await refreshPaidStatus(ses.user.id);
          await pullLibrary({ allowOverwrite: true });
        } else {
          hasPulledFromCloudRef.current = false;
          setConflict(null);
          setIsPaid(false);
        }
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-push whenever local library changes (only if signed-in AND pulled)
  useEffect(() => {
    if (!isSignedIn) return;
    if (!hasPulledFromCloudRef.current) return;
    if (conflict) return;
    pushLibrary(myShows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, myShows, conflict]);

  // ---------- Email magic link UI state ----------
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

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
      // If already signed in with email, LINK Google instead of creating a new account
      const { data: { session } } = await sp.auth.getSession();
      if (session?.user) {
        const { error } = await sp.auth.linkIdentity({ provider: "google" });
        if (error) throw error;
        return;
      }
      // Not signed in — normal OAuth flow
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
      const { error } = await sp.auth.signOut();
      if (error) console.warn("Sign out error:", error);
      // Clear all local data so the screen resets to default
      setMyShows([]);
      setIsPaid(false);
      setMenuOpen(false);
      hasPulledFromCloudRef.current = false;
      try { localStorage.removeItem("tvShowTrackerData"); } catch { /* ignore */ }
    } catch (e) {
      console.error("Sign out failed:", e);
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
  const initialPrefs = loadUIPrefs();
  const [filterStatus, setFilterStatus] = useState(initialPrefs.filterStatus);
  const [sortBy, setSortBy] = useState(initialPrefs.sortBy);
  const [genreFilter, setGenreFilter] = useState(initialPrefs.genreFilter);

  useEffect(() => {
    saveUIPrefs({ filterStatus, sortBy, genreFilter });
  }, [filterStatus, sortBy, genreFilter]);

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

  // Free cap modal
  const [limitModalOpen, setLimitModalOpen] = useState(false);

  // ---------- Streaming availability ----------
  const [streamingMap, setStreamingMap] = useState({});
  const [selectedShow, setSelectedShow] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuDataOpen, setMenuDataOpen] = useState(false);
  const [menuSupportOpen, setMenuSupportOpen] = useState(false);

  // ---------- Scroll-aware sticky header ----------
  const [hasScrolled, setHasScrolled] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setHasScrolled(window.scrollY > 80);
      if (window.scrollY <= 80) setFiltersOpen(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const fetchedStreamingRef = useRef(new Set());

  useEffect(() => {
    if (!isSignedIn) return;
    myShows.forEach((show) => {
      if (fetchedStreamingRef.current.has(show.id)) return;
      fetchedStreamingRef.current.add(show.id);
      getStreamingInfo(show.id, show.name, show.premiered).then((result) => {
        if (result?.providers) {
          setStreamingMap((prev) => ({ ...prev, [show.id]: result }));
        }
      });
    });
  }, [myShows, isSignedIn]);

  // ---------- Helpers ----------
  const isShowAdded = (id) => myShows.some((s) => s.id === id);

  const trackedCount = useMemo(() => myShows.filter((s) => !s.isArchived).length, [myShows]);
  const canAddMore = isPaid || trackedCount < FREE_SHOW_LIMIT;

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

  const getFirstWatchProgress = (show) => {
    const { watched, total } = firstWatchCounts(show);
    const percentage = total > 0 ? Math.round((watched / total) * 100) : 0;
    return { watched, total, percentage };
  };

  const getSeasonProgress = (episodes) => {
    const watched = episodes.filter((e) => e.watched).length;
    return { watched, total: episodes.length };
  };

  const setStatusByFirstWatch = (show) => {
    const inferred = inferStatusFromFirstWatch(show);
    return inferred;
  };

  const getSortedShows = (shows) => {
    const arr = [...shows];

    const effectiveSort =
      !isPaid && (sortBy === "year" || sortBy === "genre") ? "title" : sortBy;

    switch (effectiveSort) {
      case "title":
        arr.sort((a, b) =>
          normalizeTitleForSort(a.name).localeCompare(normalizeTitleForSort(b.name))
        );
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

  const setShowArchived = (id, isArchived) => {
    setMyShows((prev) => prev.map((s) => (s.id === id ? { ...s, isArchived } : s)));
  };

  const resetFirstWatchProgress = (id) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;

        const isArchived = !!show.isArchived;
        const inRewatchView = !!show.currentRewatch && show.currentRewatch > 1;

        const nextSeasons = {};
        Object.keys(show.seasons || {}).forEach((sNum) => {
          nextSeasons[sNum] = (show.seasons[sNum] || []).map((e) => ({ ...e, watched: false }));
        });

        const nextShow = { ...show, seasons: nextSeasons };

        if (!isArchived && !inRewatchView) {
          nextShow.status = STATUS.WANT;
        } else {
          nextShow.status = show.status || inferStatusFromFirstWatch(nextShow);
        }

        return nextShow;
      })
    );
  };

  // ---------- Recommendations ----------
  const [recs, setRecs] = useState(() => loadRecsCache(isPaid) || []);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsMsg, setRecsMsg] = useState("");

  useEffect(() => {
    if (isPaid) {
      const cached = loadRecsCache(true);
      if (cached) setRecs(cached);
    } else {
      setRecs([]);
      setRecsMsg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid]);

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
    if (!isPaid) return;

    const { lovedCount, topGenres } = lovedGenreProfile;

    if (lovedCount < 1 || topGenres.length === 0) {
      setRecsMsg("Rate at least one show 4★ or 5★ to generate recommendations.");
      setRecs([]);
      saveRecsCache(isPaid, []);
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
      saveRecsCache(isPaid, sorted);
      setRecsMsg(
        sorted.length ? "" : "No recommendations found. Try rating more shows 4★–5★."
      );
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
    if (!navigator.onLine) {
      setSearchResults([]);
      setIsSearching(false);
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

  const enforceFreeCapOrBlock = () => {
    if (isPaid) return true;
    const count = myShows.filter((s) => !s.isArchived).length;
    if (count >= FREE_SHOW_LIMIT) {
      setLimitModalOpen(true);
      return false;
    }
    return true;
  };

  const addShow = async (show, clearAfter = true) => {
    if (!navigator.onLine) return;
    if (isShowAdded(show.id)) return;

    if (!enforceFreeCapOrBlock()) return;

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

    const newShow = normalizeShow({
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
      status: STATUS.WANT,
      isArchived: false,
    });

    setMyShows((prev) => [newShow, ...prev]);

    if (clearAfter) {
      setSelectedShows(new Set());
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const addSelectedShows = async () => {
    if (!navigator.onLine) return;

    const toAdd = searchResults
      .map((r) => r.show)
      .filter((s) => selectedShows.has(s.id) && !isShowAdded(s.id));

    for (const s of toAdd) {
      if (!enforceFreeCapOrBlock()) break;
      // eslint-disable-next-line no-await-in-loop
      await addShow(s, false);
    }
    setSelectedShows(new Set());
  };

  // ---------- Episode refresh (new episodes) ----------
  const refreshEpisodesForShow = async (showId) => {
    if (!navigator.onLine) return;
    const details = await fetchShowDetails(showId);
    if (!details) return;

    const fresh = details?._embedded?.episodes || [];
    const freshBySeason = {};
    fresh.forEach((ep) => {
      const s = ep.season;
      if (!freshBySeason[s]) freshBySeason[s] = [];
      freshBySeason[s].push({
        id: ep.id,
        number: ep.number,
        name: ep.name,
        airdate: ep.airdate,
      });
    });

    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== showId) return show;

        const existing = show.seasons || {};
        const nextSeasons = { ...existing };
        let addedAny = false;

        Object.keys(freshBySeason).forEach((sNum) => {
          const localList = nextSeasons[sNum] ? [...nextSeasons[sNum]] : [];
          const localIds = new Set(localList.map((e) => e.id));

          const incoming = freshBySeason[sNum]
            .slice()
            .sort((a, b) => (a.number || 0) - (b.number || 0));

          for (const ep of incoming) {
            if (!localIds.has(ep.id)) {
              localList.push({
                id: ep.id,
                number: ep.number,
                name: ep.name,
                airdate: ep.airdate,
                watched: false,
              });
              addedAny = true;
            }
          }

          localList.sort((a, b) => (a.number || 0) - (b.number || 0));
          nextSeasons[sNum] = localList;
        });

        const nextShow = { ...show, seasons: nextSeasons };

        if (addedAny) {
          const priorStatus = show.status || inferStatusFromFirstWatch(show);
          if (priorStatus === STATUS.DONE) {
            nextShow.status = STATUS.PROGRESS;
          } else {
            nextShow.status = priorStatus;
          }
        }

        return normalizeShow(nextShow);
      })
    );
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

  const reconcileStatusAfterFirstWatchChange = (show) => {
    const status = setStatusByFirstWatch(show);
    return { ...show, status };
  };

  const toggleEpisodeWatched = (id, season, epId) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;

        const isFirst = !show.currentRewatch || show.currentRewatch === 1;

        if (isFirst) {
          const next = {
            ...show,
            seasons: {
              ...show.seasons,
              [season]: show.seasons[season].map((e) =>
                e.id === epId ? { ...e, watched: !e.watched } : e
              ),
            },
          };
          return normalizeShow(reconcileStatusAfterFirstWatchChange(next));
        }

        const next = {
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
        return normalizeShow(next);
      })
    );
  };

  const markSeasonComplete = (id, season, watched = true) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;

        const isFirst = !show.currentRewatch || show.currentRewatch === 1;

        if (isFirst) {
          const next = {
            ...show,
            seasons: {
              ...show.seasons,
              [season]: show.seasons[season].map((e) => ({ ...e, watched })),
            },
          };
          return normalizeShow(reconcileStatusAfterFirstWatchChange(next));
        }

        const next = {
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
        return normalizeShow(next);
      })
    );
  };

  const markShowCompletedFirstWatch = (id) => {
    setMyShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show;
        const nextSeasons = {};
        Object.keys(show.seasons || {}).forEach((sNum) => {
          nextSeasons[sNum] = (show.seasons[sNum] || []).map((e) => ({ ...e, watched: true }));
        });
        return normalizeShow({ ...show, seasons: nextSeasons, status: STATUS.DONE });
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

        return normalizeShow({
          ...show,
          rewatches: [...(show.rewatches || []), { watchNumber: nextNum, seasons: clone }],
          currentRewatch: nextNum,
        });
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
      "First Watch Watched",
      "First Watch Total",
      "First Watch Progress %",
      "Status",
      "Archived",
      "Rewatches",
    ];
    const rows = [header];

    myShows.forEach((show) => {
      const first = getFirstWatchProgress(show);
      const progress = first.total ? first.watched / first.total : 0;
      rows.push([
        show.name,
        show.premiered ? show.premiered.slice(0, 4) : "",
        (show.genres || []).join(", "),
        show.source || "",
        show.rating || "",
        first.watched,
        first.total,
        progress,
        show.status || inferStatusFromFirstWatch(show),
        show.isArchived ? "yes" : "no",
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
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
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

  // ---------- Derived counts + lists ----------
  const counts = useMemo(() => {
    const nonArchived = myShows.filter((s) => !s.isArchived);
    const archived = myShows.filter((s) => s.isArchived);

    const want = nonArchived.filter((s) => (s.status || inferStatusFromFirstWatch(s)) === STATUS.WANT).length;
    const prog = nonArchived.filter((s) => (s.status || inferStatusFromFirstWatch(s)) === STATUS.PROGRESS).length;
    const done = nonArchived.filter((s) => (s.status || inferStatusFromFirstWatch(s)) === STATUS.DONE).length;

    return {
      all: nonArchived.length,
      [STATUS.WANT]: want,
      [STATUS.PROGRESS]: prog,
      [STATUS.DONE]: done,
      archived: archived.length,
    };
  }, [myShows]);

  const titleText = useMemo(() => {
    const active = FILTERS.find((f) => f.key === filterStatus) || FILTERS[0];
    const n = counts[filterStatus] ?? counts.all ?? 0;
    return `${active.label} (${n})`;
  }, [filterStatus, counts]);

  const genreOptions = useMemo(() => {
    const set = new Set();
    myShows.forEach((s) => {
      (s.genres || []).forEach((g) => set.add(g));
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [myShows]);

  const visibleShows = useMemo(() => {
    const base = myShows.filter((s) => {
      const status = s.status || inferStatusFromFirstWatch(s);

      if (filterStatus === "archived") return !!s.isArchived;
      if (filterStatus === "all") return !s.isArchived;

      if (s.isArchived) return false;
      return status === filterStatus;
    });

    const afterGenre =
      isPaid && genreFilter !== "all"
        ? base.filter((s) => (s.genres || []).includes(genreFilter))
        : base;

    return getSortedShows(afterGenre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myShows, filterStatus, sortBy, genreFilter, isPaid]);

  // ---------- Alpha jump dropdown ----------
  const letterRefs = useRef({});

  const alphaOptions = useMemo(() => {
    const effectiveSort =
      !isPaid && (sortBy === "year" || sortBy === "genre") ? "title" : sortBy;
    if (effectiveSort !== "title") return [];
    const set = new Set();
    for (const s of visibleShows) set.add(alphaGroupKey(s?.name || ""));
    const base = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    base.push("#");
    return base.filter((l) => set.has(l));
  }, [visibleShows, sortBy, isPaid]);

  const jumpToLetter = (letter) => {
    const el = letterRefs.current[letter];
    if (!el) return;
    const stickyBar = document.querySelector(".sticky");
    const offset = stickyBar ? stickyBar.getBoundingClientRect().height : 80;
    const top = el.getBoundingClientRect().top + window.scrollY - offset - 8;
    window.scrollTo({ top, behavior: "smooth" });
  };

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
    hasPulledFromCloudRef.current = true;
    setConflict(null);
    await pushLibrary(myShows);
  };

  // Auto-reopen plan picker after sign-in completes
  useEffect(() => {
    if (userEmail && pendingPlanPicker) {
      setPendingPlanPicker(false);
      setPlanModalOpen(true);
    }
  }, [userEmail, pendingPlanPicker]);

  // ---------- Render ----------
  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-hidden">
      {/* SIGN-IN PROMPT MODAL */}
      <Modal
        open={showSignInPrompt}
        title="Sign in to upgrade"
        onClose={() => { setShowSignInPrompt(false); setPendingPlanPicker(false); }}
      >
        <div className="text-sm text-slate-200 leading-relaxed">
          You need an account before upgrading so your purchase stays attached
          to you across devices. Sign in (top right) and your plan picker will
          open automatically.
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => { setShowSignInPrompt(false); setPendingPlanPicker(false); }}
            className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold"
          >
            Got it
          </button>
        </div>
      </Modal>

      {/* PLAN PICKER MODAL */}
      <Modal
        open={planModalOpen}
        title="Choose a plan"
        onClose={() => setPlanModalOpen(false)}
      >
        <div className="text-sm text-slate-200">
          Pick monthly or yearly billing. You'll be redirected to secure Stripe Checkout.
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={async () => {
              setPlanModalOpen(false);
              await startCheckout("monthly");
            }}
            disabled={checkoutBusy}
            className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-3 text-sm font-semibold"
          >
            {checkoutBusy ? "Starting…" : "Monthly"}
          </button>
          <button
            onClick={async () => {
              setPlanModalOpen(false);
              await startCheckout("yearly");
            }}
            disabled={checkoutBusy}
            className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-4 py-3 text-sm font-semibold"
          >
            {checkoutBusy ? "Starting…" : "Yearly"}
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-400">
        </div>
      </Modal>

      {/* FREE CAP MODAL */}
      <Modal open={limitModalOpen} title="Upgrade to add more shows" onClose={() => setLimitModalOpen(false)}>
        <div className="text-sm text-slate-200">
          Free plan supports up to <span className="font-semibold">{FREE_SHOW_LIMIT}</span> tracked shows.
        </div>
        <div className="mt-3 text-xs text-slate-300">
          Tip: You can archive older shows to make room.
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => {
              setLimitModalOpen(false);
              setMenuOpen(true);
            }}
            className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold"
          >
            View options
          </button>
          <button
            onClick={() => {
              setLimitModalOpen(false);
              if (!userEmail) { setShowSignInPrompt(true); setPendingPlanPicker(true); } else { setPlanModalOpen(true); }
            }}
            disabled={checkoutBusy}
            className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
          >
            {checkoutBusy ? "Starting…" : "Upgrade"}
          </button>
        </div>
      </Modal>

      {/* HEADER */}
      <header className="flex-shrink-0 px-4 pt-4 pb-2 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-purple-400" />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                TV Tracker
              </h1>
              <p className="text-slate-300 mt-1">Never lose track of what you're watching</p>
            </div>
          </div>

          <div className="flex items-center">
            {isSignedIn ? (
              <span className="hidden md:inline text-xs text-slate-300 mr-3">
                {userEmail ? `Signed in as ${userEmail}` : "Signed in"}
              </span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(true); setShowEmailForm(true); }}
                className="mr-3 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
              >
                Sign in
              </button>
            )}

            {/* Hamburger */}
            <button onClick={() => setHelpOpen(true)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 mr-2 text-slate-300 hover:text-white font-bold text-sm" title="Help">?</button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Open menu"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
              >
                <Menu className="w-6 h-6" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[90vw] rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden z-50">
                  {/* Account */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                    Account
                  </div>

                  {isSignedIn ? (
                    <div className="px-4 py-3 border-b border-slate-700">
                      <div className="text-sm text-slate-200">
                        Signed in{userEmail ? ` as ${userEmail}` : ""}
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2">
                        <div className="text-xs text-slate-200">
                          Plan:{" "}
                          <span className="font-semibold">
                            {isPaid ? "Paid" : `Free (limit ${FREE_SHOW_LIMIT})`}
                          </span>
                          {!isPaid ? (
                            <div className="text-[11px] text-slate-300">
                              Tracked: {trackedCount}/{FREE_SHOW_LIMIT}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-300">Unlimited tracked shows</div>
                          )}
                        </div>
                        {!isPaid && (
                          <button
                            onClick={() => { if (!userEmail) { setShowSignInPrompt(true); setPendingPlanPicker(true); } else { setPlanModalOpen(true); } }}
                            disabled={checkoutBusy}
                            className="rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold"
                          >
                            {checkoutBusy ? "…" : "Upgrade"}
                          </button>
                        )}
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

                      <p className="text-xs text-slate-400 text-center">
                        Used email sign-in before? Sign in with email first, then link Google.
                      </p>

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

                  {isSignedIn && (<>
                  {/* Sync */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                    Sync
                  </div>

                  <div className="px-4 py-3 border-b border-slate-700 space-y-2">
                    <div className="text-xs text-slate-300">
                      Last Pull:{" "}
                      <span className="text-slate-200">{fmtTime(lastPulledAt)}</span>
                      <br />
                      Last Push:{" "}
                      <span className="text-slate-200">{fmtTime(lastPushedAt)}</span>
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
                        Pull
                      </button>
                      <button
                        onClick={syncNowPush}
                        disabled={syncBusy}
                        className="flex-1 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-2 text-sm font-medium"
                        title="Sync now (this device → cloud)"
                      >
                        Sync
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

                  {/* Recommendations */}
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                    Recommendations
                  </div>

                  <div className="px-4 py-3 border-b border-slate-700">
                    {!isPaid ? (
                      <div className="text-sm text-slate-300">
                        <div className="font-semibold text-slate-200 mb-1">Paid feature</div>
                        Recommendations, ratings, advanced sorting, and genre filter are unlocked with an upgrade.
                        <div className="mt-3">
                          <button
                            onClick={() => { if (!userEmail) { setShowSignInPrompt(true); setPendingPlanPicker(true); } else { setPlanModalOpen(true); } }}
                            disabled={checkoutBusy}
                            className="w-full rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-2 text-sm font-medium"
                          >
                            {checkoutBusy ? "Starting…" : "Upgrade"}
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          (Purchase attaches to your signed-in account.)
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-slate-300">
                          Based on your 4–5★ shows{" "}
                          {lovedGenreProfile.topGenres.length
                            ? `(top genres: ${lovedGenreProfile.topGenres.join(", ")})`
                            : ""}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={fetchRecommendations}
                            disabled={recsLoading}
                            className="flex-1 px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 font-semibold text-sm"
                          >
                            {recsLoading ? "Generating…" : "Generate"}
                          </button>
                          <button
                            onClick={() => {
                              setRecs([]);
                              saveRecsCache(isPaid, []);
                              setRecsMsg("");
                            }}
                            className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm"
                          >
                            Clear
                          </button>
                        </div>

                        {recsMsg && <div className="mt-3 text-sm text-slate-300">{recsMsg}</div>}

                        {recs.length > 0 && (
                          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
                            {recs.map((r) => (
                              <div
                                key={r.id}
                                className="bg-slate-700 rounded-lg p-3 border border-slate-600"
                              >
                                <div className="flex gap-3">
                                  {r.image ? (
                                    <img
                                      src={r.image}
                                      alt={r.name}
                                      className="w-12 h-16 object-cover rounded"
                                    />
                                  ) : (
                                    <div className="w-12 h-16 rounded bg-slate-600 flex items-center justify-center text-slate-300">
                                      <Tv className="w-5 h-5" />
                                    </div>
                                  )}
                                  <div className="flex-1">
                                    <div className="font-semibold text-sm">{r.name}</div>
                                    <div className="text-xs text-slate-300 mt-1">
                                      {r.premiered ? r.premiered.slice(0, 4) : ""}{" "}
                                      {r.genres?.length ? `• ${r.genres.join(", ")}` : ""}
                                    </div>
                                    <div className="mt-2 flex gap-2 items-center">
                                      <button
                                        onClick={async () => {
                                          if (!enforceFreeCapOrBlock()) return;
                                          await addShow(
                                            {
                                              id: r.id,
                                              name: r.name,
                                              image: r.image
                                                ? { medium: r.image, original: r.image }
                                                : undefined,
                                            },
                                            false
                                          );
                                        }}
                                        disabled={isShowAdded(r.id)}
                                        className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-xs font-semibold"
                                      >
                                        {isShowAdded(r.id) ? "Added" : "Add"}
                                      </button>
                                      <span className="text-[11px] text-slate-400" title="Relevance score">
                                        score {r.score}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Data */}
                  <button
                    onClick={() => setMenuDataOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 border-t border-slate-700 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-slate-400" />
                      <span>Import / Export</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${menuDataOpen ? "rotate-180" : ""}`} />
                  </button>
                  {menuDataOpen && (
                    <div className="bg-slate-900/50 border-b border-slate-700">
                      <label className="flex items-center gap-2 px-6 py-2.5 hover:bg-slate-700 cursor-pointer text-sm text-slate-300">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Import JSON</span>
                        <input type="file" accept=".json" onChange={importData} className="hidden" />
                      </label>
                      <button onClick={exportJSON} disabled={myShows.length === 0} className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-slate-700 disabled:opacity-40 text-sm text-slate-300">
                        <Download className="w-3.5 h-3.5" />
                        <span>Export JSON</span>
                      </button>
                      <button onClick={exportExcel} disabled={myShows.length === 0} className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-slate-700 disabled:opacity-40 text-sm text-slate-300">
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Excel</span>
                      </button>
                    </div>
                  )}

                  {/* Admin — only visible to ryan.young@gmail.com */}
                  {userEmail === 'ryan.young@gmail.com' && (
                    <>
                      <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-700">Admin</div>
                      <button
                        onClick={() => { setAdminOpen(true); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700 text-purple-400"
                      >
                        <Users className="w-4 h-4" />
                        <span>Admin Panel</span>
                      </button>
                    </>
                  )}

                  {/* Support */}
                  <button
                    onClick={() => setMenuSupportOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 border-t border-slate-700 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-slate-400" />
                      <span>Support the Dev</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${menuSupportOpen ? "rotate-180" : ""}`} />
                  </button>
                  {menuSupportOpen && (
                    <div className="bg-slate-900/50 border-b border-slate-700 px-4 py-3 flex gap-3">
                      <a href="https://paypal.me/Yelltom" target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium">
                        <DollarSign className="w-3.5 h-3.5" /> PayPal
                      </a>
                      <a href="https://www.venmo.com/u/BellevilleSystems" target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-sm font-medium">
                        <DollarSign className="w-3.5 h-3.5" /> Venmo
                      </a>
                    </div>
                  )}
                  </>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-4">

      {/* SEARCH / ADD */}
      <div className="mb-8 bg-slate-800 rounded-lg p-6 shadow-xl max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-purple-400" />
          Add New Series
        </h2>

        {!navigator.onLine && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            You're offline. Connect to the internet to search and add new shows.
          </div>
        )}

        {!isPaid && (
          <div className="mb-4 rounded-lg border border-slate-600 bg-slate-900/40 p-3 text-sm text-slate-200 flex items-start justify-between gap-3">
            <div>
              Free tier: <span className="font-semibold">{FREE_SHOW_LIMIT}</span> tracked shows.
              <div className="text-xs text-slate-300 mt-1">
                Tracked now: {trackedCount}/{FREE_SHOW_LIMIT} (archive to make room)
              </div>
            </div>
            <button
              onClick={() => { if (!userEmail) { setShowSignInPrompt(true); setPendingPlanPicker(true); } else { setPlanModalOpen(true); } }}
              disabled={checkoutBusy}
              className="shrink-0 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
            >
              {checkoutBusy ? "…" : "Upgrade"}
            </button>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a TV show..."
            className="w-full pl-12 pr-4 py-3 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            type="text"
            disabled={!navigator.onLine}
          />
        </div>

        {selectedShows.size > 0 && (
          <div className="mb-4 flex items-center justify-between bg-purple-900/50 p-3 rounded-lg">
            <span>{selectedShows.size} show(s) selected</span>
            <button
              onClick={addSelectedShows}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
              disabled={!navigator.onLine}
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
                    <img
                      src={s.image.medium}
                      alt={s.name}
                      className="w-16 h-24 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{s.name}</h3>
                      {already && (
                        <span className="text-xs bg-green-600 px-2 py-1 rounded-full">
                          ✓ Already Added
                        </span>
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
                      disabled={!navigator.onLine || (!isPaid && !canAddMore)}
                      title={!isPaid && !canAddMore ? `Free limit is ${FREE_SHOW_LIMIT}` : ""}
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

      {/* CATEGORY TABS + CONTROLS */}
      {myShows.length > 0 && (
        <div className="sticky top-0 z-30 backdrop-blur-md bg-[#0d0d14]/95 pb-3 shadow-lg shadow-black/40" style={{marginLeft: "-1rem", marginRight: "-1rem", paddingLeft: "1rem", paddingRight: "1rem"}}>
        <div className="max-w-6xl mx-auto space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-semibold">{titleText}</h2>

              {(!(!isPaid && (sortBy === "year" || sortBy === "genre")) ? sortBy : "title") === "title" &&
                alphaOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-300">Jump:</span>
                    <select
                      className="px-3 py-2 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        jumpToLetter(val);
                        e.target.value = "";
                      }}
                      title="Jump to letter"
                    >
                      <option value="">Select…</option>
                      {alphaOptions.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
            </div>
            {hasScrolled && (
              <button
                onClick={() => setFiltersOpen((f) => !f)}
                className="ml-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/70 text-slate-300 text-xs hover:bg-slate-600/70 transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
                Filters
              </button>
            )}

            <div className={hasScrolled && !filtersOpen ? "hidden" : "flex gap-3 flex-wrap"}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="added">Sort: Recently Added</option>
                <option value="title">Sort: Title (A–Z)</option>
                <option value="year" disabled={!isPaid}>
                  {!isPaid ? "Sort: Year (Paid)" : "Sort: Year (Newest)"}
                </option>
                <option value="genre" disabled={!isPaid}>
                  {!isPaid ? "Sort: Genre (Paid)" : "Sort: Genre"}
                </option>
              </select>

              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                disabled={!isPaid}
                className={`px-4 py-2 bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  !isPaid ? "opacity-60 cursor-not-allowed" : ""
                }`}
                title={!isPaid ? "Upgrade to use genre filter" : "Filter by genre"}
              >
                {genreOptions.map((g) => (
                  <option key={g} value={g}>
                    {g === "all" ? "Genre: All" : `Genre: ${g}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className={hasScrolled && !filtersOpen ? "hidden" : "flex flex-wrap gap-2"}>
            {FILTERS.map((t) => {
              const n = counts[t.key] ?? 0;
              const active = filterStatus === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setFilterStatus(t.key)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    active ? "bg-purple-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-100"
                  }`}
                >
                  {t.label} ({n})
                </button>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {/* SHOWS GRID */}
      <div className="max-w-6xl mx-auto">
        {visibleShows.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-lg">
            <Tv className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">
              {myShows.length
                ? "No shows match the current filters."
                : "No shows yet. Add your first above!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {visibleShows.map((show, idx) => {
              const { seasons } = getCurrentWatchData(show);
              const progress = getWatchProgress(show);
              const first = getFirstWatchProgress(show);

              const pct = progress.percentage;
              const firstPct = first.percentage;

              const isExpanded = expandedShow === show.id;
              const hasRewatches = (show.rewatches?.length || 0) > 0;

              const status = show.status || inferStatusFromFirstWatch(show);

              const prev = idx > 0 ? visibleShows[idx - 1] : null;
              const effectiveSort =
                !isPaid && (sortBy === "year" || sortBy === "genre") ? "title" : sortBy;

              const thisLetter = effectiveSort === "title" ? alphaGroupKey(show.name) : null;
              const prevLetter =
                effectiveSort === "title" && prev ? alphaGroupKey(prev.name) : null;
              const showLetterAnchor =
                effectiveSort === "title" && thisLetter && thisLetter !== prevLetter;

              return (
                <React.Fragment key={show.id}>
                  {showLetterAnchor && (
                    <div
                      ref={(el) => {
                        if (el) letterRefs.current[thisLetter] = el;
                      }}
                      className="col-span-full flex items-center gap-3 pt-2 pb-1"
                    >
                      <span className="text-2xl font-bold text-purple-400 w-8 flex-shrink-0">{thisLetter}</span>
                      <div className="flex-1 h-px bg-purple-800/50" />
                      <button
                        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                        className="text-xs text-purple-500 hover:text-purple-300 transition-colors flex-shrink-0 ml-2 px-2 py-0.5 rounded hover:bg-purple-900/30"
                      >
                        ↑ Top
                      </button>
                    </div>
                  )}

                  <article
                    className={`bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 ${
                      status === STATUS.DONE ? "ring-2 ring-green-500/50 shadow-green-500/20" : ""
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{width: '80px'}}>
                          {show.image && (
                            <img
                              src={show.image}
                              alt={show.name}
                              className="w-20 h-28 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setSelectedShow(show.id)}
                            />
                          )}
                          <StreamingBadges
                            result={streamingMap[show.id]}
                            loading={!streamingMap[show.id] && isSignedIn}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-xl font-semibold cursor-pointer hover:text-purple-400 transition-colors" onClick={() => setSelectedShow(show.id)}>{show.name}</h3>

                                {show.isArchived && (
                                  <span className="flex items-center gap-1 px-3 py-1 bg-slate-700 rounded-full text-xs font-bold text-white">
                                    <Archive className="w-4 h-4" />
                                    ARCHIVED
                                  </span>
                                )}

                                {status === STATUS.DONE && !show.isArchived && (
                                  <span className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-xs font-bold text-white shadow-lg">
                                    <Check className="w-4 h-4" />
                                    COMPLETED
                                  </span>
                                )}

                                {status === STATUS.WANT && !show.isArchived && (
                                  <span className="flex items-center gap-1 px-3 py-1 bg-purple-700 rounded-full text-xs font-bold text-white">
                                    Want to Watch
                                  </span>
                                )}

                                {status === STATUS.PROGRESS && !show.isArchived && (
                                  <span className="flex items-center gap-1 px-3 py-1 bg-blue-700 rounded-full text-xs font-bold text-white">
                                    In Progress
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
                                  disabled={!isPaid}
                                  disabledHint="Upgrade to rate shows"
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

                          <div className="mb-2">
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

                          <div className="mb-3 text-xs text-slate-400">
                            Status is based on <span className="text-slate-200 font-semibold">First Watch</span>:{" "}
                            {first.watched}/{first.total} ({firstPct}%)
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
                              onClick={async () => {
                                if (!isExpanded) {
                                  await refreshEpisodesForShow(show.id);
                                }
                                setExpandedShow(isExpanded ? null : show.id);
                              }}
                              className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              {isExpanded ? "Hide" : "Show"} Seasons & Episodes
                            </button>

                            <button
                              onClick={() => refreshEpisodesForShow(show.id)}
                              className="flex items-center gap-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                              title="Refresh episodes (pull new episodes if any)"
                              disabled={!navigator.onLine}
                            >
                              <RefreshCcw className="w-4 h-4" />
                              Refresh
                            </button>

                            {!show.isArchived ? (
                              <button
                                onClick={() => setShowArchived(show.id, true)}
                                className="flex items-center gap-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                                title="Archive this show"
                              >
                                <Archive className="w-4 h-4" />
                                Archive
                              </button>
                            ) : (
                              <button
                                onClick={() => setShowArchived(show.id, false)}
                                className="flex items-center gap-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                                title="Restore from archive"
                              >
                                <ArchiveRestore className="w-4 h-4" />
                                Restore
                              </button>
                            )}

                            <button
                              onClick={() => resetFirstWatchProgress(show.id)}
                              className="flex items-center gap-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                              title="Reset First Watch progress (unwatch all)"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Reset First Watch
                            </button>

                            {status !== STATUS.DONE && !show.isArchived && (
                              <button
                                onClick={() => markShowCompletedFirstWatch(show.id)}
                                className="flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                                title="Mark show completed (first watch)"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Complete
                              </button>
                            )}

                            {status === STATUS.DONE && !show.isArchived && (
                              <button
                                onClick={() => startRewatch(show.id)}
                                className="flex items-center gap-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                              >
                                <RotateCcw className="w-4 h-4" />
                                Re-watch
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
                                      <span className="text-sm text-slate-300">({sp.watched}/{sp.total})</span>
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
                                            {ep.airdate && <span className="text-xs text-slate-300">{ep.airdate}</span>}
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
                </React.Fragment>
              );
            })}
          </div>
        )}

        {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        <ShowDetailModal
          show={selectedShow ? myShows.find((s) => s.id === selectedShow) : null}
          streamingResult={selectedShow ? streamingMap[selectedShow] : null}
          onClose={() => setSelectedShow(null)}
        />
        <div className="mt-8 text-center text-sm text-slate-300 bg-slate-800 rounded-lg p-4">
          <p className="mb-1">
            <strong>Your data saves automatically.</strong>
          </p>
          <p>Want to Watch → In Progress → Completed. Archive older shows. Re-watch completed series.</p>
          <div className="mt-3 flex justify-center flex-wrap gap-3 text-xs text-slate-400">
            <a href="mailto:contact@tvtracker.me" className="hover:text-purple-400 transition-colors">contact@tvtracker.me</a>
            <span>·</span>
            <a href="/tos.html" target="_blank" className="hover:text-purple-400 transition-colors">Terms of Service</a>
            <span>·</span>
            <a href="/privacy.html" target="_blank" className="hover:text-purple-400 transition-colors">Privacy Policy</a>
          </div>
          <div className="mt-4 flex justify-center">
            <a
              href="https://www.producthunt.com/posts/tv-tracker"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1110282&theme=dark&t=1774811172022"
                alt="TV Tracker on Product Hunt"
                width="250"
                height="54"
              />
            </a>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
