import React, { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";

const PLATFORM_COLORS = {
  "Netflix": "#E50914",
  "Amazon Prime Video": "#00A8E0",
  "Amazon Freevee": "#00A8E0",
  "Max": "#002BE7",
  "Disney+": "#113CCF",
  "Hulu": "#1CE783",
  "Apple TV+": "#4a4a4a",
  "Peacock": "#F2B705",
  "Peacock Premium": "#F2B705",
  "Paramount+": "#0064FF",
  "Starz": "#2D2D2D",
  "Showtime": "#CC0000",
  "AMC+": "#292929",
  "BritBox": "#C8102E",
  "Acorn TV": "#2E7D32",
  "Shudder": "#1A1A1A",
  "Discovery+": "#2175D9",
  "Crunchyroll": "#F47521",
  "Mubi": "#1B1B1B",
  "Tubi": "#FA5252",
  "Pluto TV": "#FFC61A",
  "Plex": "#E5A00D",
  "Xumo": "#E8360B",
  "Samsung TV Plus": "#1428A0",
  "LG Channels": "#A50034",
  "Vizio WatchFree+": "#0054A6",
  "Roku Channel": "#6C0DC1",
  "Crackle": "#FF6600",
  "Vudu": "#3399FF",
  "Apple TV": "#4a4a4a",
  "Google Play": "#4285F4",
  "YouTube": "#FF0000",
  "Fubo": "#FA4616",
  "YouTube TV": "#FF0000",
  "Spectrum": "#0061AA",
};

const TYPE_CONFIG = [
  { type: "free", label: "?? Free" },
  { type: "subscription", label: "?? Subscription" },
  { type: "rent", label: "?? Rent" },
  { type: "buy", label: "?? Buy" },
];

export default function ShowDetailModal({ show, streamingResult, onClose }) {
  const [tvmazeData, setTvmazeData] = useState(null);

  useEffect(() => {
    if (!show?.id) return;
    setTvmazeData(null);
    fetch(`https://api.tvmaze.com/shows/${show.id}`)
      .then((r) => r.json())
      .then((data) => setTvmazeData(data))
      .catch(() => {});
  }, [show?.id]);

  if (!show) return null;

  const providers = streamingResult?.providers ?? [];

  const summary = tvmazeData?.summary
    ? tvmazeData.summary.replace(/<[^>]+>/g, "")
    : null;

  const seasons = show.seasons || {};
  const totalEps = Object.values(seasons).reduce((sum, eps) => sum + (eps?.length ?? 0), 0);
  const watchedEps = Object.values(seasons).reduce(
    (sum, eps) => sum + (eps?.filter((e) => e?.watched) ?? []).length,
    0
  );
  const pct = totalEps > 0 ? Math.round((watchedEps / totalEps) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header with blurred poster backdrop */}
        <div className="relative">
          {show.image && (
            <div
              className="absolute inset-0 opacity-20 bg-center bg-cover"
              style={{
                backgroundImage: `url(${show.image})`,
                filter: "blur(12px)",
                transform: "scale(1.1)",
              }}
            />
          )}
          <div className="relative flex gap-4 p-5">
            {show.image && (
              <img
                src={show.image}
                alt={show.name}
                className="w-24 h-36 object-cover rounded-lg shadow-xl flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl font-bold text-white leading-snug pr-2">
                  {show.name}
                </h2>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-1 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-zinc-400 text-sm mt-1">
                {(show.genres || []).join(", ")} • {show.premiered?.slice(0, 4) || ""}
              </p>

              {tvmazeData?.network?.name && (
                <p className="text-zinc-500 text-xs mt-0.5">
                  {tvmazeData.network.name}
                  {tvmazeData.runtime ? ` • ${tvmazeData.runtime} min/ep` : ""}
                </p>
              )}

              <div className="mt-3">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>Your Progress</span>
                  <span>{watchedEps}/{totalEps} eps ({pct}%)</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-purple-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {show.source && (
                <p className="text-xs text-zinc-500 mt-2">
                  Watching on: <span className="text-zinc-300">{show.source}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 border-t border-zinc-800">
          {summary && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                About
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{summary}</p>
            </div>
          )}

          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Available On
              </h3>
              {streamingResult?.fetched_at && (
                <span className="text-zinc-600 text-xs">
                  Updated {new Date(streamingResult.fetched_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {providers.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No streaming info found. Click Refresh on the show card to try again.
              </p>
            ) : (
              <div className="space-y-3">
                {TYPE_CONFIG.map(({ type, label }) => {
                  const group = providers.filter((p) => p.type === type);
                  if (!group.length) return null;
                  return (
                    <div key={type}>
                      <p className="text-xs text-zinc-600 mb-1.5">{label}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.map((p) => (
                          <button
                            key={p.name}
                            onClick={() => p.link && window.open(p.link, "_blank")}
                            title={p.name}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: PLATFORM_COLORS[p.name] ?? "#444444" }}
                          >
                            {p.logo && (
                              <img
                                src={p.logo}
                                alt=""
                                className="w-3.5 h-3.5 object-contain"
                                onError={(e) => (e.target.style.display = "none")}
                              />
                            )}
                            {p.name}
                            {p.link && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-zinc-700 mt-3 italic">
              Streaming availability may change. Tap Refresh for latest info.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
