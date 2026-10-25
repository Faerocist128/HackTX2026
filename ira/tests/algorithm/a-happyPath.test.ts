/*
 * A. Representative borrowers across every credit tier.
 * Expected values come from helpers/specModel.ts (the brief rebuilt with the
 * reference math), never from the engine's own output.
 */
import { describe, expect, it } from "vitest";
import { scoreRefinance } from "@/lib/scoring/engine";
import { makeInput, TIER_SCORE, TIERS } from "./helpers/builders";
import { specExpect } from "./helpers/specModel";
import { refPayment } from "./helpers/reference";

const MONEY = 0.01;

/** Realistic current loans for each tier (rates near Experian Q2 2026 averages plus dealer markup). */
const TYPICAL: Record<(typeof TIERS)[number], { apr: number; months: number; balance: number; income: number; debts: number }> = {
  deepSubprime: { apr: 23.5, months: 60, balance: 17_000, income: 3_800, debts: 1_100 },
  subprime: { apr: 20.9, months: 54, balance: 19_000, income: 4_600, debts: 1_300 },
  nearPrime: { apr: 15.5, months: 48, balance: 21_000, income: 5_800, debts: 1_500 },
  prime: { apr: 11.9, months: 42, balance: 22_000, income: 7_500, debts: 1_800 },
  superPrime: { apr: 8.9, months: 36, balance: 24_000, income: 11_000, debts: 2_000 },
};

describe("A. typical borrower in each credit tier", () => {
  describe.each(TIERS)("%s borrower", (tier) => {
    const t = TYPICAL[tier];
    const input = makeInput({
      profile: { estCreditTier: tier, creditScore: TIER_SCORE[tier], monthlyIncome: t.income, monthlyDebtPayments: t.debts },
      loan: { apr: t.apr, monthsRemaining: t.months, balance: t.balance, originalTerm: 72 },
      vehicle: { estValue: t.balance * 1.15 },
      scenario: { termMonths: t.months, targetApr: 0 }, // target 0 → credited at the low end of the likely range
    });
    const r = scoreRefinance(input);
    const e = specExpect(input);

    it("credits the low end of the brief's likely-rate range when the target is below it", () => {
      expect(r.metrics.likelyApr).toBeCloseTo(e.likely.apr, 2);
      expect(r.metrics.likelyAprRange[0]).toBeCloseTo(e.likely.lo, 2);
      expect(r.metrics.likelyAprRange[1]).toBeCloseTo(e.likely.hi, 2);
      expect(r.metrics.creditedApr).toBeCloseTo(e.credited, 6);
    });

    it("computes the new payment, payoff and term-matched payment with the §6 formulas (±$0.01)", () => {
      expect(Math.abs(r.metrics.payoff - e.payoff)).toBeLessThan(MONEY);
      expect(Math.abs(r.metrics.newPayment - e.newPayment)).toBeLessThan(MONEY);
      expect(Math.abs(r.metrics.termMatchedPayment - e.aTM)).toBeLessThan(MONEY);
    });

    it("matches the brief's NPV savings for a plain refinance (±$0.01)", () => {
      expect(Math.abs(r.metrics.npvSavings - e.npvBrief)).toBeLessThan(MONEY);
    });

    it("applies the S2 approval rules and the S5 verdict", () => {
      expect(r.approval).toBe(e.approval);
      expect(r.verdict).toBe(e.verdict);
      expect(r.knockouts).toHaveLength(0);
    });

    it("returns scores in 1–100 whose band matches the number", () => {
      for (const s of [r.odds, r.worth]) {
        expect(Number.isInteger(s.score)).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(1);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(s.band).toBe(s.score >= 70 ? "green" : s.score >= 40 ? "yellow" : "red");
      }
    });

    it("reports PTI and DTI with the new payment, as the brief defines them", () => {
      expect(r.metrics.pti).toBeCloseTo(e.pti, 10);
      expect(r.metrics.dti).toBeCloseTo(e.dti, 10);
    });
  });

  it("better tiers get lower credited rates and higher approval odds (same loan otherwise)", () => {
    const results = TIERS.map((tier) =>
      scoreRefinance(makeInput({ profile: { estCreditTier: tier, creditScore: TIER_SCORE[tier] }, scenario: { targetApr: 0 } })),
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i].metrics.creditedApr).toBeLessThan(results[i - 1].metrics.creditedApr);
      expect(results[i].odds.score).toBeGreaterThanOrEqual(results[i - 1].odds.score);
      expect(results[i].worth.score).toBeGreaterThanOrEqual(results[i - 1].worth.score);
    }
  });

  it("a strong prime borrower with a big rate gap is 'well positioned' (all S5 conditions met)", () => {
    // 15% → about 7.3%: gap ≥ 1, NPV well over $500, breakeven ≈ 350 / ~$70 ≈ 5 months, approval high.
    const input = makeInput({ loan: { apr: 15 }, scenario: { targetApr: 7.31, upfrontCosts: 350 } });
    const e = specExpect(input);
    expect(e.verdict).toBe("wellPositioned"); // guard: the scenario really meets S5
    expect(scoreRefinance(input).verdict).toBe("wellPositioned");
  });

  it("a borrower already at a good rate is told to keep the loan", () => {
    const input = makeInput({ loan: { apr: 7.4 }, scenario: { targetApr: 7.31 } });
    expect(scoreRefinance(input).verdict).toBe("keepCurrentLoan");
  });

  it("the current-loan metrics reflect the stated loan", () => {
    const input = makeInput();
    const r = scoreRefinance(input);
    expect(r.metrics.currentPayment).toBeCloseTo(refPayment(20_000, 12, 48), 8);
    expect(r.metrics.currentMonthsLeft).toBe(48);
  });
});
