import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import TVShowTracker from "./TVShowTracker.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import { getSupabase } from "./lib/supabase";

// CRITICAL: Initialize Supabase BEFORE React/HashRouter renders so detectSessionInUrl
// (or PKCE code exchange) can process any OAuth redirect tokens.
console.log("[AUTH-DEBUG] URL at boot:", window.location.href);
console.log("[AUTH-DEBUG] hash:", window.location.hash);
console.log("[AUTH-DEBUG] search:", window.location.search);

const sp = getSupabase();
if (sp) {
  // PKCE flow: code is in query string
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    console.log("[AUTH-DEBUG] Found PKCE code in query string, exchanging...");
    sp.auth.exchangeCodeForSession(window.location.href).then(({ data, error }) => {
      console.log("[AUTH-DEBUG] Exchange result:", {
        hasSession: !!data?.session,
        email: data?.session?.user?.email,
        error: error?.message,
      });
      // Clean up the URL so the code doesn't persist
      const cleanUrl = window.location.origin + window.location.pathname + "#/app";
      window.history.replaceState({}, "", cleanUrl);
    });
  }
  sp.auth.getSession().then(({ data }) => {
    console.log("[AUTH-DEBUG] Boot getSession:", {
      hasSession: !!data?.session,
      email: data?.session?.user?.email,
    });
  });
}

console.log("TVTracker booting");
createRoot(document.getElementById("root")).render(
  <HashRouter>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<TVShowTracker />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </HashRouter>
);
