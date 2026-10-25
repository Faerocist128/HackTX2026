/*
 * H. Golden regression table. Expected values were computed from the spec model
 * (helpers/specModel.ts = brief + reference math) and spot-checked by hand; the
 * engine was never used to produce them. Hand checks:
 *  - G01 payment: 20,065.75 · 0.00625 / (1 − 1.00625^−48) = 125.411 / 0.258485 = $485.17
 *  - G02 rate floor: 6.29 − 0.25 (LTV ≤ 80%) + 0 (age 3.06) − 0.25 (36 mo) − 1.25 = 4.54%
 *  - G19 term-matched: 9.06 + (8.56 − 10.31) = 7.31%; gap 6.69, NPV $2,380, breakeven 5.57 → well positioned
 */
import { describe, expect, it } from "vitest";
import { scoreRefinance } from "@/lib/scoring/engine";
import { makeInput } from "./helpers/builders";
import { GOLDEN } from "./golden.cases";

type K = "balance" | "months" | "age" | "mileage" | "lates" | "ltv";
interface Expected { approval: string; verdict: string; knockouts: K[]; creditedApr: number; newPayment: number; npv: number; ltv: number; dti: number; pti: number; breakEven: number | null }

const EXPECTED: Record<string, Expected> = {
  G01: { approval: "high", verdict: "possible", knockouts: [], creditedApr: 7.5, newPayment: 485.17, npv: 1452.44, ltv: 0.8026, dti: 0.2106, pti: 0.0606, breakEven: 8.43 },
  G02: { approval: "high", verdict: "possible", knockouts: [], creditedApr: 4.54, newPayment: 596.76, npv: 958.96, ltv: 0.5276, dti: 0.0731, pti: 0.0398, breakEven: 8.92 },
  G03: { approval: "high", verdict: "wellPositioned", knockouts: [], creditedApr: 7.31, newPayment: 483.79, npv: 3162.42, ltv: 0.8033, dti: 0.2105, pti: 0.0605, breakEven: 0 },
  G04: { approval: "high", verdict: "keepCurrentLoan", knockouts: [], creditedApr: 7.5, newPayment: 484.11, npv: -1766.24, ltv: 0.8009, dti: 0.2105, pti: 0.0605, breakEven: null },
  G05: { approval: "high", verdict: "keepCurrentLoan", knockouts: [], creditedApr: 7.31, newPayment: 482.78, npv: -356, ltv: 0.8016, dti: 0.2103, pti: 0.0603, breakEven: null },
  G06: { approval: "medium", verdict: "possible", knockouts: [], creditedApr: 12.43, newPayment: 533.16, npv: 889.01, ltv: 0.8034, dti: 0.2166, pti: 0.0666, breakEven: 12.27 },
  G07: { approval: "low", verdict: "notYet", knockouts: [], creditedApr: 17.6, newPayment: 586.84, npv: 1529.25, ltv: 0.8048, dti: 0.2234, pti: 0.0734, breakEven: 8.09 },
  G08: { approval: "low", verdict: "notYet", knockouts: [], creditedApr: 20.12, newPayment: 614.23, npv: 2260.37, ltv: 0.8057, dti: 0.2268, pti: 0.0768, breakEven: 5.82 },
  G09: { approval: "high", verdict: "notEligible", knockouts: ["balance"], creditedApr: 7.5, newPayment: 109.16, npv: 55.55, ltv: 0.1806, dti: 0.1636, pti: 0.0136, breakEven: 37.48 },
  G10: { approval: "high", verdict: "notEligible", knockouts: ["months"], creditedApr: 7.5, newPayment: 485.17, npv: -3.53, ltv: 0.8026, dti: 0.2106, pti: 0.0606, breakEven: 9.87 },
  G11: { approval: "high", verdict: "notEligible", knockouts: ["age"], creditedApr: 8.31, newPayment: 492.79, npv: 1121.51, ltv: 0.8026, dti: 0.2116, pti: 0.0616, breakEven: 10.33 },
  G12: { approval: "medium", verdict: "notEligible", knockouts: ["mileage"], creditedApr: 7.5, newPayment: 485.17, npv: 1452.44, ltv: 0.8026, dti: 0.2106, pti: 0.0606, breakEven: 8.43 },
  G13: { approval: "low", verdict: "notEligible", knockouts: ["lates"], creditedApr: 7.5, newPayment: 485.17, npv: 1452.44, ltv: 0.8026, dti: 0.2106, pti: 0.0606, breakEven: 8.43 },
  G14: { approval: "low", verdict: "notEligible", knockouts: ["ltv"], creditedApr: 9.31, newPayment: 502.3, npv: 708.68, ltv: 1.3558, dti: 0.2128, pti: 0.0628, breakEven: 14.36 },
  G15: { approval: "medium", verdict: "possible", knockouts: [], creditedApr: 7.31, newPayment: 483.65, npv: 2380.21, ltv: 0.8031, dti: 0.2105, pti: 0.0605, breakEven: 5.57 },
  G16: { approval: "medium", verdict: "possible", knockouts: [], creditedApr: 7.31, newPayment: 483.65, npv: 2380.21, ltv: 0.8031, dti: 0.4806, pti: 0.0806, breakEven: 5.57 },
  G17: { approval: "medium", verdict: "possible", knockouts: [], creditedApr: 7.31, newPayment: 483.65, npv: 2380.21, ltv: 0.8031, dti: 0.2902, pti: 0.1791, breakEven: 5.57 },
  G18: { approval: "high", verdict: "possible", knockouts: [], creditedApr: 9.06, newPayment: 500.18, npv: 1662.55, ltv: 0.8031, dti: 0.2125, pti: 0.0625, breakEven: 7.55 },
  G19: { approval: "high", verdict: "wellPositioned", knockouts: [], creditedApr: 9.06, newPayment: 323.63, npv: 2380.21, ltv: 0.8031, dti: 0.1905, pti: 0.0405, breakEven: 5.57 },
  G20: { approval: "high", verdict: "keepCurrentLoan", knockouts: [], creditedApr: 7.5, newPayment: 483.58, npv: -3255.49, ltv: 0.8, dti: 0.2104, pti: 0.0604, breakEven: null },
};

