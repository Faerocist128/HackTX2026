import { describe, expect, it } from "vitest";
import { scoreRefinance } from "@/lib/scoring/engine";
import { balanceAfter, breakEvenMonths, payment, presentValue } from "@/lib/scoring/loanMath";
import { estimateApr } from "@/lib/scoring/rateModel";
import { defaultScenario, personaVehicle } from "@/lib/scoring/defaults";
import { TOYOTA_DELTA, valueAt } from "@/lib/vehicle/value";
import { fixtureProfile } from "@/lib/nessie/fixtures";
import { PERSONAS } from "@/lib/nessie/personas";
import type { FinancialProfile, Scenario, ScoreInput, Vehicle } from "@/lib/scoring/types";

const ASOF = new Date(2026, 9, 24);

// ── Research §9 worked examples ───────────────────────────────────────────────
describe("loan math matches research §9", () => {
  it("example A: 2025 Tacoma, $42,000 at 11.90% for 72 months", () => {
    expect(payment(42_000, 11.9, 72)).toBeCloseTo(818.93, 2);
    const bal = balanceAfter(42_000, 11.9, 72, 14);
    expect(bal).toBeGreaterThan(35_900);
    expect(bal).toBeLessThan(36_100); // "payoff about $35,988"
    const aNew = payment(35_988, 8.81, 58);
    expect(aNew).toBeCloseTo(764.18, 0);
    const npv = presentValue(818.93, 58, 5) - presentValue(aNew, 58, 5) - 175;
    expect(npv).toBeGreaterThan(2_600);
    expect(npv).toBeLessThan(2_700); // "$2,641 NPV at 5% after $175 fees"
    expect(breakEvenMonths(175, 818.93, aNew)!).toBeCloseTo(3.2, 1);
    expect(payment(35_988, 7.8, 58)).toBeCloseTo(746.77, 0); // credit union
    expect(payment(35_988, 8.81, 72)).toBeCloseTo(645.32, 0); // stretched
  });

  it("example B: 2023 RAV4 Hybrid, 36 months into 72", () => {
    expect(payment(33_000, 9.49, 72)).toBeCloseTo(602.9, 1);
    const bal = balanceAfter(33_000, 9.49, 72, 36);
    expect(Math.abs(bal - 18_824)).toBeLessThan(150);
    const saves = payment(33_000, 9.49, 72) - payment(bal, 7.29, 36);
    expect(Math.abs(saves - 19.17)).toBeLessThan(2);
    const npv = presentValue(602.9, 36, 5) - presentValue(payment(bal, 7.29, 36), 36, 5) - 150;
    expect(Math.abs(npv - 490)).toBeLessThan(60);
  });

  it("Tacoma depreciation δ and trade value (§4)", () => {
    expect(TOYOTA_DELTA.tacoma).toBeCloseTo(0.044, 3);
    const trade = valueAt(46_500, TOYOTA_DELTA.tacoma, 1.2, 15_000, 1, 0.85);
    expect(Math.abs(trade - 37_531)).toBeLessThan(250); // brief: about $37,531
  });

  it("rate estimate for example A is 8.56% (§10 reference calculator)", () => {
    expect(estimateApr("prime", 0.97, 1.2, 58, "bank").apr).toBeCloseTo(8.56, 2);
  });
});

// ── Engine fixtures for examples A and B ──────────────────────────────────────
function profileFrom(over: Partial<FinancialProfile> & { loan: FinancialProfile["currentAutoLoan"] }): FinancialProfile {
  return {
    customerId: "x",
    name: "Test",
    monthlyIncome: 7_500,
    monthlyDebtPayments: 2_100 - over.loan.monthlyPayment,
    dti: 0.28,
    totalBalances: 5_000,
    savingsBalance: 3_000,
    onTimePaymentRate: 1,
    latePayments12mo: 0,
    creditUtilization: 0.1,
    creditScore: 701,
    estCreditTier: "prime",
    evidence: [],
    source: "manual",
    ...over,
    currentAutoLoan: over.loan,
  };
}

const exampleA = (): ScoreInput => {
  const loan = { balance: balanceAfter(42_000, 11.9, 72, 14), apr: 11.9, monthlyPayment: 818.93, monthsRemaining: 58, originalTerm: 72 };
  const vehicle: Vehicle = { year: 2025, make: "Toyota", model: "Tacoma", mileage: 15_000, condition: "good", estValue: 37_629, estRetail: 44_270 };
  const scenario: Scenario = {
    termMonths: 58, targetApr: 8.56, loanType: "fixed", paymentBehavior: "on-time", extraMonthlyPayment: 0,
    channel: "bank", upfrontCosts: 175, refunds: 0, cashOutAmount: 0, discountRate: 5,
  };
  return { profile: profileFrom({ loan }), vehicle, scenario, asOf: ASOF };
};

