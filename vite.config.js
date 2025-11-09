import { defineConfig } from "vite";
export default defineConfig({
  base: "/",
  build: { outDir: "docs" } // Pages will serve from /docs on main
});
