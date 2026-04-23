import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "../brain-store/graph",
  server: {
    port: 5174,
  },
});
