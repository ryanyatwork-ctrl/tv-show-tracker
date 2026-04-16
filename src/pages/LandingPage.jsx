import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Check, Tv, Sparkles, Shield, Plane, Search, CheckCircle2 } from "lucide-react";
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
    icon: Search,
    title: "Search your show",
    desc: "Find the series you were watching in seconds.",
  },
  {
    icon: CheckCircle2,
    title: "Set your episode",
    desc: "Mark where you left off and move on with confidence.",
  },
  {
    icon: Tv,
    title: "Keep watching anywhere",
    desc: "Come back later on any device and know exactly where you are.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFlight = location.pathname === "/flight";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
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
            ? "My wife watched a series on the in-flight entertainment system. When she got home, we only knew the show title and had no reliable way to figure out which episodes she had watched. We had to guess—and got it wrong. That is why TV Tracker exists."
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

      <section id="how-it-works" className="px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-3">Get started in under a minute</h2>
        <p className="text-center text-slate-400 mb-10">
          The fastest path from “I think I was on episode 4?” to actually knowing.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {onboardingSteps.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Icon className="text-purple-400" size={22} />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
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
        <p className="text-center text-slate-400 mb-10">Start free. Upgrade when you actually need more.</p>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-1">Free</h3>
            <div className="text-3xl font-bold mb-4">$0</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Track up to 10 shows</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Streaming provider badges</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Sync across devices</li>
            </ul>
            <Link to="/app" className="block text-center px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200">
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
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Unlimited shows</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Everything in Free</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Priority support</li>
            </ul>
            <Link to="/app" className="block text-center px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium">
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
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Unlimited shows</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Everything in Monthly</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5" />Best value</li>
            </ul>
            <Link to="/app" className="block text-center px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200">
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