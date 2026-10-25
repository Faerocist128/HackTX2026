import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Branch coverage of the scoring algorithm (engine + everything it calls).
    coverage: {
      provider: "v8",
      include: ["lib/scoring/engine.ts", "lib/scoring/loanMath.ts", "lib/scoring/rateModel.ts", "lib/scoring/bands.ts", "lib/scoring/config.ts", "lib/scoring/validate.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage/algorithm",
    },
  },
});
