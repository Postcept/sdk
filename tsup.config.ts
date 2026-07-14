import { defineConfig } from "tsup";

// The generated client imports its siblings without file extensions, which Node's
// ESM resolver rejects. Bundling sidesteps that and ships one file per format, so
// the package works the same in Node, in a bundler, and on an edge runtime.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
});
