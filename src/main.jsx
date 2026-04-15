import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import TVShowTracker from "./TVShowTracker.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import { getSupabase } from "./lib/supabase";

// CRITICAL: Initialize Supabase BEFORE React/HashRouter renders so detectSessionInUrl
// can process any OAuth hash tokens before HashRouter's catch-all Navigate replaces the hash.
getSupabase();

console.log("TVTracker booting…");
createRoot(document.getElementById("root")).render(
  <HashRouter>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<TVShowTracker />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </HashRouter>
);