const KO: Record<K, RegExp> = { balance: /balance/i, months: /months are left/i, age: /years old/i, mileage: /miles/i, lates: /late/i, ltv: /trade-in value/i };

describe("H. golden scenarios", () => {
  it("has 20 cases, each with an expectation and a reason", () => {
    expect(GOLDEN).toHaveLength(20);
    for (const g of GOLDEN) { expect(EXPECTED[g.id]).toBeDefined(); expect(g.why.length).toBeGreaterThan(10); }
  });

  describe.each(GOLDEN)("$id: $why", ({ id, o }) => {
    const e = EXPECTED[id];
    const r = scoreRefinance(makeInput(o));
    it(`approval ${e.approval}, verdict ${e.verdict}`, () => {
      expect(r.approval).toBe(e.approval);
      expect(r.verdict).toBe(e.verdict);
    });
    it(`knockouts: [${e.knockouts.join(", ")}]`, () => {
      expect(r.knockouts).toHaveLength(e.knockouts.length);
      e.knockouts.forEach((k) => expect(r.knockouts.some((s) => KO[k].test(s))).toBe(true));
    });
    it(`credited APR ${e.creditedApr}%, new payment $${e.newPayment}, NPV savings $${e.npv} (±$0.01)`, () => {
      expect(r.metrics.creditedApr).toBeCloseTo(e.creditedApr, 2);
      expect(Math.abs(r.metrics.newPayment - e.newPayment)).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(Math.abs(r.metrics.npvSavings - e.npv)).toBeLessThanOrEqual(0.01);
    });
    it(`LTV ${e.ltv}, DTI ${e.dti}, PTI ${e.pti}, breakeven ${e.breakEven}`, () => {
      expect(r.metrics.ltv).toBeCloseTo(e.ltv, 4);
      expect(r.metrics.dti).toBeCloseTo(e.dti, 4);
      expect(r.metrics.pti).toBeCloseTo(e.pti, 4);
      if (e.breakEven === null) expect(r.metrics.breakEvenMonths).toBeNull();
      else expect(r.metrics.breakEvenMonths!).toBeCloseTo(e.breakEven, 2);
    });
  });

  it("G02 factor points = 100 by hand: 22 + 22 + 16 + 14 + 10 + 8 + 8 (every factor at full credit)", () => {
    const r = scoreRefinance(makeInput(GOLDEN[1].o));
    expect(r.odds.factors.reduce((s, f) => s + f.points, 0)).toBeCloseTo(100, 6);
  });

  it("G02 asks for 0%, 4.54 points under the likely low end: odds = round(100 × 0.85·e^(−4.54/2)) = round(8.78) = 9", () => {
    expect(scoreRefinance(makeInput(GOLDEN[1].o)).odds.score).toBe(9);
  });

  it("G02 asking for the likely rate (5.79%) instead keeps approval odds at 100", () => {
    const o = GOLDEN[1].o;
    expect(scoreRefinance(makeInput({ ...o, scenario: { ...o.scenario, targetApr: 5.79 } })).odds.score).toBe(100);
  });

  it("G03 value score = 98 by hand: 25 + 25 + 20 + 10 + 7.7 (payment −13.1%) + 10 = 97.7", () => {
    const r = scoreRefinance(makeInput(GOLDEN[2].o));
    expect(r.worth.factors.find((f) => f.key === "paymentFit")!.points).toBeCloseTo(7.7, 1);
    expect(r.worth.score).toBe(98);
  });
});
