/*
 * E. Financial math against the independent reference (helpers/reference.ts) and a
 * cent-rounded servicer schedule. Tolerances are explicit: ±$0.01 against the
 * float reference; ±n × $0.005 (+ last-payment slack) against cent rounding,
 * because the engine never rounds money (assumption S3).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { amortize, balanceAfter, breakEvenMonths, monthlyRate, payment, payoffAmount, presentValue } from "@/lib/scoring/loanMath";
import { scoreRefinance } from "@/lib/scoring/engine";
import { makeInput } from "./helpers/builders";
import {
  refBalanceAfter, refCentSchedule, refPayment, refPayoff, refPV, refTotalInterest,
} from "./helpers/reference";

const CENT = 0.01;
const SEED = 7_331;

describe("E1. loan math primitives match the reference", () => {
  const cases = [
    // [principal, APR %, months] — hand-checkable anchors first
    [42_000, 11.9, 72], // brief §9 example A: $818.93
    [33_000, 9.49, 72], // brief §9 example B: $602.90
    [10_000, 6, 36], [25_000, 3.9, 60], [5_000, 29.99, 24], [80_000, 0.01, 84], [12_345.67, 18.5, 1],
  ] as const;

  it.each(cases)("payment(%d, %f%%, %d) equals P·r/(1−(1+r)^−n) to the cent", (p, apr, n) => {
    expect(Math.abs(payment(p, apr, n) - refPayment(p, apr, n))).toBeLessThan(CENT);
  });

  it("hand-verified anchors: $818.93 (example A) and $602.90 (example B)", () => {
    expect(payment(42_000, 11.9, 72)).toBeCloseTo(818.93, 2);
    expect(payment(33_000, 9.49, 72)).toBeCloseTo(602.9, 2);
    // 10,000 at 6% over 36: r = 0.005, (1.005)^36 = 1.196681 → 10,000·0.005/(1−1/1.196681) = 304.22
    expect(payment(10_000, 6, 36)).toBeCloseTo(304.22, 2);
  });

  it.each([[12_000, 12], [7_200, 72], [100, 3]])("0%% APR: payment is P/n (%d over %d months)", (p, n) => {
    expect(payment(p, 0, n)).toBe(p / n);
    expect(balanceAfter(p, 0, n, Math.floor(n / 2))).toBeCloseTo(p - (p / n) * Math.floor(n / 2), 9);
  });

  it("payment of a 0-month loan is 0 (guard branch)", () => {
    expect(payment(10_000, 5, 0)).toBe(0);
    expect(payment(10_000, 5, -3)).toBe(0);
  });

  it("monthly rate is APR/1200 (percent in, decimal per month out)", () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 15);
  });

  it("balance after k payments matches the closed form; after n payments it is 0", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 100_000 }), fc.integer({ min: 0, max: 3000 }).map((x) => x / 100), fc.integer({ min: 6, max: 96 }),
      (p, apr, n) => {
        const k = Math.floor(n / 3);
        expect(Math.abs(balanceAfter(p, apr, n, k) - refBalanceAfter(p, apr, n, k))).toBeLessThan(CENT);
        expect(balanceAfter(p, apr, n, n)).toBeLessThan(CENT);
      }), { seed: SEED, numRuns: 300 });
  });

  it("payoff adds simple per-diem interest: B + B·APR/100/365·days", () => {
    expect(payoffAmount(20_000, 12)).toBeCloseTo(20_065.753424, 5); // 20,000·0.12·10/365 = 65.75
    expect(payoffAmount(20_000, 12, 30)).toBeCloseTo(refPayoff(20_000, 12, 30), 9);
    expect(payoffAmount(20_000, 0)).toBe(20_000);
  });

  it("present value matches the reference, with the 0% discount case equal to A·n", () => {
    expect(presentValue(500, 48, 0)).toBe(24_000);
    for (const [a, n, d] of [[818.93, 58, 5], [300, 12, 0.01], [1_000, 84, 15]] as const)
      expect(Math.abs(presentValue(a, n, d) - refPV(a, n, d))).toBeLessThan(CENT);
  });

  it("breakeven = fees / monthly savings; null when the payment isn't lower; 0 with no fees", () => {
    expect(breakEvenMonths(350, 500, 450)).toBeCloseTo(7, 12);
    expect(breakEvenMonths(350, 450, 450)).toBeNull();
    expect(breakEvenMonths(350, 400, 450)).toBeNull();
    expect(breakEvenMonths(0, 500, 450)).toBe(0);
  });
});

describe("E2. the amortization schedule reconciles", () => {
  it("total interest equals n·A − P for a level loan (no float drift beyond a cent)", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 100_000 }), fc.integer({ min: 1, max: 3000 }).map((x) => x / 100), fc.integer({ min: 1, max: 96 }),
      (p, apr, n) => {
        const s = amortize(p, apr, n);
        expect(s.months).toBe(n);
        expect(Math.abs(s.totalInterest - refTotalInterest(p, apr, n))).toBeLessThan(CENT);
      }), { seed: SEED, numRuns: 300 });
  });

  it("principal repaid equals the starting balance, and total paid = principal + interest (+ fees)", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1_000, max: 80_000 }), fc.integer({ min: 0, max: 3000 }).map((x) => x / 100), fc.integer({ min: 6, max: 84 }),
      fc.integer({ min: 0, max: 800 }), fc.constantFrom(0, 6.25),
      (p, apr, n, extra, fee) => {
        const s = amortize(p, apr, n, extra, 1, fee);
        const principalRepaid = s.totalPaid - fee * s.months - s.totalInterest;
        expect(Math.abs(principalRepaid - p)).toBeLessThan(CENT);
        expect(s.balances[0]).toBe(p);
        expect(s.balances[s.balances.length - 1]).toBeLessThan(CENT);
        expect(s.balances).toHaveLength(s.months + 1);
        for (let k = 1; k < s.balances.length; k++) expect(s.balances[k]).toBeLessThanOrEqual(s.balances[k - 1] + 1e-9);
      }), { seed: SEED, numRuns: 300 });
  });

  it("0% loan: n equal payments, no interest", () => {
    const s = amortize(12_000, 0, 24);
    expect(s.months).toBe(24);
    expect(s.totalInterest).toBe(0);
    expect(s.totalPaid).toBeCloseTo(12_000, 9);
  });

  it("agrees with a cent-rounded servicer schedule within n × half a cent (plus one payment's rounding)", () => {
    fc.assert(fc.property(
      fc.integer({ min: 2_000, max: 80_000 }), fc.integer({ min: 1, max: 3000 }).map((x) => x / 100), fc.integer({ min: 12, max: 84 }),
      fc.constantFrom(0, 50, 250),
      (p, apr, n, extra) => {
        const eng = amortize(p, apr, n, extra);
        const cents = refCentSchedule(p, apr, n, extra);
        expect(Math.abs(eng.months - cents.months)).toBeLessThanOrEqual(1);
        expect(Math.abs(eng.totalInterest - cents.totalInterest)).toBeLessThanOrEqual(n * 0.005 + 0.01 + (eng.months !== cents.months ? refPayment(p, apr, n) * apr / 1200 : 0));
        expect(cents.totalPrincipal).toBeCloseTo(p, 2);
      }), { seed: SEED, numRuns: 300 });
  });

  it("extra payments shorten the loan and cut interest, matching the cent schedule's month count", () => {
    const base = refCentSchedule(25_000, 9, 60);
    const extra = refCentSchedule(25_000, 9, 60, 200);
    const eng = amortize(25_000, 9, 60, 200);
    expect(extra.months).toBeLessThan(base.months);
    expect(Math.abs(eng.months - extra.months)).toBeLessThanOrEqual(1);
    expect(eng.totalInterest).toBeLessThan(refTotalInterest(25_000, 9, 60));
  });
});

describe("E3. engine money outputs reconcile with the reference", () => {
  const input = makeInput({ loan: { apr: 14, balance: 23_456.78, monthsRemaining: 52, originalTerm: 72 }, scenario: { termMonths: 60, targetApr: 8, upfrontCosts: 299, refunds: 75 } });
  const r = scoreRefinance(input);
  const payoff = refPayoff(23_456.78, 14);

  it("current interest left = n·A − B on the current loan", () => {
    expect(Math.abs(r.metrics.currentInterestLeft - refTotalInterest(23_456.78, 14, 52))).toBeLessThan(CENT);
  });

  it("new total interest = n·A − P on the payoff at the credited rate", () => {
    expect(r.metrics.creditedApr).toBe(8);
    expect(Math.abs(r.metrics.newTotalInterest - refTotalInterest(payoff, 8, 60))).toBeLessThan(CENT);
  });

  it("new fees = upfront − refunds (no late fees when paying on time)", () => {
    expect(r.metrics.newFees).toBeCloseTo(299 - 75, 9);
  });

  it("lifetime delta = current interest − new interest − fees (the identity holds exactly)", () => {
    const m = r.metrics;
    expect(m.lifetimeInterestDelta).toBeCloseTo(m.currentInterestLeft - m.newTotalInterest - m.newFees, 9);
  });

  it("monthly savings = current payment − new payment", () => {
    expect(r.metrics.monthlySavings).toBeCloseTo(r.metrics.currentPayment - r.metrics.newPayment, 9);
    expect(r.metrics.termMatchedMonthlySavings).toBeCloseTo(r.metrics.currentPayment - r.metrics.termMatchedPayment, 9);
  });

  it("late payments add a $25 fee every 4 months, counted as fees, not interest", () => {
    const late = scoreRefinance(makeInput({ scenario: { paymentBehavior: "late", upfrontCosts: 0 } }));
    expect(late.metrics.newFees).toBeCloseTo((25 / 4) * late.metrics.monthsToPayoff, 6);
  });

  it("paying early trims interest by about 2% versus on time", () => {
    const on = scoreRefinance(makeInput()).metrics.newTotalInterest;
    const early = scoreRefinance(makeInput({ scenario: { paymentBehavior: "early" } })).metrics.newTotalInterest;
    expect(early).toBeLessThan(on);
    expect(early / on).toBeGreaterThan(0.95);
  });

  it("brief §9 example A economics: NPV ≈ $2,641 at 5% after $175 fees, breakeven ≈ 3.2 months", () => {
    const aOld = refPayment(42_000, 11.9, 72);
    const bal = refBalanceAfter(42_000, 11.9, 72, 14);
    const aNew = refPayment(35_988, 8.81, 58);
    const npv = refPV(aOld, 58, 5) - refPV(aNew, 58, 5) - 175;
    expect(Math.abs(bal - 35_988)).toBeLessThan(100);
    expect(Math.abs(npv - 2_641)).toBeLessThan(60);
    expect(breakEvenMonths(175, aOld, aNew)!).toBeCloseTo(3.2, 1);
  });
});
