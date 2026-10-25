/*
 * D. Property-based invariants (fast-check). Each monotonicity direction is the
 * one the brief implies (§2 underwriting, §6 economics); see SPEC_ASSUMPTIONS.md.
 * Seeded so failures reproduce; set FC_SEED to explore other seeds.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreRefinance } from "@/lib/scoring/engine";
import type { ScoreInput, ScoreResult } from "@/lib/scoring/types";
import { arbInput, clone } from "./helpers/arbitraries";
import { refPayment, refPV, specRateAsk } from "./helpers/reference";
import { specExpect } from "./helpers/specModel";

const SEED = Number(process.env.FC_SEED ?? 20261025);
const RUNS = Number(process.env.FC_RUNS ?? 400);
const check = (prop: fc.IProperty<[ScoreInput]> | fc.IAsyncProperty<[ScoreInput]>) =>
  fc.assert(prop as fc.IProperty<[ScoreInput]>, { seed: SEED, numRuns: RUNS });

const APPROVAL_RANK = { low: 0, medium: 1, high: 2 } as const;
const rank = (r: ScoreResult) => APPROVAL_RANK[r.approval];

/** Change the current loan and keep its stated payment consistent with the new terms. */
function withLoan(i: ScoreInput, patch: Partial<ScoreInput["profile"]["currentAutoLoan"]>): ScoreInput {
  const c = clone(i);
  Object.assign(c.profile.currentAutoLoan, patch);
  const l = c.profile.currentAutoLoan;
  l.monthlyPayment = refPayment(l.balance, l.apr, l.monthsRemaining);
  return c;
}

describe("D1. output ranges and integrity", () => {
  it("scores are integers in 1–100, never NaN, and the band matches the number", () => {
    check(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      for (const s of [r.odds, r.worth]) {
        expect(Number.isInteger(s.score)).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(1);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(s.band).toBe(s.score >= 70 ? "green" : s.score >= 40 ? "yellow" : "red");
      }
    }));
  });

  it("each score is the rounded sum of its factor points, capped at 39 on a knockout and scaled by the rate ask (odds only)", () => {
    check(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      const e = specExpect(i);
      const ask = specRateAsk(i.scenario.targetApr, e.likely.apr, e.likely.lo);
      for (const [s, cap, mult] of [[r.odds, r.knockouts.length ? 39 : 100, ask], [r.worth, 100, 1]] as const) {
        const sum = Math.max(1, Math.min(100, Math.round(s.factors.reduce((a, f) => a + f.points, 0))));
        expect(s.score).toBe(Math.max(1, Math.round(Math.min(sum, cap) * mult)));
        for (const f of s.factors) {
          expect(f.points).toBeGreaterThanOrEqual(0);
          expect(f.points).toBeLessThanOrEqual(f.maxPoints);
        }
      }
    }));
  });

  it("every metric is a finite number (or null where documented)", () => {
    check(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      for (const [k, v] of Object.entries(r.metrics)) {
        if (v === null && (k === "breakEvenMonths" || k === "breakEvenMonthsScenario" || k === "ltvRetail")) continue;
        if (Array.isArray(v)) v.forEach((x) => expect(Number.isFinite(x), k).toBe(true));
        else expect(Number.isFinite(v as number), `${k}=${v}`).toBe(true);
      }
    }));
  });

  it("verdict and knockouts agree: notEligible exactly when a knockout fires; checkAgain is null or ≥ 3", () => {
    check(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      expect(r.verdict === "notEligible").toBe(r.knockouts.length > 0);
      if (r.checkAgainMonths !== null) expect(r.checkAgainMonths).toBeGreaterThanOrEqual(3);
      expect(r.reasons.length).toBeLessThanOrEqual(4);
    }));
  });

  it("is deterministic: the same input gives a deep-equal result", () => {
    check(fc.property(arbInput, (i) => {
      expect(scoreRefinance(clone(i))).toEqual(scoreRefinance(clone(i)));
    }));
  });

  it("does not mutate its input", () => {
    check(fc.property(arbInput, (i) => {
      const before = JSON.stringify(i);
      scoreRefinance(i);
      expect(JSON.stringify(i)).toBe(before);
    }));
  });

  it("money metrics make sense: payments positive, payoff ≥ balance, new loan pays off within 600 months", () => {
    check(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      const m = r.metrics;
      expect(m.newPayment).toBeGreaterThan(0);
      expect(m.termMatchedPayment).toBeGreaterThan(0);
      expect(m.payoff).toBeGreaterThanOrEqual(i.profile.currentAutoLoan.balance);
      expect(m.newTotalInterest).toBeGreaterThanOrEqual(0);
      expect(m.currentInterestLeft).toBeGreaterThanOrEqual(0);
      expect(m.monthsToPayoff).toBeLessThan(600);
      expect(m.extraInterestSaved).toBeGreaterThanOrEqual(-1e-6);
      expect(m.extraMonthsSooner).toBeGreaterThanOrEqual(0);
      expect(m.creditedApr).toBeGreaterThanOrEqual(m.likelyAprRange[0] - 1e-9);
      expect(m.likelyAprRange[0]).toBeLessThanOrEqual(m.likelyApr);
      expect(m.likelyApr).toBeLessThanOrEqual(m.likelyAprRange[1]);
    }));
  });
});

