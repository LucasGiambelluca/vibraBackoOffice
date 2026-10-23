import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite carga WASM en runtime; no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
