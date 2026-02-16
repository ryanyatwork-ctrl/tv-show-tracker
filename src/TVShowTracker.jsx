@'
import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "tvtracker_shows_v1";

// Ignore leading articles for sort/group
function normalizeTitleForSort(title) {
  if (!title) return "";
  return title.trim().replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

function alphaGroupKey(title) {
  const normalized = normalizeTitleForSort(title);
  const first = (normalized[0] || "").toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const DEFAULT_GENRES = [
  "Action","Adventure","Animation","Comedy","Crime","Documentary","Drama","Family","Fantasy",
  "History","Horror","Mystery","Reality","Romance","Sci-Fi","Thriller","War","Western"
];

export default function TVShowTracker() {
  const [shows, setShows] = useState([]);
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("All");
  const [sortMode, setSortMode] = useState("Title"); // Title | Genre
  const [newTitle, setNewTitle] = useState("");
  const [newGenre, setNewGenre] = useState("");

  const sectionRefs = useRef({});

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.shows) ? parsed.shows : []);
      setShows(arr);
    } catch {
      // ignore
    }
  }, []);

  // save
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shows));
    } catch {
      // ignore
    }
  }, [shows]);

  const allGenres = useMemo(() => {
    const s = new Set(DEFAULT_GENRES);
    for (const sh of shows) {
      const g = (sh?.genre || "").toString().trim();
      if (g) s.add(g);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [shows]);

  const visibleShows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = shows.filter((s) => {
      const title = (s?.title || "").toString();
      const genre = (s?.genre || "").toString();

      const matchesQuery =
        !q ||
        title.toLowerCase().includes(q) ||
        normalizeTitleForSort(title).includes(q) ||
        genre.toLowerCase().includes(q);

      const matchesGenre =
        genreFilter === "All" || genre.trim().toLowerCase() === genreFilter.toLowerCase();

      return matchesQuery && matchesGenre;
    });

    return [...filtered].sort((a, b) => {
      const aTitle = (a?.title || "").toString();
      const bTitle = (b?.title || "").toString();
      const aGenre = (a?.genre || "").toString();
      const bGenre = (b?.genre || "").toString();

      if (sortMode === "Genre") {
        const g = aGenre.localeCompare(bGenre, undefined, { sensitivity: "base" });
        if (g !== 0) return g;
      }

      return normalizeTitleForSort(aTitle).localeCompare(
        normalizeTitleForSort(bTitle),
        undefined,
        { sensitivity: "base" }
      );
    });
  }, [shows, query, genreFilter, sortMode]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of visibleShows) {
      const k = alphaGroupKey(s?.title || "");
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    const keys = [
      ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
      "#",
    ].filter((k) => map.has(k));
    return { map, keys };
  }, [visibleShows]);

  const alphaIndex = useMemo(() => {
    const present = new Set();
    for (const s of visibleShows) present.add(alphaGroupKey(s?.title || ""));
    const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    letters.push("#");
    return letters.map((l) => ({ letter: l, enabled: present.has(l) }));
  }, [visibleShows]);

  const jumpToLetter = (letter) => {
    const el = sectionRefs.current[letter];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addShow = () => {
    const title = newTitle.trim();
    if (!title) return;

    const genre = newGenre.trim();
    const now = Date.now();

    setShows((prev) => [
      { id: uid(), title, genre, createdAt: now, updatedAt: now },
      ...prev,
    ]);

    setNewTitle("");
    setNewGenre("");
  };

  const removeShow = (id) => setShows((prev) => prev.filter((s) => s?.id !== id));

  const styles = {
    page: { maxWidth: 1100, margin: "0 auto", padding: "20px 16px" },
    card: { border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14, background: "#fff" },
    controls: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
    input: { padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)", minWidth: 220 },
    select: { padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" },
    btn: { padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)", background: "#f7f7f7", cursor: "pointer" },
    btnPrimary: { padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)", background: "#111", color: "#fff", cursor: "pointer" },
    alphaBar: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
    alphaBtn: (enabled) => ({
      padding: "8px 10px",
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.18)",
      background: enabled ? "#fff" : "#f2f2f2",
      cursor: enabled ? "pointer" : "not-allowed",
      opacity: enabled ? 1 : 0.5,
      fontWeight: 700,
      minWidth: 34,
      textAlign: "center",
    }),
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginTop: 12 },
    sectionHeader: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 18 },
    badge: { width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, background: "#fafafa" },
    title: { fontSize: 16, fontWeight: 800, margin: 0 },
    muted: { opacity: 0.75, fontSize: 13, marginTop: 6 },
    pill: { display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, background: "#f1f1f1", border: "1px solid rgba(0,0,0,0.10)", fontSize: 12, fontWeight: 700 },
  };

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>TV Tracker</h1>

        <div style={styles.controls}>
          <input style={styles.input} placeholder="Search (title or genre)…" value={query} onChange={(e) => setQuery(e.target.value)} />

          <select style={styles.select} value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
            <option value="All">All genres</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>

          <select style={styles.select} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="Title">Sort: Title</option>
            <option value="Genre">Sort: Genre</option>
          </select>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 14 }}>
        <div style={styles.controls}>
          <input
            style={styles.input}
            placeholder="Add a show title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addShow(); }}
          />

          <select style={styles.select} value={newGenre} onChange={(e) => setNewGenre(e.target.value)}>
            <option value="">Genre (optional)</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>

          <button style={styles.btnPrimary} onClick={addShow}>Add</button>
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={styles.muted}>
            {visibleShows.length} show{visibleShows.length === 1 ? "" : "s"} shown{genreFilter !== "All" ? ` • filtered to ${genreFilter}` : ""}
          </div>

          <div style={styles.alphaBar} aria-label="Alphabet jump">
            {alphaIndex.map(({ letter, enabled }) => (
              <button
                key={letter}
                style={styles.alphaBtn(enabled)}
                onClick={() => enabled && jumpToLetter(letter)}
                disabled={!enabled}
                title={enabled ? `Jump to ${letter}` : `No shows under ${letter}`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {grouped.keys.length === 0 ? (
        <div style={{ ...styles.card, marginTop: 14 }}>
          <div style={{ fontWeight: 800 }}>No shows match your filters.</div>
          <div style={styles.muted}>Clear search or set genre back to “All”.</div>
        </div>
      ) : (
        grouped.keys.map((letter) => {
          const list = grouped.map.get(letter) || [];
          return (
            <div
              key={letter}
              ref={(el) => { sectionRefs.current[letter] = el; }}
              style={{ marginTop: 16 }}
            >
              <div style={styles.sectionHeader}>
                <div style={styles.badge}>{letter}</div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{letter === "#" ? "Other" : letter}</div>
                <div style={styles.muted}>({list.length})</div>
              </div>

              <div style={styles.grid}>
                {list.map((s) => {
                  const id = s?.id;
                  const title = (s?.title || "").toString();
                  const genre = (s?.genre || "").toString();

                  return (
                    <div key={id || title} style={styles.card}>
                      <p style={styles.title}>{title}</p>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={styles.pill}>{genre ? genre : "No genre"}</span>
                        {id && <button style={styles.btn} onClick={() => removeShow(id)}>Remove</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
'@ | Set-Content -Encoding UTF8 .\src\TVShowTracker.jsx
