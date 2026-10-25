/*
 * B. Every threshold from SPEC_ASSUMPTIONS.md §3, tested at, just below and just
 * above. Integer thresholds use ±1; continuous ones (DTI, PTI, LTV, rate gap,
 * NPV, breakeven) use ±0.0001 and "at" = threshold ∓ 1e-9 (assumption S1).
 */
import { describe, expect, it } from "vitest";
import { rateAskMultiplier, scoreRefinance } from "@/lib/scoring/engine";
import { bandOf } from "@/lib/scoring/bands";
import { adjAge, adjLtv, adjTerm, estimateApr, tierFromScore } from "@/lib/scoring/rateModel";
import { ScoreInputSchema } from "@/lib/scoring/schema";
import { makeInput, type Overrides } from "./helpers/builders";
import { specExpect, type Knockout } from "./helpers/specModel";
import { asOfForAge, refPayoff, refPV, specRateAsk, specAgeAdj, specLtvAdj, specTermAdj, specTier } from "./helpers/reference";

const KO_TEXT: Record<Knockout, RegExp> = {
  balance: /balance/i, months: /months are left/i, age: /years old/i,
  mileage: /miles/i, lates: /late/i, ltv: /trade-in value/i,
};
const hasKo = (o: Overrides, k: Knockout) => scoreRefinance(makeInput(o)).knockouts.some((s) => KO_TEXT[k].test(s));

// ── S1 knockouts ─────────────────────────────────────────────────────────────
describe("B1. S1 knockouts fire strictly past each limit", () => {
  it.each([
    [4_999.99, true], [5_000, false], [5_000.01, false],
  ])("balance $%d → knockout %s (limit: under $5,000)", (balance, ko) => {
    expect(hasKo({ loan: { balance } }, "balance")).toBe(ko);
  });

  it.each([
    [11, true], [12, false], [13, false],
  ])("%d months remaining → knockout %s (limit: under 12)", (monthsRemaining, ko) => {
    expect(hasKo({ loan: { monthsRemaining } }, "months")).toBe(ko);
  });

  it.each([
    [10 - 1 / 365.25, false], [10, false], [10 + 1 / 365.25, true],
  ])("vehicle exactly %f years old → knockout %s (limit: older than 10)", (years, ko) => {
    expect(hasKo({ vehicle: { year: 2016 }, asOf: asOfForAge(2016, years) }, "age")).toBe(ko);
  });

  it.each([
    [149_999, false], [150_000, false], [150_001, true],
  ])("%d miles → knockout %s (limit: over 150,000)", (mileage, ko) => {
    expect(hasKo({ vehicle: { mileage } }, "mileage")).toBe(ko);
  });

  it.each([
    [0, false], [1, false], [2, true],
  ])("%d lates in 12 months → knockout %s (limit: 2+)", (latePayments12mo, ko) => {
    expect(hasKo({ profile: { latePayments12mo } }, "lates")).toBe(ko);
  });

  const payoff = refPayoff(20_000, 12);
  it.each([
    [1.2999, false], [1.3 - 1e-9, false], [1.3001, true],
  ])("LTV %f → knockout %s (limit: over 130%)", (ltv, ko) => {
    expect(hasKo({ vehicle: { estValue: payoff / ltv } }, "ltv")).toBe(ko);
  });

  it("any knockout makes the verdict notEligible and caps approval odds at 39 (red)", () => {
    const r = scoreRefinance(makeInput({ loan: { monthsRemaining: 11 } }));
    expect(r.verdict).toBe("notEligible");
    expect(r.odds.score).toBeLessThanOrEqual(39);
    expect(r.odds.band).toBe("red");
    expect(r.odds.uncappedScore).toBeGreaterThan(39);
  });
});

// ── S2 approval ──────────────────────────────────────────────────────────────
/** Builds an input whose new payment is known: target 7.5% is above the prime likely low end. */
const NEW_PAY = (() => {
  const e = specExpect(makeInput());
  return e.newPayment;
})();

