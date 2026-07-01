import { defineConfig } from "@hey-api/openapi-ts";

// Generates the typed client from the Postcept API contract (openapi.json,
// synced from the postcept-api repo). Run: pnpm --filter @postcept/sdk generate
export default defineConfig({
  input: "./openapi.json",
  output: "./src/client",
  plugins: ["@hey-api/client-fetch"],
});
