/*
 * S. Do the outputs make sense together? Cross-output consistency, magnitude
 * sanity, and the explanations matching the numbers. Bugs found here were
 * fixed; their tests stay as "BUG-n regression" with ids from TEST_REPORT.md.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreRefinance } from "@/lib/scoring/engine";
import { makeInput, type Overrides } from "./helpers/builders";
import { arbInput, clone } from "./helpers/arbitraries";
import { specExpect } from "./helpers/specModel";
import { refPV, refPayment } from "./helpers/reference";

const SEED = 4_242;
const RUNS = Number(process.env.FC_RUNS ?? 1_000);
const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

describe("S1. magnitudes are believable", () => {
  it("you can't save more interest than you'd pay: lifetime savings ≤ interest left + refunds", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      expect(r.metrics.lifetimeInterestDelta).toBeLessThanOrEqual(r.metrics.currentInterestLeft + i.scenario.refunds + 1e-6);
    }), { seed: SEED, numRuns: RUNS });
  });

  it("NPV savings never exceed the present value of every remaining payment (+ refunds)", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      const n = Math.max(1, i.profile.currentAutoLoan.monthsRemaining);
      expect(r.metrics.npvSavings).toBeLessThanOrEqual(refPV(i.profile.currentAutoLoan.monthlyPayment, n, i.scenario.discountRate) + i.scenario.refunds + 1e-6);
    }), { seed: SEED, numRuns: RUNS });
  });

  it("rates stay in a sane band (0–40%) and the credited rate is never below the likely low end", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const m = scoreRefinance(i).metrics;
      expect(m.likelyAprRange[0]).toBeGreaterThanOrEqual(0);
      expect(m.likelyAprRange[1]).toBeLessThanOrEqual(40);
      expect(m.creditedApr).toBeGreaterThanOrEqual(m.likelyAprRange[0]);
    }), { seed: SEED, numRuns: RUNS });
  });

  it("check-again timing is between 3 months and the longest §3 seasoning window (50 months)", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      if (r.checkAgainMonths !== null) {
        expect(r.checkAgainMonths).toBeGreaterThanOrEqual(3);
        expect(r.checkAgainMonths).toBeLessThanOrEqual(50);
      }
    }), { seed: SEED, numRuns: RUNS });
  });

  it("with a consistent loan and a same-length refi, monthly savings × months − fees ≈ lifetime savings", () => {
    // Both measure the same thing; they may differ only by the refinanced 10-day per diem.
    fc.assert(fc.property(arbInput, (i) => {
      const c = clone(i);
      const n = c.profile.currentAutoLoan.monthsRemaining;
      Object.assign(c.scenario, { termMonths: n, extraMonthlyPayment: 0, paymentBehavior: "on-time", loanType: "fixed", refunds: 0 });
      const r = scoreRefinance(c);
      const perDiem = r.metrics.payoff - c.profile.currentAutoLoan.balance;
      const viaMonthly = r.metrics.monthlySavings * n - c.scenario.upfrontCosts;
      expect(Math.abs(viaMonthly - r.metrics.lifetimeInterestDelta)).toBeLessThanOrEqual(perDiem + 0.01);
    }), { seed: SEED, numRuns: RUNS });
  });
});

describe("S2. the verdict, the approval level and the two dials agree", () => {
  it("'keep current loan' only when the S5 conditions hold (gap < 0.5, NPV < $250, or subsidized)", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      if (r.verdict !== "keepCurrentLoan") return;
      const e = specExpect(i);
      expect(e.gap < 0.5 || e.npvBrief < 250 || !!i.profile.currentAutoLoan.subsidized).toBe(true);
    }), { seed: SEED, numRuns: RUNS });
  });

  it("'well positioned' only with high approval and breakeven ≤ 6 months", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      if (r.verdict !== "wellPositioned") return;
      expect(r.approval).toBe("high");
      expect(r.metrics.breakEvenMonths!).toBeLessThanOrEqual(6);
    }), { seed: SEED, numRuns: RUNS });
  });

  it("BUG-9 regression: a good like-for-like refinance built as a bad loan reads 'possible', not 'refinance now'", () => {
    // 9% → 7.31% term-matched is a good deal, but the loan the user built (84-month
    // variable, paid late) is not: value 33 (red). Before the fix the verdict said "well positioned".
    const r = scoreRefinance(makeInput({ loan: { apr: 9, monthsRemaining: 36 }, scenario: { targetApr: 7.31, upfrontCosts: 0, termMonths: 84, loanType: "variable", paymentBehavior: "late" } }));
    expect(r.worth.band).toBe("red");
    expect(r.verdict).toBe("possible");
    // Only red triggers it: from 10% the same stretched loan scores yellow and stays "well positioned".
    const ten = scoreRefinance(makeInput({ loan: { apr: 10, monthsRemaining: 36 }, scenario: { targetApr: 7.31, upfrontCosts: 0, termMonths: 84, loanType: "variable", paymentBehavior: "late" } }));
    expect(ten.worth.band).toBe("yellow");
    expect(ten.verdict).toBe("wellPositioned");
  });

  it("BUG-9 regression: 'well positioned' never comes with a red value dial (property)", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      if (r.verdict === "wellPositioned") expect(r.worth.band).not.toBe("red");
    }), { seed: SEED, numRuns: RUNS });
  });

  it("high approval never shows a red approval dial (no knockout, and the rate asked for is within the likely range)", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      if (i.scenario.targetApr < r.metrics.likelyAprRange[0]) return;
      if (r.approval === "high" && !r.knockouts.length) expect(r.odds.band).not.toBe("red");
    }), { seed: SEED, numRuns: RUNS });
  });

  it("FINDING: asking for a rate far below the likely range turns the dial red while S2 approval stays 'high'", () => {
    // Main's rate-ask multiplier (config.ts) scales the odds dial; the S2 level and the verdict don't see it.
    const r = scoreRefinance(makeInput({ scenario: { targetApr: 2 } }));
    expect(r.approval).toBe("high");
    expect(r.odds.band).toBe("red");
    expect(r.reasons.some((s) => /lowers your approval odds/.test(s))).toBe(true);
  });

  it("the verdict is computed from the brief's NPV, which includes repaying a cash-out (consistent with §4 and §6)", () => {
    const input = makeInput({ scenario: { loanType: "cash-out", cashOutAmount: 2_000, targetApr: 7.56 } });
    expect(scoreRefinance(input).verdict).toBe(specExpect(input).verdict);
  });

  it("BUG-2 regression: a deep-subprime borrower (score 470, S2 approval 'low') is not shown 'Likely to be approved'", () => {
    // Golden G08 at the likely rate (no rate-ask penalty): approval low, yet the dial reads green.
    const r = scoreRefinance(makeInput({ profile: { estCreditTier: "deepSubprime", creditScore: 470 }, loan: { apr: 26 }, scenario: { targetApr: 21.37 } }));
    expect(r.approval).toBe("low");
    expect(r.odds.band).not.toBe("green");
  });

  it("BUG-2 regression: whenever S2 approval is 'low', the approval-odds dial is not green (property)", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      if (r.approval === "low") expect(r.odds.band).not.toBe("green");
    }), { seed: SEED, numRuns: RUNS });
  });

  it("BUG-8 regression: 'keep your loan' never comes with a green 'worth refinancing' value dial (property)", () => {
    // Found by search: extra-payment savings (which the current loan could get too) push
    // the value score green while the term-matched verdict says keep. See also FINDING A8.
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      // Subsidized loans are forced to "keep" by S5 regardless of numbers; leave them out.
      if (r.verdict === "keepCurrentLoan" && !i.profile.currentAutoLoan.subsidized) expect(r.worth.band).not.toBe("green");
    }), { seed: SEED, numRuns: 20_000 });
  });
});

describe("S3. cash-out is counted once", () => {
  const plain = makeInput({ scenario: { loanType: "cash-out", cashOutAmount: 0, targetApr: 7.56 } });
  const cash = makeInput({ scenario: { loanType: "cash-out", cashOutAmount: 2_000, targetApr: 7.56 } });

  it("with no cash taken out, the cash-out loan's NPV equals the brief's formula", () => {
    expect(Math.abs(scoreRefinance(plain).metrics.npvSavings - specExpect(plain).npvBrief)).toBeLessThan(0.01);
  });

  it("BUG-1 regression: with $2,000 cash out, 'savings after fees' equals the brief's §6 NPV (no second subtraction)", () => {
    // Engine: brief NPV − $2,000. The brief's A_new already includes repaying the $2,000.
    expect(Math.abs(scoreRefinance(cash).metrics.npvSavings - specExpect(cash).npvBrief)).toBeLessThan(0.01);
  });

  it("BUG-1 regression: taking $2,000 out lowers displayed savings by about the cost of repaying it, not twice that", () => {
    const drop = scoreRefinance(plain).metrics.npvSavings - scoreRefinance(cash).metrics.npvSavings;
    const r = scoreRefinance(cash).metrics;
    const repayCost = refPV(refPayment(2_000, r.creditedApr, 48), 48, 5); // PV of repaying $2,000 ≈ $2,090
    expect(drop).toBeLessThan(repayCost * 1.1);
  });

  it("BUG-1 regression: the displayed savings and the verdict now use the same NPV", () => {
    const r = scoreRefinance(cash);
    const note = r.worth.factors.find((f) => f.key === "npvSavings")!.note;
    expect(note).toContain(`$${Math.round(Math.abs(specExpect(cash).npvBrief)).toLocaleString("en-US")}`);
  });
});

describe("S4. check-again timing makes sense", () => {
  const permanent: [string, Overrides][] = [
    ["car older than 10 years", { vehicle: { year: 2013 } }],
    ["over 150,000 miles", { vehicle: { mileage: 160_000 } }],
    ["balance under $5,000", { loan: { balance: 4_000 } }],
    ["fewer than 12 months left", { loan: { monthsRemaining: 6 } }],
  ];
  const strong = { profile: { estCreditTier: "superPrime" as const, creditScore: 800 } };

  it.each(permanent)("BUG-3 regression: %s only gets worse with time, so there is no 'check again' date", (_, o) => {
    const r = scoreRefinance(makeInput({ ...strong, ...o, profile: { ...strong.profile, ...o.profile } }));
    expect(r.verdict).toBe("notEligible");
    expect(r.checkAgainMonths).toBeNull();
  });

  it("time-fixable knockouts do get a date: 2 lates age out in 12 months", () => {
    const r = scoreRefinance(makeInput({ ...strong, profile: { ...strong.profile, latePayments12mo: 2 } }));
    expect(r.checkAgainMonths).toBe(12);
  });

  it("'well positioned' and 'keep current loan' have no check-again date", () => {
    expect(scoreRefinance(makeInput({ loan: { apr: 15 }, scenario: { targetApr: 7.31, upfrontCosts: 0 } })).checkAgainMonths).toBeNull();
    expect(scoreRefinance(makeInput({ loan: { apr: 7.4 } })).checkAgainMonths).toBeNull();
  });

  it("'not yet' uses the §3 seasoning window minus months already paid (subprime: 23 − 12 paid = 11)", () => {
    const r = scoreRefinance(makeInput({ profile: { estCreditTier: "subprime", creditScore: 560 }, loan: { apr: 22, monthsRemaining: 48, originalTerm: 60 }, scenario: { targetApr: 0 } }));
    expect(r.verdict).toBe("notYet");
    expect(r.checkAgainMonths).toBe(11);
  });

  it("an underwater loan's date is the first month the balance drops below the car's value", () => {
    // $20,000 at 12% over 48, car worth $17,000: B_k ≤ 17,000 first at k = 8 (closed form).
    const r = scoreRefinance(makeInput({ profile: { estCreditTier: "superPrime", creditScore: 800, latePayments12mo: 2 }, vehicle: { estValue: 17_000 } }));
    let k = 0, b = 20_000;
    const a = refPayment(20_000, 12, 48);
    while (b > 17_000) { b = b * 1.01 - a; k++; }
    expect(r.checkAgainMonths).toBe(Math.max(3, Math.min(k, 12)));
  });

  it("BUG-7 regression: months remaining > original term no longer pushes the seasoning date out (paid months floor at 0)", () => {
    const ok = scoreRefinance(makeInput({ profile: { estCreditTier: "subprime", creditScore: 560 }, loan: { apr: 22, monthsRemaining: 48, originalTerm: 60 }, scenario: { targetApr: 0 } }));
    const bad = scoreRefinance(makeInput({ profile: { estCreditTier: "subprime", creditScore: 560 }, loan: { apr: 22, monthsRemaining: 48, originalTerm: 36 }, scenario: { targetApr: 0 } }));
    expect(ok.checkAgainMonths).toBe(11); // 23 − 12 paid
    expect(bad.checkAgainMonths).toBe(23); // paid floors at 0, not −12 (was 35)
  });
});

describe("S5. the stated payment and the loan terms agree", () => {
  it.each([
    ["twice the real payment", 2],
    ["missing ($0)", 0],
  ])("BUG-4 regression: a stated payment %s is flagged instead of driving 'savings after fees'", (_, factor) => {
    const real = refPayment(20_000, 12, 48);
    const r = scoreRefinance(makeInput({ loan: { monthlyPayment: real * (factor as number) } }));
    const flagged = r.knockouts.length > 0 || r.reasons.some((s) => /payment/i.test(s) && /match|check|confirm/i.test(s));
    expect(flagged).toBe(true);
  });

  it("BUG-4 regression: an overstated payment is replaced by the amortized one, so the economics match a consistent loan", () => {
    const consistent = scoreRefinance(makeInput());
    const overstated = scoreRefinance(makeInput({ loan: { monthlyPayment: 2 * refPayment(20_000, 12, 48) } }));
    expect(overstated.metrics.currentPayment).toBeCloseTo(refPayment(20_000, 12, 48), 8);
    expect(overstated.metrics.npvSavings).toBeCloseTo(consistent.metrics.npvSavings, 6);
    expect(overstated.verdict).toBe(consistent.verdict);
  });

  it("a stated payment within 10% of the amortized one is used as given (no flag)", () => {
    const real = refPayment(20_000, 12, 48);
    const r = scoreRefinance(makeInput({ loan: { monthlyPayment: real * 1.09 } }));
    expect(r.metrics.currentPayment).toBeCloseTo(real * 1.09, 8);
    expect(r.reasons.some((s) => /doesn't match/.test(s))).toBe(false);
  });
});

describe("S6. explanations match the numbers", () => {
  it("each factor's note states the same dollar figure and direction as the metrics", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      const note = (k: string) => [...r.odds.factors, ...r.worth.factors].find((f) => f.key === k)!.note;
      const m = r.metrics;
      expect(note("npvSavings")).toContain(usd(m.npvSavings));
      expect(note("paymentFit")).toMatch(m.newPayment <= m.currentPayment ? /drop/ : /rise/);
      expect(note("lifetimeCost")).toMatch(m.lifetimeInterestDelta >= 0 ? /less/ : /more/);
      expect(note("dti")).toContain(`${Math.round(m.dti * 100)}%`);
    }), { seed: SEED, numRuns: RUNS });
  });

  it("knockout messages come first in the reasons list, which has at most 4 entries", () => {
    const r = scoreRefinance(makeInput({ loan: { monthsRemaining: 6 }, profile: { latePayments12mo: 3 } }));
    expect(r.reasons.slice(0, r.knockouts.length)).toEqual(r.knockouts);
    expect(r.reasons.length).toBeLessThanOrEqual(4);
  });

  it("factor direction is 'helps' at ≥ 60% of the weight, else 'hurts'", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const r = scoreRefinance(i);
      for (const f of [...r.odds.factors, ...r.worth.factors]) expect(f.direction).toBe(f.points >= f.maxPoints * 0.6 ? "helps" : "hurts");
    }), { seed: SEED, numRuns: 300 });
  });
});

describe("S7. design choices that look odd (documented, need a business decision)", () => {
  it("FINDING A8: an extra payment raises 'refinance value' even when the new rate is no better", () => {
    // The same extra payment on the current loan would save the same interest.
    const same = { loan: { apr: 7.31 }, scenario: { targetApr: 7.31 } };
    const a = scoreRefinance(makeInput(same));
    const b = scoreRefinance(makeInput({ ...same, scenario: { ...same.scenario, extraMonthlyPayment: 600 } }));
    expect(a.verdict).toBe("keepCurrentLoan");
    expect(b.worth.score).toBeGreaterThan(a.worth.score);
  });

  it("FINDING A9: promising to pay early raises the history factor for someone with a late payment, but the S2 cap now limits the dial", () => {
    const base = { profile: { latePayments12mo: 1 } };
    const onTime = scoreRefinance(makeInput(base));
    const early = scoreRefinance(makeInput({ ...base, scenario: { paymentBehavior: "early" } }));
    const hist = (r: typeof onTime) => r.odds.factors.find((f) => f.key === "paymentHistory")!.points;
    expect(hist(early)).toBeGreaterThan(hist(onTime));
    expect(early.approval).toBe("medium"); // the lender's S2 view doesn't move
    expect(early.odds.score).toBeLessThanOrEqual(69); // and since the BUG-2 fix, it caps the dial
  });

  it("FINDING: 'well positioned' (term-matched) often comes with a yellow value score for a stretched loan", () => {
    const r = scoreRefinance(makeInput({ loan: { apr: 12, monthsRemaining: 36 }, scenario: { targetApr: 7.31, upfrontCosts: 0, termMonths: 84, loanType: "variable", paymentBehavior: "late" } }));
    expect(r.verdict).toBe("wellPositioned");
    expect(r.worth.band).toBe("yellow");
  });
});
