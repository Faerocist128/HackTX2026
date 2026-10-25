/*
 * J. The rest of the algorithm's public surface: scoreDelta (prices plan steps),
 * displayLabel (gauge copy) and the optional retail value. Closes the last branches.
 */
import { describe, expect, it } from "vitest";
import { scoreDelta, scoreRefinance } from "@/lib/scoring/engine";
import { displayLabel } from "@/lib/scoring/bands";
import { makeInput } from "./helpers/builders";

describe("J. remaining exports", () => {
  it("scoreDelta is the score difference between two inputs, on each scale", () => {
    const base = makeInput({ profile: { latePayments12mo: 1 } });
    const fixed = makeInput();
    const d = scoreDelta(base, fixed);
    expect(d.odds).toBe(scoreRefinance(fixed).odds.score - scoreRefinance(base).odds.score);
    expect(d.worth).toBe(scoreRefinance(fixed).worth.score - scoreRefinance(base).worth.score);
    expect(d.odds).toBeGreaterThan(0); // clearing a late payment helps approval
    expect(scoreDelta(base, base)).toEqual({ odds: 0, worth: 0 });
  });

  it("with no asOf date the engine uses today (vehicle age from the real clock)", () => {
    const input = makeInput();
    delete input.asOf;
    const r = scoreRefinance(input);
    expect(Number.isFinite(r.odds.score)).toBe(true);
  });

  it("retail-value LTV is null when there's no retail value, else payoff / retail", () => {
    expect(scoreRefinance(makeInput({ vehicle: { estRetail: undefined } })).metrics.ltvRetail).toBeNull();
    const r = scoreRefinance(makeInput({ vehicle: { estRetail: 29_000 } }));
    expect(r.metrics.ltvRetail).toBeCloseTo(r.metrics.payoff / 29_000, 10);
  });

  it("the value gauge says 'Your current loan already wins' when the verdict is keep; otherwise the band label", () => {
    expect(displayLabel("worth", "red", "keepCurrentLoan")).toBe("Your current loan already wins");
    expect(displayLabel("worth", "green", "possible")).toBe("Worth refinancing");
    expect(displayLabel("odds", "red", "keepCurrentLoan")).toBe("Approval unlikely right now");
    expect(displayLabel("odds", "green", "notYet")).toBe("Likely to be approved");
  });
});
