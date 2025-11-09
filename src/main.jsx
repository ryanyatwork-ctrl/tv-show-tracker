import React from "react";
import { createRoot } from "react-dom/client";
import TVShowTracker from "./TVShowTracker.jsx";

console.log("TVTracker booting…");
createRoot(document.getElementById("root")).render(<TVShowTracker />);
