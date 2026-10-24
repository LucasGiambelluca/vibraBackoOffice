import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite carga WASM en runtime; no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
  // PDF de hasta 10 MB (src/lib/limites.ts) + margen para el multipart.
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
  },
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
