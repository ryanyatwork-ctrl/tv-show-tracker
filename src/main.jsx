import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import TVShowTracker from "./TVShowTracker.jsx";
import LandingPage from "./pages/LandingPage.jsx";

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