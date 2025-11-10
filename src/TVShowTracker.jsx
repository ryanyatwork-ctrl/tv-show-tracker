import React, { useEffect, useState } from "react";
import { Tv, Search, Plus, Trash2, Check } from "lucide-react";

// Helper: safe progress calc
function calcProgress(show) {
  const seasons = show?.seasons ?? {};
  const all = Object.values(seasons);
  const total = all.reduce((s, eps) => s + (eps?.length ?? 0), 0);
  const watched = all.reduce(
    (s, eps) => s + (eps?.filter?.(e => e?.watched)?.length ?? 0),
    0
  );
  const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
  return { total, watched, pct };
}

export default function TVShowTracker() {
  console.log("TVShowTracker render called");

  // Data
  const [myShows, setMyShows] = useState(() => {
    try {
      const saved = localStorage.getItem("tvShowTrackerData");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem("tvShowTrackerData", JSON.stringify(myShows));
    } catch {}
  }, [myShows]);

  // Search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const r = await fetch(
          `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`
        );
        const data = await r.json();
        setResults(data || []);
      } catch (e) {
        console.error("search failed", e);
      } finally {
        setIsSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  const isAdded = id => myShows.some(s => s.id === id);

  async function fetchShowDetails(id) {
    try {
      const r = await fetch(`https://api.tvmaze.com/shows/${id}?embed=episodes`);
      return await r.json();
    } catch (e) {
      console.error("details failed", e);
      return null;
    }
  }

  async function addShow(show) {
    if (isAdded(show.id)) return;

    const details = await fetchShowDetails(show.id);
    if (!details) return;

    const seasons = {};
    const eps = details?._embedded?.episodes ?? [];
    for (const ep of eps) {
      const s = ep?.season ?? 0;
      seasons[s] ||= [];
      seasons[s].push({
        id: ep?.id,
        number: ep?.number,
        name: ep?.name,
        airdate: ep?.airdate,
        watched: false,
      });
    }

    const newShow = {
      id: show.id,
      name: show.name,
      premiered: details?.premiered ?? "",
      image: show?.image?.medium || show?.image?.original || "",
      genres: details?.genres ?? [],
      seasons,
      addedDate: new Date().toISOString(),
      source: "",
    };
    setMyShows(prev => [newShow, ...prev]);
    setQuery("");
    setResults([]);
  }

  function removeShow(id) {
    if (confirm("Remove this show and its progress?")) {
      setMyShows(prev => prev.filter(s => s.id !== id));
    }
  }

  // ----- RENDER -----

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-3">
        <Tv className="w-8 h-8 text-purple-400" />
        <h1 className="text-2xl font-semibold">TV Tracker</h1>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {/* Search */}
        <section className="bg-zinc-900 rounded-lg p-4 mb-6">
          <label className="block text-sm text-zinc-400 mb-2">Add a show</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search TVMaze…"
              className="w-full pl-10 pr-3 py-2 rounded bg-zinc-800 outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {isSearching && (
            <div className="mt-3 text-zinc-400 text-sm">Searching…</div>
          )}

          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-800 max-h-80 overflow-y-auto rounded border border-zinc-800">
              {results.map(r => {
                const s = r?.show ?? {};
                const already = isAdded(s.id);
                return (
                  <li key={s.id} className="p-3 flex items-center gap-3">
                    {s?.image?.medium && (
                      <img
                        src={s.image.medium}
                        alt={s.name}
                        className="w-12 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{s?.name}</div>
                      <div className="text-xs text-zinc-400">
                        {s?.premiered?.slice(0, 4) || "—"}
                      </div>
                    </div>
                    {already ? (
                      <span className="text-xs px-2 py-1 rounded bg-green-700/40 border border-green-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => addShow(s)}
                        className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Library */}
        {myShows.length === 0 ? (
          <section className="bg-zinc-900 rounded-lg p-8 text-center">
            <p className="text-zinc-300">
              No shows yet. Search above and click <b>Add</b>.
            </p>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myShows.map(show => {
              const { pct, total, watched } = calcProgress(show);
              return (
                <article
                  key={show.id}
                  className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800"
                >
                  {show.image && (
                    <img
                      src={show.image}
                      alt={show.name}
                      className="w-full h-40 object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{show.name}</h3>
                        <p className="text-xs text-zinc-400">
                          {show.genres?.join(", ")}
                          {show.premiered && ` • ${show.premiered.slice(0, 4)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => removeShow(show.id)}
                        className="text-red-400 hover:text-red-300"
                        title="Remove"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Progress</span>
                        <span>
                          {watched}/{total} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded">
                        <div
                          className="h-2 bg-purple-600 rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
