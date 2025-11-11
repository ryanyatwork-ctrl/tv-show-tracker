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
  LogIn,
  LogOut,
  Cloud,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getSupabase } from "./lib/supabase"; // optional cloud sync

/**
 * TVShowTracker
 * - LocalStorage persistence
 * - TVMaze search
 * - Multi-select add, “already added” badge
 * - Rewatch system (Watch #2, #3, …)
 * - One-click mark season complete/unmark
 * - Sort by: added/title/year/genre
 * - Progress bar switches purple->green at 100%
 * - Hamburger menu with Import/Export + Donate links
 * - Optional Supabase auth + sync (Google OAuth or Email Magic Link)
 */

export default function TVShowTracker() {
  // ---------- Persistence (local) ----------
  const [myShows, setMyShows] = useState(() => {
    try {
      const saved = localStorage.getItem("tvShowTrackerData");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("tvShowTrackerData", JSON.stringify(myShows));
    } catch {
      /* ignore */
    }
  }, [myShows]);

  // ---------- Optional Supabase auth/sync state ----------
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  // Email-magic-link UI
  const [emailInput, setEmailInput] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  // Pull current user's library from Supabase (safe no-op if not configured)
  const pullLibrary = async () => {
    const sp = getSupabase();
    if (!sp) return;

    try {
      const { data: userData } = await sp.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { data, error } = await sp
        .from("tvtracker_library")
        .select("payload")
        .eq("user_id", user.id)
        .single();

      // If table empty for this user, PGRST116 may be returned; just skip
      if (error && error.code !== "PGRST116") {
        console.warn("Supabase pull error:", error);
        return;
      }
      if (data?.payload) setMyShows(data.payload);
    } catch (err) {
      console.warn("Supabase pull skipped:", err);
    }
  };

  // Push library to Supabase on changes (when signed in)
  const pushLibrary = async (payload) => {
    const sp = getSupabase();
    if (!sp) return;

    try {
      const { data: userData } = await sp.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { error } = await sp
        .from("tvtracker_library")
        .upsert({ user_id: user.id, payload }, { onConflict: "user_id" });

      if (error) console.warn("Supabase push error:", error);
    } catch (err) {
      console.warn("Supabase push skipped:", err);
    }
  };

  // When signed in, push on every local change
  useEffect(() => {
    if (!isSignedIn) return;
    pushLibrary(myShows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, myShows]);

  // One-time auth wiring (optional)
  useEffect(() => {
    const sp = getSupabase();
    if (!sp) return; // not configured; skip

    sp.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setIsSignedIn(true);
        setUserEmail(session.user.email || "");
        pullLibrary();
      }
    });

    const { data: sub } = sp.auth.onAuthStateChange((_event, session) => {
      const present = !!session?.user;
      setIsSignedIn(present);
      setUserEmail(present ? session.user.email || "" : "");
      if (present) pullLibrary();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Auth handlers (Google & Email Magic Link) ----------
  const signInWithGoogle = async () => {
    setEmailMsg("");
    const sp = getSupabase();
    if (!sp) return;
    await sp.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const signInWithEmailMagicLink = async () => {
    setEmailMsg("");
    if (!emailInput.trim()) {
      setEmailMsg("Enter an email address.");
      return;
    }
    setEmailSending(true);
    try {
      const sp = getSupabase();
      if (!sp) throw new Error("Auth not configured.");
      const { error } = await sp.auth.signInWithOtp({
        email: emailInput.trim(),
        options: { emailRedirectTo: window.location.origin }, // back to tvtracker.me
      });
      if (error) throw error;
      setEmailMsg("Check your inbox for the sign-in link.");
    } catch (e) {
      setEmailMsg(e.message || "Could not send email.");
    } finally {
      setEmailSending(false);
    }
  };

  const signOut = async () => {
    const sp = getSupabase();
    if (!sp) return;
    await sp.auth.signOut();
    setIsSignedIn(false);
    setUserEmail("");
  };

  // ---------- UI state ----------
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedShows, setSelectedShows] = useState(new Set());

  const [expandedShow, setExpandedShow] = useState(null);
  const [expandedSeason, setExpandedSeason] = useState(null);

  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("added"); // added | title | year | genre

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
          return yb - ya; // newest first
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
      const resp = await fetch(
        `https://api.tvmaze.com/shows/${id}?embed=episodes`
      );
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
    setMyShows((prev) =>
      prev.map((s) => (s.id === id ? { ...s, source: value } : s))
    );
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
                    [season]: rw.seasons[season].map((e) => ({
                      ...e,
                      watched,
                    })),
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

        const nextNum = (show.rewatches?.length || 0) + 2; // 1st is the original
        const clone = {};
        Object.keys(show.seasons).forEach((s) => {
          clone[s] = show.seasons[s].map((e) => ({
            ...e,
            watched: false,
          }));
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
    setMyShows((prev) =>
      prev.map((s) => (s.id === id ? { ...s, currentRewatch: watchNumber } : s))
    );
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
      { wch: 9 },
      { wch: 9 },
      { wch: 11 },
      { wch: 14 },
      { wch: 10 },
    ];
    for (let r = 1; r < rows.length; r++) {
      const cell = XLSX.utils.encode_cell({ r, c: 6 });
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
        const data = JSON.parse(ev.target.result);
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
  }, [myShows, filterStatus, sortBy]);

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
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden z-50">
                {/* Account */}
                <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700">
                  Account
                </div>
                {getSupabase() ? (
                  isSignedIn ? (
                    <div className="px-4 py-3 space-y-2">
                      <div className="text-sm text-slate-300">
                        Signed in as <span className="font-semibold">{userEmail}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => pullLibrary()}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded"
                          title="Fetch your cloud copy"
                        >
                          <Cloud className="w-4 h-4" />
                          Sync from Cloud
                        </button>
                        <button
                          onClick={signOut}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 space-y-3">
                      <button
                        onClick={signInWithGoogle}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                      >
                        <LogIn className="w-4 h-4" />
                        Sign in with Google
                      </button>

                      <div className="text-xs text-slate-400">or use email</div>

                      <input
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="you@email.com"
                        className="w-full px-3 py-2 bg-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                        type="email"
                      />
                      <button
                        onClick={signInWithEmailMagicLink}
                        disabled={emailSending}
                        className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-60"
                      >
                        {emailSending ? "Sending…" : "Send magic link"}
                      </button>
                      {!!emailMsg && (
                        <div className="text-xs text-slate-300">{emailMsg}</div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-300">
                    Cloud auth not configured.
                  </div>
                )}

                {/* Data */}
                <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-700">
                  Data
                </div>

                {/* Import */}
                <label className="flex items-center gap-2 px-4 py-3 hover:bg-slate-700 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Import Data (JSON)</span>
                  <input type="file" accept=".json" onChange={importData} className="hidden" />
                </label>

                {/* Export */}
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

        {/* Subtitle */}
        <p className="text-slate-300 mt-2">
          Never lose track of what you're watching
        </p>
      </header>

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
          <h2 className="text-2xl font-semibold">
            My Shows ({getSortedShows(myShows).length})
          </h2>
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
          {/* ... existing card grid unchanged ... */}
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
                  {/* [Card content unchanged from your version] */}
                  {/* ... */}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* FOOTER */}
      <div className="mt-8 text-center text-sm text-slate-300 bg-slate-800 rounded-lg p-4">
        <p className="mb-1">
          <strong>Your data saves automatically.</strong>
        </p>
        <p>Re-watch completed shows, mark seasons complete, sort your collection.</p>
      </div>
    </div>
  );
}
