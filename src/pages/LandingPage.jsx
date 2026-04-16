import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  Tv,
  Sparkles,
  Shield,
  Plane,
  Search,
  CheckCircle2,
  MonitorSmartphone,
  X,
} from "lucide-react";
import { getSupabase } from "../lib/supabase";

const baseFeatures = [
  {
    icon: Tv,
    title: "Track every show",
    desc: "Keep your place across seasons and episodes without guessing.",
  },
  {
    icon: Sparkles,
    title: "Streaming info",
    desc: "See where shows are available while you track progress.",
  },
  {
    icon: Shield,
    title: "Sync across devices",
    desc: "Your library follows you across screens and exports anytime.",
  },
];

const flightPainPoints = [
  "Watched on a plane with no login, no sync, and no history",
  "Got home and had no idea which episode you were on",
  "Tried to guess and ended up rewatching or skipping ahead",
  "Needed something simpler than notes, screenshots, or memory",
];

const onboardingSteps = [
  {
    key: "search",
    icon: Search,
    title: "Search your show",
    desc: "Find the series you were watching in seconds.",
  },
  {
    key: "episode",
    icon: CheckCircle2,
    title: "Set your episode",
    desc: "Mark where you left off and move on with confidence.",
  },
  {
    key: "sync",
    icon: MonitorSmartphone,
    title: "Keep watching anywhere",
    desc: "Come back later on any device and know exactly where you are.",
  },
];