describe("B2. S2 approval thresholds", () => {
  it.each([
    [660, "medium"], [661, "high"], [662, "high"],
  ])("credit score %d → %s (high needs 661+)", (creditScore, want) => {
    expect(scoreRefinance(makeInput({ profile: { creditScore } })).approval).toBe(want);
  });

  it.each([
    [600, "low"], [601, "medium"], [602, "medium"],
  ])("credit score %d → %s (medium needs 601+)", (creditScore, want) => {
    expect(scoreRefinance(makeInput({ profile: { creditScore, estCreditTier: "nearPrime" }, scenario: { targetApr: 14 } })).approval).toBe(want);
  });

  const income = 8_000;
  it.each([
    [0.45 - 1e-9, "high"], [0.4499, "high"], [0.4501, "medium"],
    [0.5 - 1e-9, "medium"], [0.4999, "medium"], [0.5001, "low"],
  ])("DTI %f → %s (high ≤ 45%, medium ≤ 50%)", (dti, want) => {
    const input = makeInput({ profile: { monthlyIncome: income, monthlyDebtPayments: dti * income - NEW_PAY } });
    expect(scoreRefinance(input).metrics.dti).toBeCloseTo(dti, 8);
    expect(scoreRefinance(input).approval).toBe(want);
  });

  it.each([
    [0.15 - 1e-9, "high"], [0.1499, "high"], [0.1501, "medium"],
    [0.2 - 1e-9, "medium"], [0.1999, "medium"], [0.2001, "low"],
  ])("PTI %f → %s (high ≤ 15%, medium ≤ 20%)", (pti, want) => {
    const input = makeInput({ profile: { monthlyIncome: NEW_PAY / pti, monthlyDebtPayments: 0 } });
    expect(scoreRefinance(input).metrics.pti).toBeCloseTo(pti, 8);
    expect(scoreRefinance(input).approval).toBe(want);
  });

  const payoff = refPayoff(20_000, 12);
  it.each([
    [1.2 - 1e-9, "high"], [1.1999, "high"], [1.2001, "medium"],
    [1.3 - 1e-9, "medium"], [1.2999, "medium"], [1.3001, "low"],
  ])("LTV %f → %s (high ≤ 120%, medium ≤ 130%)", (ltv, want) => {
    const input = makeInput({ vehicle: { estValue: payoff / ltv }, profile: { monthlyIncome: 20_000 } });
    expect(scoreRefinance(input).approval).toBe(want);
  });

  it.each([
    [0, "high"], [1, "medium"], [2, "low"],
  ])("%d lates → %s (high needs 0, medium at most 1)", (latePayments12mo, want) => {
    expect(scoreRefinance(makeInput({ profile: { latePayments12mo } })).approval).toBe(want);
  });

  it.each([
    [99_999, "high"], [100_000, "high"], [100_001, "medium"],
  ])("%d miles → %s (high needs ≤ 100,000)", (mileage, want) => {
    expect(scoreRefinance(makeInput({ vehicle: { mileage } })).approval).toBe(want);
  });

  it("with no credit score, the tier midpoint stands in (prime → 720 → high)", () => {
    expect(scoreRefinance(makeInput({ profile: { creditScore: undefined } })).approval).toBe("high");
    expect(scoreRefinance(makeInput({ profile: { creditScore: undefined, estCreditTier: "nearPrime" } })).approval).toBe("medium");
  });
});

