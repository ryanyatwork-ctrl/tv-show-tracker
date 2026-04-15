import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Tv, Sparkles, Shield } from "lucide-react";
import { getSupabase } from "../lib/supabase";

const features = [
  { icon: Tv, title: "Track every show", desc: "Unlimited series tracking with season/episode granularity." },
  { icon: Sparkles, title: "Streaming info", desc: "See where every show is streaming, powered by TMDB + TVMaze." },
  { icon: Shield, title: "Yours forever", desc: "Your library syncs across devices and exports to Excel anytime." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const sp = getSupabase();
    if (!sp) return;
    // Give Supabase's detectSessionInUrl a moment to process hash tokens
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
          <Link to="/app" className="text-slate-300 hover:text-white text-sm">Sign in</Link>
          <Link to="/app" className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium">Launch app</Link>
        </nav>
      </header>

      <section className="px-6 py-20 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Never lose track of what you're watching.</h1>
        <p className="text-lg text-slate-300 mb-8">TV Tracker is a clean, fast, cross-device show tracker with live streaming provider info. No ads. No app store. Works on any device.</p>
        <div className="flex gap-3 justify-center">
          <Link to="/app" className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium">Get started free</Link>
          <button onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} className="px-6 py-3 rounded-lg border border-slate-700 hover:bg-slate-900 text-slate-200">See pricing</button>
        </div>
      </section>

      <section className="px-6 py-16 max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <Icon className="text-purple-400 mb-3" size={24} />
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="px-6 py-16 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2">Simple pricing</h2>
        <p className="text-center text-slate-400 mb-10">Start free. Upgrade when you're ready.</p>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-1">Free</h3>
            <div className="text-3xl font-bold mb-4">$0</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Track up to 10 shows</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Streaming provider badges</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Sync across devices</li>
            </ul>
            <Link to="/app" className="block text-center px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200">Start free</Link>
          </div>
          <div className="bg-slate-900/60 border-2 border-purple-500 rounded-2xl p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-3 py-1 rounded-full">Most flexible</div>
            <h3 className="font-semibold text-lg mb-1">Monthly</h3>
            <div className="text-3xl font-bold mb-1">$2.99<span className="text-base font-normal text-slate-400">/mo</span></div>
            <div className="text-xs text-slate-500 mb-4">Cancel anytime</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Unlimited shows</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Everything in Free</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Priority support</li>
            </ul>
            <Link to="/app" className="block text-center px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium">Choose monthly</Link>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full">Save 16%</div>
            <h3 className="font-semibold text-lg mb-1">Yearly</h3>
            <div className="text-3xl font-bold mb-1">$29.99<span className="text-base font-normal text-slate-400">/yr</span></div>
            <div className="text-xs text-slate-500 mb-4">~$2.50/mo, billed yearly</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Unlimited shows</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Everything in Monthly</li>
              <li className="flex gap-2"><Check size={16} className="text-emerald-400 mt-0.5"/>Best value</li>
            </ul>
            <Link to="/app" className="block text-center px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200">Choose yearly</Link>
          </div>
        </div>
      </section>

      <footer className="px-6 py-10 text-center text-slate-500 text-sm border-t border-slate-800/50">
        &copy; {new Date().getFullYear()} Belleville Systems &middot; <a href="mailto:contact@tvtracker.me" className="hover:text-slate-300">contact@tvtracker.me</a>
      </footer>
    </div>
  );
}