import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite carga WASM en runtime; no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Tailwind v4 vía loader de Turbopack (no hay postcss.config).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