// ── Credit score range and tiers ─────────────────────────────────────────────
describe("B3. credit score tiers and extremes", () => {
  it.each([
    [500, "deepSubprime"], [501, "subprime"], [600, "subprime"], [601, "nearPrime"],
    [660, "nearPrime"], [661, "prime"], [780, "prime"], [781, "superPrime"], [782, "superPrime"],
    [300, "deepSubprime"], [850, "superPrime"],
  ])("score %d → tier %s (VantageScore 4.0 bands)", (score, tier) => {
    expect(tierFromScore(score)).toBe(tier);
    expect(specTier(score)).toBe(tier);
  });

  it("scores 300 and 850 produce finite, in-range results", () => {
    for (const [creditScore, estCreditTier] of [[300, "deepSubprime"], [850, "superPrime"]] as const) {
      const r = scoreRefinance(makeInput({ profile: { creditScore, estCreditTier } }));
      expect(Number.isFinite(r.odds.score) && Number.isFinite(r.worth.score)).toBe(true);
    }
  });

  it("FINDING: the API schema accepts scores outside the 300–850 VantageScore range (299, 851)", () => {
    // Documented, not failed: the schema bounds are 250–900. See TEST_REPORT.md.
    for (const creditScore of [299, 851]) expect(ScoreInputSchema.safeParse(makeInput({ profile: { creditScore } })).success).toBe(true);
  });
});

// ── S3 rate adjustment brackets ──────────────────────────────────────────────
describe("B4. S3 rate adjustment brackets match the brief's table", () => {
  it.each([0.7999, 0.8, 0.8001, 0.9999, 1.0, 1.0001, 1.1499, 1.15, 1.1501, 1.2499, 1.25, 1.2501])("LTV %f", (ltv) => {
    expect(adjLtv(ltv)).toBe(specLtvAdj(ltv));
  });
  it.each([2.999, 3, 3.001, 5.999, 6, 6.001, 7.999, 8, 8.001, 10])("vehicle age %f years", (y) => {
    expect(adjAge(y)).toBe(specAgeAdj(y));
  });
  it.each([47, 48, 49, 71, 72, 73, 84])("new term %d months", (m) => {
    expect(adjTerm(m)).toBe(specTermAdj(m));
  });

  it("market nudge is half the gap, capped at ±1.5 points", () => {
    const base = estimateApr("prime", 0.9, 4, 60, "bank").apr; // 8.81
    expect(estimateApr("prime", 0.9, 4, 60, "bank", { market: { typicalApr: 9.81, note: "" } }).apr).toBeCloseTo(base + 0.5, 6);
    expect(estimateApr("prime", 0.9, 4, 60, "bank", { market: { typicalApr: 20, note: "" } }).apr).toBeCloseTo(base + 1.5, 6);
    expect(estimateApr("prime", 0.9, 4, 60, "bank", { market: { typicalApr: 0, note: "" } }).apr).toBeCloseTo(base - 1.5, 6);
  });

  it("channel and loan type adjustments: credit union −0.5, finance co +0.5; variable −0.75, cash-out +0.25, lease buyout +0.5", () => {
    const at = (c: "creditUnion" | "bank" | "financeCompany", t: "fixed" | "variable" | "cash-out" | "lease-buyout" = "fixed") =>
      estimateApr("prime", 0.9, 4, 60, c, { loanType: t }).apr;
    expect(at("creditUnion")).toBeCloseTo(8.31, 6);
    expect(at("financeCompany")).toBeCloseTo(9.31, 6);
    expect(at("bank", "variable")).toBeCloseTo(8.06, 6);
    expect(at("bank", "cash-out")).toBeCloseTo(9.06, 6);
    expect(at("bank", "lease-buyout")).toBeCloseTo(9.31, 6);
  });

  it("the likely range is credit union − 0.75 to finance company + 0.75, and never negative", () => {
    const e = estimateApr("prime", 0.9, 4, 60, "bank");
    expect(e.range).toEqual([7.56, 10.06]);
    // Lowest possible core: super prime, every negative adjustment, market −1.5, variable −0.75.
    const low = estimateApr("superPrime", 0.5, 1, 36, "creditUnion", { loanType: "variable", market: { typicalApr: 0, note: "" } });
    expect(low.range[0]).toBeGreaterThanOrEqual(0);
  });
});