function DemoModal({ open, onClose, selectedDemo }) {
  const config = useMemo(() => {
    switch (selectedDemo) {
      case "search":
        return {
          title: "Search your show",
          subtitle: "Type a title, see a match, and add it in seconds.",
        };
      case "episode":
        return {
          title: "Set your episode",
          subtitle: "Mark where you left off so you never have to guess again.",
        };
      case "sync":
        return {
          title: "Keep watching anywhere",
          subtitle: "Your progress stays understandable across devices.",
        };
      default:
        return {
          title: "",
          subtitle: "",
        };
    }
  }, [selectedDemo]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
            <div>
              <h3 className="text-2xl font-bold text-white">{config.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{config.subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="Close demo"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6">
            {selectedDemo === "search" && <SearchDemo />}
            {selectedDemo === "episode" && <EpisodeDemo />}
            {selectedDemo === "sync" && <SyncDemo />}
          </div>
        </div>
      </div>
    </>
  );
}

function SearchDemo() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 text-sm font-medium text-slate-300">Quick search demo</div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-600 bg-slate-700/60 px-4 py-3">
          <Search className="text-slate-400" size={18} />
          <div className="text-slate-200 text-sm sm:text-base">
            <span className="inline-block overflow-hidden whitespace-nowrap border-r-2 border-purple-400 animate-[typingSearch_3.5s_steps(14,end)_infinite]">
              The Last of Us
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 animate-[fadeInResult_3.5s_ease-in-out_infinite]">
          <div className="flex items-center gap-4 p-4">
            <div className="h-16 w-12 rounded-md bg-gradient-to-br from-purple-500/40 to-pink-500/30" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">The Last of Us</div>
              <div className="mt-1 text-sm text-slate-400">Drama • Sci-Fi • 2023</div>
              <div className="mt-2 text-xs text-emerald-400">Result found instantly</div>
            </div>
            <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white animate-[pulseButton_2.2s_ease-in-out_infinite]">
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EpisodeDemo() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 text-sm font-medium text-slate-300">Episode tracking demo</div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-semibold text-white">The Last of Us</div>
            <div className="text-sm text-slate-400">Season 1</div>
          </div>
          <div className="rounded-full bg-purple-500/10 px-3 py-1 text-xs text-purple-300">
            In Progress
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-white">Episode 3</div>
              <div className="text-xs text-slate-400">Long, Long Time</div>
            </div>
            <div className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
              Watched
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-purple-500/40 bg-slate-900 px-4 py-3 animate-[episodeGlow_2.8s_ease-in-out_infinite]">
            <div>
              <div className="text-sm font-medium text-white">Episode 4</div>
              <div className="text-xs text-slate-400">Please Hold to My Hand</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-400">Mark watched</div>
              <div className="relative h-6 w-6 rounded-full border border-emerald-400/50 bg-emerald-500/10">
                <Check className="absolute left-1 top-1 text-emerald-400 animate-[checkPop_2.8s_ease-in-out_infinite]" size={14} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-white">Episode 5</div>
              <div className="text-xs text-slate-400">Endure and Survive</div>
            </div>
            <div className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
              Next
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>Season progress</span>
            <span>4 of 9 watched</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-[progressFill_2.8s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncDemo() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 text-sm font-medium text-slate-300">Cross-device demo</div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
            <Tv size={16} className="text-purple-400" />
            Desktop
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="font-semibold text-white">The Bear</div>
            <div className="mt-1 text-sm text-slate-400">Season 2 • Episode 6</div>
            <div className="mt-3 h-2 rounded-full bg-slate-700">
              <div className="h-full w-[68%] rounded-full bg-purple-500 animate-[syncPulse_2.6s_ease-in-out_infinite]" />
            </div>
            <div className="mt-2 text-xs text-emerald-400">Progress saved</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
            <MonitorSmartphone size={16} className="text-purple-400" />
            Phone
          </div>

          <div className="rounded-xl border border-purple-500/40 bg-slate-900 p-4 animate-[deviceGlow_2.6s_ease-in-out_infinite]">
            <div className="font-semibold text-white">The Bear</div>
            <div className="mt-1 text-sm text-slate-400">Season 2 • Episode 6</div>
            <div className="mt-3 h-2 rounded-full bg-slate-700">
              <div className="h-full w-[68%] rounded-full bg-purple-500 animate-[syncPulse_2.6s_ease-in-out_infinite]" />
            </div>
            <div className="mt-2 text-xs text-emerald-400">Same progress here too</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFlight = location.pathname === "/flight";

  const [demoOpen, setDemoOpen] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState("search");

  useEffect(() => {
    const sp = getSupabase();
    if (!sp) return;

    const t = setTimeout(() => {
      sp.auth.getSession().then(({ data }) => {
        if (data?.session) navigate("/app", { replace: true });
      });
    }, 300);

    return () => clearTimeout(t);
  }, [navigate]);

  const openDemo = (key) => {
    setSelectedDemo(key);
    setDemoOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <style>{`
        @keyframes typingSearch {
          0% { width: 0; }
          35% { width: 13ch; }
          70% { width: 13ch; }
          100% { width: 0; }
        }
        @keyframes fadeInResult {
          0%, 18% { opacity: 0; transform: translateY(8px); }
          28%, 80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(8px); }
        }
        @keyframes pulseButton {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(168,85,247,0); }
          50% { transform: scale(1.04); box-shadow: 0 0 20px rgba(168,85,247,0.35); }
        }
        @keyframes episodeGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(168,85,247,0); }
          50% { box-shadow: 0 0 20px rgba(168,85,247,0.25); }
        }
        @keyframes checkPop {
          0%, 15% { opacity: 0; transform: scale(0.5); }
          25%, 80% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes progressFill {
          0%, 15% { width: 18%; }
          30%, 80% { width: 44%; }
          100% { width: 18%; }
        }
        @keyframes syncPulse {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes deviceGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(168,85,247,0); }
          50% { box-shadow: 0 0 24px rgba(168,85,247,0.22); }
        }
      `}</style>

      <DemoModal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        selectedDemo={selectedDemo}
      />

      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/50">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <Tv className="text-purple-400" size={22} />
          TV Tracker
        </div>

        <nav className="flex items-center gap-3">
          <Link to="/app" className="text-slate-300 hover:text-white text-sm">
            Sign in
          </Link>
          <Link
            to="/app"
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
          >
            Launch app
          </Link>
        </nav>
      </header>

      <section className="px-6 pt-20 pb-14 text-center max-w-4xl mx-auto">
        {isFlight ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-200 mb-6">
            <Plane size={16} />
            Built from a real in-flight entertainment problem
          </div>
        ) : null}

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5">
          {isFlight
            ? "Watched a show on a flight and lost your place?"
            : "Never lose your place in a show again."}
        </h1>

        <p className="text-lg sm:text-xl text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
          {isFlight
            ? "My wife watched a series on the in-flight entertainment system. When she got home, we only knew the show title and had no reliable way to figure out which episodes she had watched. That is why TV Tracker exists."
            : "TV Tracker is a clean, fast way to remember where you left off across devices, households, travel, and real-world viewing habits."}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <Link
            to="/app"
            className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            Start tracking free
          </Link>
          <button
            onClick={() =>
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })
            }
            className="px-6 py-3 rounded-lg border border-slate-700 hover:bg-slate-900 text-slate-200"
          >
            See how it works
          </button>
        </div>

        <p className="text-sm text-slate-400">
          No app store required. Works in the browser. Free plan includes up to 10 tracked shows.
        </p>
      </section>

      {isFlight ? (
        <section className="px-6 py-8 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-2xl font-semibold mb-4 text-center">Sound familiar?</h2>
            <div className="space-y-3 text-slate-300">
              {flightPainPoints.map((item) => (
                <div key={item} className="flex gap-3">
                  <Check className="text-emerald-400 mt-1 flex-shrink-0" size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="how-it-works" className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-3">Get started in under a minute</h2>
        <p className="text-center text-slate-400 mb-10">
          The fastest path from “I think I was on episode 4?” to actually knowing.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {onboardingSteps.map(({ key, icon: Icon, title, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => openDemo(key)}
              className="group bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center transition hover:border-purple-500/40 hover:bg-slate-900/90 hover:-translate-y-1"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 transition group-hover:bg-purple-500/20">
                <Icon className="text-purple-400" size={22} />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              <div className="mt-4 text-xs font-medium text-purple-300 opacity-90">
                Watch quick demo
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="px-6 py-8 max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        {baseFeatures.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <Icon className="text-purple-400 mb-3" size={24} />
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="px-6 py-16 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2">Simple pricing</h2>
        <p className="text-center text-slate-400 mb-10">
          Start free. Upgrade when you actually need more.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-1">Free</h3>
            <div className="text-3xl font-bold mb-4">$0</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Track up to 10 shows
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Streaming provider badges
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Sync across devices
              </li>
            </ul>
            <Link
              to="/app"
              className="block text-center px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200"
            >
              Start free
            </Link>
          </div>

          <div className="bg-slate-900/60 border-2 border-purple-500 rounded-2xl p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-3 py-1 rounded-full">
              Most flexible
            </div>
            <h3 className="font-semibold text-lg mb-1">Monthly</h3>
            <div className="text-3xl font-bold mb-1">
              $2.99<span className="text-base font-normal text-slate-400">/mo</span>
            </div>
            <div className="text-xs text-slate-500 mb-4">Cancel anytime</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Unlimited shows
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Everything in Free
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Priority support
              </li>
            </ul>
            <Link
              to="/app"
              className="block text-center px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium"
            >
              Choose monthly
            </Link>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full">
              Save 16%
            </div>
            <h3 className="font-semibold text-lg mb-1">Yearly</h3>
            <div className="text-3xl font-bold mb-1">
              $29.99<span className="text-base font-normal text-slate-400">/yr</span>
            </div>
            <div className="text-xs text-slate-500 mb-4">~$2.50/mo, billed yearly</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Unlimited shows
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Everything in Monthly
              </li>
              <li className="flex gap-2">
                <Check size={16} className="text-emerald-400 mt-0.5" />
                Best value
              </li>
            </ul>
            <Link
              to="/app"
              className="block text-center px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200"
            >
              Choose yearly
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 pt-6 text-center">
        <Link
          to="/app"
          className="inline-block px-8 py-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
        >
          Start tracking your shows
        </Link>
      </section>

      <footer className="px-6 py-10 text-center text-slate-500 text-sm border-t border-slate-800/50">
        &copy; {new Date().getFullYear()} Belleville Systems &middot;{" "}
        <a href="mailto:contact@tvtracker.me" className="hover:text-slate-300">
          contact@tvtracker.me
        </a>
      </footer>
    </div>
  );
}