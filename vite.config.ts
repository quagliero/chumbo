import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Separate vendor chunks
          // if (id.includes("node_modules")) {
          //   if (id.includes("react") || id.includes("react-router")) {
          //     return "vendor-react";
          //   }
          //   return "vendor";
          // }
          // Separate players.json into its own chunk
          if (id.includes("/data/players.json")) {
            return "players";
          }
          // Keep other data files in the main chunk
          if (id.includes("/data/") && id.includes(".json")) {
            return "data";
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
});