// ── S5 verdict thresholds ────────────────────────────────────────────────────
describe("B5. S5 verdict thresholds", () => {
  // A big loan so a half-point gap is still worth more than $250 with no fees.
  const big = (apr: number, extra: Overrides = {}) =>
    makeInput({
      loan: { balance: 60_000, apr, monthsRemaining: 72, originalTerm: 84 },
      vehicle: { estValue: 80_000 },
      profile: { monthlyIncome: 30_000 },
      scenario: { termMonths: 72, targetApr: 9, upfrontCosts: 0, ...extra.scenario },
    });
  const tm = specExpect(big(10)).tmApr; // term-matched credited rate the gap is measured against

  it.each([
    [0.4999, "keepCurrentLoan"], [0.5 + 1e-9, "possible"], [0.5001, "possible"],
  ])("rate gap %f → %s (keep below 0.5 points)", (gap, want) => {
    const input = big(tm + gap);
    expect(specExpect(input).tmApr).toBeCloseTo(tm, 9); // the gap moves only the current APR
    expect(scoreRefinance(input).verdict).toBe(want);
  });

  it.each([
    [0.9999, "possible"], [1 + 1e-9, "wellPositioned"], [1.0001, "wellPositioned"],
  ])("rate gap %f → %s (well positioned needs ≥ 1.0)", (gap, want) => {
    expect(scoreRefinance(big(tm + gap)).verdict).toBe(want);
  });

  // NPV threshold: choose fees so the brief's NPV lands exactly on $250.
  const npvNoFees = (() => {
    const i = makeInput({ loan: { apr: 9.2 }, scenario: { targetApr: 7.31, upfrontCosts: 0 } });
    return specExpect(i).npvBrief;
  })();
  it.each([
    [249.99, "keepCurrentLoan"], [250 + 1e-6, "possible"], [250.01, "possible"],
  ])("term-matched NPV $%f → %s (keep under $250)", (npv, want) => {
    const input = makeInput({ loan: { apr: 9.2 }, scenario: { targetApr: 7.31, upfrontCosts: npvNoFees - npv } });
    expect(specExpect(input).npvBrief).toBeCloseTo(npv, 6);
    expect(scoreRefinance(input).verdict).toBe(want);
  });

  /**
   * Hit an exact NPV without touching breakeven: no upfront fees (breakeven 0) and
   * refunds = target − PV of the monthly savings. Needs PV of savings < target.
   */
  const withNpv = (o: Overrides, npv: number) => {
    const base = makeInput({ ...o, scenario: { ...o.scenario, upfrontCosts: 0, refunds: 0 } });
    const pvSavings = specExpect(base).npvBrief;
    if (pvSavings >= npv) throw new Error(`fixture: PV of savings ${pvSavings} already ≥ ${npv}`);
    return makeInput({ ...o, scenario: { ...o.scenario, upfrontCosts: 0, refunds: npv - pvSavings } });
  };

  // $20,000 left, 8.5% → 7.31%: gap ≈ 1.2 points, PV of savings ≈ $460; 2% of payoff ≈ $401.
  const small: Overrides = { loan: { apr: 8.5 }, scenario: { targetApr: 7.31 } };
  it.each([
    [499.99, "possible"], [500 + 1e-6, "wellPositioned"], [500.01, "wellPositioned"],
  ])("NPV $%f on a $20k loan → %s (needs ≥ max($500, 2% of payoff); the $500 floor applies)", (npv, want) => {
    const input = withNpv(small, npv);
    const e = specExpect(input);
    expect(e.npvBrief).toBeCloseTo(npv, 6);
    expect(e.gap).toBeGreaterThanOrEqual(1);
    expect(scoreRefinance(input).verdict).toBe(want);
  });

  // $40,000 left over 36 months, 8.4% → ~7.1%: 2% of payoff ≈ $801 beats the $500 floor.
  const mid: Overrides = {
    loan: { balance: 40_000, apr: 8.4, monthsRemaining: 36, originalTerm: 60 },
    vehicle: { estValue: 52_000 }, profile: { monthlyIncome: 20_000 }, scenario: { termMonths: 36, targetApr: 0 },
  };
  it.each([
    [-0.01, "possible"], [0.01, "wellPositioned"],
  ])("NPV of 2%% of payoff %+f on a $40k loan → %s (the 2%% rule beats the $500 floor)", (offset, want) => {
    const twoPct = 0.02 * refPayoff(40_000, 8.4);
    expect(twoPct).toBeGreaterThan(500);
    const input = withNpv(mid, twoPct + offset);
    expect(specExpect(input).gap).toBeGreaterThanOrEqual(1);
    expect(scoreRefinance(input).verdict).toBe(want);
  });

  it.each([
    [5.9999, "wellPositioned"], [6, "wellPositioned"], [6.0001, "possible"],
  ])("breakeven %f months → %s (well positioned needs ≤ 6)", (months, want) => {
    const base = makeInput({ loan: { apr: 12, balance: 40_000 }, vehicle: { estValue: 50_000 }, profile: { monthlyIncome: 15_000 }, scenario: { targetApr: 7.31, upfrontCosts: 0 } });
    const e0 = specExpect(base);
    const monthly = base.profile.currentAutoLoan.monthlyPayment - e0.aTM;
    const input = makeInput({ loan: { apr: 12, balance: 40_000 }, vehicle: { estValue: 50_000 }, profile: { monthlyIncome: 15_000 }, scenario: { targetApr: 7.31, upfrontCosts: months * monthly } });
    expect(scoreRefinance(input).metrics.breakEvenMonths!).toBeCloseTo(months, 6);
    expect(specExpect(input).verdict).toBe(want); // guard: the spec agrees
    expect(scoreRefinance(input).verdict).toBe(want);
  });

  it("a subsidized loan is always 'keep current loan', even with a large gap", () => {
    expect(scoreRefinance(makeInput({ loan: { apr: 15, subsidized: true }, scenario: { targetApr: 7.31 } })).verdict).toBe("keepCurrentLoan");
  });
});