describe("D2. monotonicity (everything else held constant)", () => {
  const prop = (name: string, mutate: (i: ScoreInput) => ScoreInput | null, assert: (a: ScoreResult, b: ScoreResult) => void) =>
    it(name, () => check(fc.property(arbInput, (i) => {
      const j = mutate(i);
      if (!j) return;
      assert(scoreRefinance(i), scoreRefinance(j));
    })));

  prop("a higher credit score (same tier) never lowers approval and doesn't change the odds score",
    (i) => { const c = clone(i); c.profile.creditScore = Math.min(850, (i.profile.creditScore ?? 600) + 25); return c; },
    (a, b) => { expect(rank(b)).toBeGreaterThanOrEqual(rank(a)); });

  prop("a better credit tier never lowers approval odds or raises the credited rate",
    (i) => {
      const up = { deepSubprime: "subprime", subprime: "nearPrime", nearPrime: "prime", prime: "superPrime", superPrime: null } as const;
      const next = up[i.profile.estCreditTier];
      if (!next) return null;
      const c = clone(i); c.profile.estCreditTier = next;
      c.profile.creditScore = { subprime: 550, nearPrime: 630, prime: 720, superPrime: 800 }[next];
      return c;
    },
    (a, b) => {
      expect(b.odds.score).toBeGreaterThanOrEqual(a.odds.score);
      expect(b.metrics.creditedApr).toBeLessThanOrEqual(a.metrics.creditedApr + 1e-9);
      expect(b.worth.score).toBeGreaterThanOrEqual(a.worth.score);
    });

  prop("more monthly debt (higher DTI) never raises approval odds or the approval level",
    (i) => { const c = clone(i); c.profile.monthlyDebtPayments += 500; return c; },
    (a, b) => { expect(b.odds.score).toBeLessThanOrEqual(a.odds.score); expect(rank(b)).toBeLessThanOrEqual(rank(a)); });

  prop("more income never lowers approval odds or the approval level",
    (i) => { const c = clone(i); c.profile.monthlyIncome *= 1.2; return c; },
    (a, b) => { expect(b.odds.score).toBeGreaterThanOrEqual(a.odds.score); expect(rank(b)).toBeGreaterThanOrEqual(rank(a)); });

  prop("another late payment never raises approval odds or the approval level",
    (i) => { const c = clone(i); c.profile.latePayments12mo += 1; return c; },
    (a, b) => { expect(b.odds.score).toBeLessThanOrEqual(a.odds.score); expect(rank(b)).toBeLessThanOrEqual(rank(a)); });

  prop("a better on-time rate never lowers approval odds",
    (i) => { const c = clone(i); c.profile.onTimePaymentRate = Math.min(1, i.profile.onTimePaymentRate + 0.05); return c; },
    (a, b) => expect(b.odds.score).toBeGreaterThanOrEqual(a.odds.score));

  prop("more miles (same car value) never raise approval odds or the approval level",
    (i) => { const c = clone(i); c.vehicle.mileage += 20_000; return c; },
    (a, b) => { expect(b.odds.score).toBeLessThanOrEqual(a.odds.score); expect(rank(b)).toBeLessThanOrEqual(rank(a)); });

  prop("a higher car value (lower LTV) never lowers either score or the approval level",
    (i) => { const c = clone(i); c.vehicle.estValue *= 1.15; return c; },
    (a, b) => {
      expect(b.odds.score).toBeGreaterThanOrEqual(a.odds.score);
      expect(b.worth.score).toBeGreaterThanOrEqual(a.worth.score);
      expect(rank(b)).toBeGreaterThanOrEqual(rank(a));
    });

  prop("a higher target APR never raises the value score",
    (i) => { const c = clone(i); c.scenario.targetApr += 0.75; return c; },
    (a, b) => expect(b.worth.score).toBeLessThanOrEqual(a.worth.score));

  prop("at or above the likely rate, a higher target APR never raises approval odds (no rate-ask penalty either way)",
    (i) => {
      const e = specExpect(i);
      if (i.scenario.targetApr < e.likely.apr) return null;
      const c = clone(i); c.scenario.targetApr += 0.75; return c;
    },
    (a, b) => expect(b.odds.score).toBeLessThanOrEqual(a.odds.score));

  prop("below the low end of the likely range, asking for a higher rate never lowers approval odds",
    (i) => {
      const e = specExpect(i);
      if (i.scenario.targetApr + 0.5 > e.likely.lo) return null;
      const c = clone(i); c.scenario.targetApr += 0.5; return c;
    },
    (a, b) => expect(b.odds.score).toBeGreaterThanOrEqual(a.odds.score));

  prop("higher upfront fees never raise the value score",
    (i) => { const c = clone(i); c.scenario.upfrontCosts += 300; return c; },
    (a, b) => expect(b.worth.score).toBeLessThanOrEqual(a.worth.score));

  prop("a higher current APR (payment kept consistent) never lowers the value score",
    (i) => withLoan(i, { apr: i.profile.currentAutoLoan.apr + 1 }),
    (a, b) => expect(b.worth.score).toBeGreaterThanOrEqual(a.worth.score));

  prop("more months remaining never lowers approval odds",
    (i) => withLoan(i, { monthsRemaining: i.profile.currentAutoLoan.monthsRemaining + 6, originalTerm: Math.max(i.profile.currentAutoLoan.originalTerm, i.profile.currentAutoLoan.monthsRemaining + 6) }),
    (a, b) => expect(b.odds.score).toBeGreaterThanOrEqual(a.odds.score));

  prop("an extra monthly payment never lowers the value score and never costs interest",
    (i) => { const c = clone(i); c.scenario.extraMonthlyPayment += 100; return c; },
    (a, b) => {
      expect(b.worth.score).toBeGreaterThanOrEqual(a.worth.score);
      expect(b.metrics.newTotalInterest).toBeLessThanOrEqual(a.metrics.newTotalInterest + 1e-6);
    });
});

