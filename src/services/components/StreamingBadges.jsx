import React from "react";

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
};

export default function StreamingBadges({ result, loading = false }) {
  const providers = result?.providers ?? [];
  const fetchedAt = result?.fetched_at;

  if (loading) {
    return (
      <div className="flex flex-wrap gap-1 justify-center mt-1">
        <div className="w-8 h-8 rounded-lg bg-slate-700 animate-pulse" />
        <div className="w-8 h-8 rounded-lg bg-slate-700 animate-pulse" />
      </div>
    );
  }

  // Free first, then subscription. Skip rent/buy in the compact poster view.
  const prioritized = [
    ...providers.filter((p) => p.type === "free"),
    ...providers.filter((p) => p.type === "subscription"),
  ];

  if (!prioritized.length) return null;

  return (
    <div className="w-full mt-1">
      <p className="text-center text-slate-500 mb-1" style={{ fontSize: "9px" }}>
        Watch on
      </p>
      <div className="flex flex-wrap gap-1 justify-center">
        {prioritized.slice(0, 6).map((p) => (
          <div
            key={p.name}
            title={p.name}
            onClick={() => p.link && window.open(p.link, "_blank")}
            style={{ backgroundColor: PLATFORM_COLORS[p.name] ?? "#444444" }}
            className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            {p.logo ? (
              <img
                src={p.logo}
                alt={p.name}
                className="w-6 h-6 object-contain"
                onError={(e) => {
                  e.target.style.display = "none";
                  if (e.target.parentElement) {
                    e.target.parentElement.innerHTML = `<span style="font-size:9px;font-weight:700;color:#fff;">${p.name.substring(0, 2).toUpperCase()}</span>`;
                  }
                }}
              />
            ) : (
              <span style={{ fontSize: "9px" }} className="font-bold text-white">
                {p.name.substring(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        ))}
        {prioritized.length > 6 && (
          <div className="w-8 h-8 rounded-lg bg-slate-600 flex items-center justify-center flex-shrink-0">
            <span style={{ fontSize: "9px" }} className="text-slate-300">
              +{prioritized.length - 6}
            </span>
          </div>
        )}
      </div>
      {fetchedAt && (
        <p className="text-center text-slate-600 mt-1" style={{ fontSize: "8px" }}>
          Updated {new Date(fetchedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}