// ── Bands ────────────────────────────────────────────────────────────────────
describe("B6. display bands", () => {
  it.each([[1, "red"], [39, "red"], [40, "yellow"], [41, "yellow"], [69, "yellow"], [70, "green"], [71, "green"], [100, "green"]] as const)(
    "score %d → %s", (s, band) => expect(bandOf(s)).toBe(band),
  );
});

// ── Months, rates and balances at the edges ──────────────────────────────────
describe("B7. edge values for months, rates and balances", () => {
  it.each([
    [0, true], [1, true], [60, false], [72, false],
  ])("%d months remaining (original term 60) → finite results, months knockout %s", (monthsRemaining, ko) => {
    const r = scoreRefinance(makeInput({ loan: { monthsRemaining, monthlyPayment: monthsRemaining ? undefined : 0 } }));
    expect(Number.isFinite(r.odds.score) && Number.isFinite(r.worth.score)).toBe(true);
    expect(r.knockouts.some((k) => /months are left/.test(k))).toBe(ko);
  });

  it.each([0, 0.01, 7.5, 12, 30, 39.99])("current APR %f%% → finite results; payoff adds 10 days of interest", (apr) => {
    const r = scoreRefinance(makeInput({ loan: { apr } }));
    expect(Number.isFinite(r.worth.score)).toBe(true);
    expect(Math.abs(r.metrics.payoff - refPayoff(20_000, apr))).toBeLessThan(0.01);
  });

  it("a 0% current loan: no interest left, so the advice is to keep it", () => {
    const r = scoreRefinance(makeInput({ loan: { apr: 0 } }));
    expect(r.metrics.currentInterestLeft).toBeCloseTo(0, 8);
    expect(r.metrics.currentPayment).toBeCloseTo(20_000 / 48, 8);
    expect(r.verdict).toBe("keepCurrentLoan");
  });

  it.each([
    ["below", 12, 7.5, true], ["equal", 7.5, 7.5, false], ["above", 6, 7.5, false],
  ])("new rate %s the current rate → rate gap sign and verdict make sense", (_, current, target, refi) => {
    const r = scoreRefinance(makeInput({ loan: { apr: current }, scenario: { targetApr: target } }));
    expect(r.metrics.creditedApr).toBeCloseTo(target, 8);
    expect(r.verdict === "keepCurrentLoan").toBe(!refi);
  });

  it.each([0, 0.01])("balance $%f → balance knockout, no NaN", (balance) => {
    const r = scoreRefinance(makeInput({ loan: { balance, monthlyPayment: 0 } }));
    expect(r.verdict).toBe("notEligible");
    expect(Number.isNaN(r.metrics.npvSavings)).toBe(false);
  });

  it("a $1,000,000 balance on a matching car value stays finite and uses the §6 payment", () => {
    const input = makeInput({ loan: { balance: 1_000_000 }, vehicle: { estValue: 1_300_000 }, profile: { monthlyIncome: 400_000 } });
    const r = scoreRefinance(input);
    const e = specExpect(input);
    expect(Math.abs(r.metrics.newPayment - e.newPayment)).toBeLessThan(0.01);
    expect(Math.abs(r.metrics.npvSavings - e.npvBrief)).toBeLessThan(0.05); // ±5¢ on a $1M loan
  });

  it("the payoff (10 days of per diem) is what gets refinanced", () => {
    const r = scoreRefinance(makeInput());
    expect(r.metrics.payoff).toBeCloseTo(20_000 + (20_000 * 12 * 10) / 36_500, 8);
    expect(refPV(1, 1, 0)).toBe(1); // reference sanity
  });
});

