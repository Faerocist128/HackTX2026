/*
 * I. Light performance: the engine runs on every slider tick in the browser, so a
 * batch of 10,000 random valid inputs must finish quickly and never throw.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreRefinance } from "@/lib/scoring/engine";
import { arbInput } from "./helpers/arbitraries";

describe("I. performance", () => {
  it("scores 10,000 random valid inputs in under 5 seconds without a crash or NaN", () => {
    const inputs = fc.sample(arbInput, { numRuns: 10_000, seed: 99 });
    const t0 = performance.now();
    let nan = 0;
    for (const i of inputs) {
      const r = scoreRefinance(i);
      if (Number.isNaN(r.odds.score) || Number.isNaN(r.worth.score)) nan++;
    }
    const ms = performance.now() - t0;
    expect(nan).toBe(0);
    expect(ms).toBeLessThan(5_000);
    // About 0.1 ms per call on a laptop; a slider tick has ~16 ms.
    expect(ms / inputs.length).toBeLessThan(16);
  });
});