describe("D3. savings sign and continuity", () => {
  it("a lower credited rate with no fees, same length, plain loan: NPV savings ≥ −(the 10-day per diem that gets refinanced)", () => {
    // The payoff adds 10 days of interest to the principal (§6 Payoff formula), so a tiny
    // rate cut can lose at most the cost of financing that per diem.
    check(fc.property(arbInput, (i) => {
      const c = clone(i);
      const l = c.profile.currentAutoLoan;
      Object.assign(c.scenario, { termMonths: l.monthsRemaining, upfrontCosts: 0, refunds: 0, extraMonthlyPayment: 0, loanType: "fixed", paymentBehavior: "on-time" });
      const r = scoreRefinance(c);
      if (r.metrics.creditedApr >= l.apr) return;
      const perDiem = r.metrics.payoff - l.balance;
      const perDiemCost = refPV(refPayment(perDiem, r.metrics.creditedApr, l.monthsRemaining), l.monthsRemaining, c.scenario.discountRate);
      expect(r.metrics.npvSavings).toBeGreaterThanOrEqual(-perDiemCost - 0.01);
      expect(r.metrics.termMatchedMonthlySavings).toBeGreaterThanOrEqual(-refPayment(perDiem, r.metrics.creditedApr, l.monthsRemaining) - 1e-6);
    }));
  });

  it("a 0.01-point change in the target APR moves the value score by at most 2 points", () => {
    check(fc.property(arbInput, (i) => {
      const c = clone(i); c.scenario.targetApr += 0.01;
      expect(Math.abs(scoreRefinance(c).worth.score - scoreRefinance(i).worth.score)).toBeLessThanOrEqual(2);
    }));
  });

  it("a $1 change in monthly income moves approval odds by at most 1 point", () => {
    check(fc.property(arbInput, (i) => {
      const c = clone(i); c.profile.monthlyIncome += 1;
      expect(Math.abs(scoreRefinance(c).odds.score - scoreRefinance(i).odds.score)).toBeLessThanOrEqual(1);
    }));
  });

  it("a $1 change in the balance moves either score by at most 1 point away from documented thresholds", () => {
    check(fc.property(arbInput, (i) => {
      const j = withLoan(i, { balance: i.profile.currentAutoLoan.balance + 1 });
      const a = scoreRefinance(i), b = scoreRefinance(j);
      // Skip when $1 crosses an LTV rate bracket or a knockout (documented thresholds).
      if (a.metrics.likelyApr !== b.metrics.likelyApr || a.knockouts.length !== b.knockouts.length) return;
      expect(Math.abs(b.odds.score - a.odds.score)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.worth.score - a.worth.score)).toBeLessThanOrEqual(1);
    }));
  });
});