// ── Rate-ask multiplier (main, config.ts ASSUMPTION extending §8 S3) ─────────
describe("B8. rate-ask multiplier on approval odds", () => {
  // Baseline prime: likely bank rate 8.56%, range 7.31–9.81%.
  const likely = { apr: 8.56, range: [7.31, 9.81] as [number, number] };

  it.each([
    [8.57, 1], [8.56, 1], [8.55, null], // at/above the likely rate: no penalty; just below: tiny one
    [7.32, null], [7.31, 0.85], [7.3, null], // at the low end: exactly 0.85
    [5.31, 0.85 * Math.exp(-1)], [2, null], [0, null],
  ])("target %f%% → multiplier matches the spec formula", (target, exact) => {
    const got = rateAskMultiplier(target, likely);
    expect(got).toBeCloseTo(specRateAsk(target, likely.apr, likely.range[0]), 12);
    if (exact !== null) expect(got).toBeCloseTo(exact, 12);
  });

  it("is continuous at both joins and never rises as the ask falls", () => {
    for (const join of [likely.apr, likely.range[0]]) {
      expect(Math.abs(rateAskMultiplier(join - 1e-9, likely) - rateAskMultiplier(join, likely))).toBeLessThan(1e-6);
    }
    let prev = 1;
    for (let t = 12; t >= 0; t -= 0.01) {
      const m = rateAskMultiplier(t, likely);
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      expect(m).toBeGreaterThan(0);
      prev = m;
    }
  });

  it("odds = round(points × multiplier); the reason appears only once the multiplier is under 0.9", () => {
    const at = (targetApr: number) => scoreRefinance(makeInput({ scenario: { targetApr } }));
    expect(at(8.56).odds.rateAskMultiplier).toBeUndefined();
    const low = at(7.31);
    const points = Math.round(low.odds.factors.reduce((s, f) => s + f.points, 0));
    expect(low.odds.score).toBe(Math.max(1, Math.round(points * 0.85)));
    expect(low.odds.uncappedScore).toBe(points);
    expect(low.odds.rateAskMultiplier).toBe(0.85);
    expect(low.reasons.some((s) => /lowers your approval odds/.test(s))).toBe(true);
    expect(at(8.0).reasons.some((s) => /lowers your approval odds/.test(s))).toBe(false); // multiplier ≈ 0.93
  });
});
