import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import TVShowTracker from "./TVShowTracker.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import { getSupabase } from "./lib/supabase";

console.log("[AUTH-DEBUG] URL at boot:", window.location.href);

const sp = getSupabase();

// CRITICAL: capture OAuth tokens from URL BEFORE React + HashRouter mount
// (HashRouter's catch-all Navigate would otherwise strip the hash).
async function bootstrapAuth() {
  if (!sp) return;

  const hash = window.location.hash || "";
  const search = window.location.search || "";

  // 1) Implicit flow — tokens in URL hash
  if (hash.includes("access_token=")) {
    const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const access_token = hashParams.get("access_token");
    const refresh_token = hashParams.get("refresh_token");
    if (access_token && refresh_token) {
      console.log("[AUTH-DEBUG] Hash tokens found, calling setSession...");
      const { data, error } = await sp.auth.setSession({ access_token, refresh_token });
      console.log("[AUTH-DEBUG] setSession result:", {
        hasSession: !!data?.session,
        email: data?.session?.user?.email,
        error: error?.message,
      });
      // Rewrite URL to /#/app with no tokens so HashRouter takes us to the app
      const cleanUrl = window.location.origin + window.location.pathname + "#/app";
      window.history.replaceState({}, "", cleanUrl);
    }
  }

  // 2) PKCE flow — code in query string
  const params = new URLSearchParams(search);
  const code = params.get("code");
  if (code) {
    console.log("[AUTH-DEBUG] PKCE code found, exchanging...");
    const { data, error } = await sp.auth.exchangeCodeForSession(window.location.href);
    console.log("[AUTH-DEBUG] exchangeCodeForSession result:", {
      hasSession: !!data?.session,
      email: data?.session?.user?.email,
      error: error?.message,
    });
    const cleanUrl = window.location.origin + window.location.pathname + "#/app";
    window.history.replaceState({}, "", cleanUrl);
  }

  const { data } = await sp.auth.getSession();
  console.log("[AUTH-DEBUG] Final getSession:", {
    hasSession: !!data?.session,
    email: data?.session?.user?.email,
  });
}

// Render AFTER auth bootstrap resolves (prevents HashRouter from stripping tokens)
bootstrapAuth().finally(() => {
  console.log("TVTracker booting");
  createRoot(document.getElementById("root")).render(
    <HashRouter>
     <Routes>
	<Route path="/" element={<LandingPage />} />
  	<Route path="/flight" element={<LandingPage />} />
  	<Route path="/app" element={<TVShowTracker />} />
 	<Route path="*" element={<Navigate to="/" replace />} />
     </Routes>
    </HashRouter>
  );
});