const exampleB = (): ScoreInput => {
  const bal = balanceAfter(33_000, 9.49, 72, 36);
  const loan = { balance: bal, apr: 9.49, monthlyPayment: 602.9, monthsRemaining: 36, originalTerm: 72 };
  const vehicle: Vehicle = { year: 2023, make: "Toyota", model: "RAV4 Hybrid", mileage: 40_000, condition: "good", estValue: bal / 0.75 };
  const scenario: Scenario = {
    termMonths: 36, targetApr: 7.29, loanType: "fixed", paymentBehavior: "on-time", extraMonthlyPayment: 0,
    channel: "bank", upfrontCosts: 150, refunds: 0, cashOutAmount: 0, discountRate: 5,
  };
  return { profile: profileFrom({ loan }), vehicle, scenario, asOf: ASOF };
};

describe("research verdicts (§8 S5, §9)", () => {
  it("example A is Well positioned", () => {
    const r = scoreRefinance(exampleA());
    expect(r.verdict).toBe("wellPositioned");
    expect(r.approval).toBe("high");
    expect(r.metrics.ltv).toBeGreaterThan(0.94);
    expect(r.metrics.ltv).toBeLessThan(0.99);
  });

  it("example B is Possible, with conditions", () => {
    expect(scoreRefinance(exampleB()).verdict).toBe("possible");
  });

  it("a subsidized 3.99% captive rate says keep your loan, shown green", () => {
    const i = exampleA();
    i.profile.currentAutoLoan = { ...i.profile.currentAutoLoan, apr: 3.99, monthlyPayment: payment(42_000, 3.99, 72), subsidized: true };
    const r = scoreRefinance(i);
    expect(r.verdict).toBe("keepCurrentLoan");
    expect(r.approval).toBe("high");
    expect(r.band).toBe("green");
  });

  it("knockouts: 2+ lates, LTV over 130%, old car", () => {
    const i = exampleA();
    i.profile.latePayments12mo = 2;
    i.vehicle = { ...i.vehicle, estValue: 20_000, year: 2014, mileage: 160_000 };
    const r = scoreRefinance(i);
    expect(r.verdict).toBe("notEligible");
    expect(r.knockouts.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Score properties ──────────────────────────────────────────────────────────
describe("score properties", () => {
  it("factor points sum to the score and weights to 100", () => {
    for (const i of [exampleA(), exampleB()]) {
      const r = scoreRefinance(i);
      const sum = r.factors.reduce((s, f) => s + f.points, 0);
      expect(Math.round(sum)).toBe(r.score);
      expect(r.factors.reduce((s, f) => s + f.maxPoints, 0)).toBe(100);
    }
  });

  it("is deterministic", () => {
    expect(scoreRefinance(exampleA())).toEqual(scoreRefinance(exampleA()));
  });

  it("lower target APR never lowers the score", () => {
    for (const base of [exampleA(), exampleB()]) {
      let prev = -1;
      for (let apr = 20; apr >= 2; apr -= 0.25) {
        const s = scoreRefinance({ ...base, scenario: { ...base.scenario, targetApr: apr } }).score;
        expect(s).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
    }
  });

  it("higher LTV never raises the score", () => {
    for (const base of [exampleA(), exampleB()]) {
      let prev = 101;
      const payoff = scoreRefinance(base).metrics.payoff;
      for (let ltv = 0.5; ltv <= 1.6; ltv += 0.02) {
        const s = scoreRefinance({ ...base, vehicle: { ...base.vehicle, estValue: payoff / ltv } }).score;
        expect(s).toBeLessThanOrEqual(prev);
        prev = s;
      }
    }
  });

  it("more extra payment never lowers the score", () => {
    const base = exampleA();
    let prev = -1;
    for (let x = 0; x <= 500; x += 25) {
      const s = scoreRefinance({ ...base, scenario: { ...base.scenario, extraMonthlyPayment: x } }).score;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("score stays within 1–100", () => {
    const i = exampleA();
    i.profile.latePayments12mo = 5;
    i.profile.monthlyIncome = 500;
    i.vehicle.estValue = 1_000;
    const r = scoreRefinance(i);
    expect(r.score).toBeGreaterThanOrEqual(1);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

// ── Personas (plan: land in their target bands) ───────────────────────────────
describe("demo personas", () => {
  for (const p of PERSONAS) {
    it(`${p.first} lands in ${p.targetBand}`, () => {
      const profile = fixtureProfile(p.id, ASOF)!;
      const vehicle = personaVehicle(p, ASOF);
      const r0 = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile), asOf: ASOF });
      const r = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile, r0.metrics.likelyApr), asOf: ASOF });
      expect(r.band, JSON.stringify({ score: r.score, verdict: r.verdict, f: r.factors.map((f) => [f.key, f.points]) })).toBe(p.targetBand);
    });
  }
});
