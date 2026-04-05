import React, { useState } from "react";
import { X, Tv, Star, Archive, RefreshCcw, RotateCcw, Wifi, Lock, Play } from "lucide-react";

export default function HelpModal({ onClose }) {
  const [open, setOpen] = useState(null);
  const sections = [
    { icon: "📺", title: "Adding Shows", content: "Use the search bar at the top to find any TV show. Click Add to add it to your Library. Shows start in Want to Watch automatically." },
    { icon: "▶️", title: "Tracking Progress", content: "Expand a show to see its seasons and episodes. Check off episodes as you watch them. Your status updates automatically: Want to Watch → In Progress → Completed." },
    { icon: "⭐", title: "Ratings & Sorting (Paid)", content: "Paid users can rate shows 1–5 stars, sort by Year or Genre, and filter by genre. Ratings help power your personalized recommendations." },
    { icon: "📡", title: "Streaming Availability", content: "Each show displays where it is currently available to stream — free platforms like Tubi and Plex, subscriptions like Netflix and Max, and rent/buy options. Tap a badge to go directly to that platform. Data refreshes every 7 days, or tap Refresh on any show for the latest info." },
    { icon: "🔄", title: "Re-watching", content: "Finished a show? Hit Re-watch to start tracking a second viewing while keeping your first watch history intact. Switch between watch sessions using the Viewing selector on each show card." },
    { icon: "📦", title: "Archiving", content: "Archive shows you have finished or paused to keep your Library tidy without losing your progress. Archived shows appear in the Archived tab and can be restored anytime." },
    { icon: "☁️", title: "Sync Across Devices", content: "Sign in with Google or email to sync your Library to the cloud. Your data syncs automatically whenever you make changes. Use Pull in the menu to manually grab the latest from another device." },
    { icon: "🔒", title: "Free vs Paid", content: "Free accounts can track up to 15 shows. Paid accounts unlock unlimited shows, star ratings, genre sorting and filtering, and AI-powered recommendations based on your taste." },
  ];
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} style={{maxHeight:"90vh",overflowY:"auto"}}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 sticky top-0 bg-zinc-900 z-10">
          <div>
            <h2 className="text-lg font-bold text-white">How to Use TV Tracker</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Tap a section to expand</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="divide-y divide-zinc-800">
          {sections.map((s, i) => (
            <div key={i}>
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center gap-3 px-6 py-4 hover:bg-zinc-800/50 transition-colors text-left">
                <span className="text-xl flex-shrink-0">{s.icon}</span>
                <span className="font-semibold text-white flex-1">{s.title}</span>
                <span className="text-zinc-500 text-lg">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div className="px-6 pb-4 text-sm text-zinc-300 leading-relaxed bg-zinc-800/30">{s.content}</div>
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
          <p className="text-xs text-zinc-500">Questions? <a href="mailto:contact@tvtracker.me" className="text-purple-400 hover:text-purple-300">contact@tvtracker.me</a></p>
          <button onClick={onClose} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-800 rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
}