import { describe, expect, it } from "vitest";
import { scoreRefinance } from "@/lib/scoring/engine";
import { balanceAfter, breakEvenMonths, payment, presentValue } from "@/lib/scoring/loanMath";
import { estimateApr } from "@/lib/scoring/rateModel";
import { applyScenarioPatch, defaultScenario, personaVehicle } from "@/lib/scoring/defaults";
import { estimateValue, TOYOTA_DELTA, valueAt } from "@/lib/vehicle/value";
import { PERSONAS } from "@/lib/nessie/personas";
import { personaProfile } from "./personaProfile";
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
    source: "nessie",
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

  it("a subsidized 3.99% captive rate: keep your loan, good approval odds, low value", () => {
    const i = exampleA();
    i.profile.currentAutoLoan = { ...i.profile.currentAutoLoan, apr: 3.99, monthlyPayment: payment(42_000, 3.99, 72), subsidized: true };
    const r = scoreRefinance(i);
    expect(r.verdict).toBe("keepCurrentLoan");
    expect(r.approval).toBe("high");
    expect(r.odds.band).toBe("green");
    expect(r.worth.band).toBe("red");
  });

  it("knockouts: 2+ lates, LTV over 130%, old car", () => {
    const i = exampleA();
    i.profile.latePayments12mo = 2;
    i.vehicle = { ...i.vehicle, estValue: 20_000, year: 2014, mileage: 160_000 };
    const r = scoreRefinance(i);
    expect(r.verdict).toBe("notEligible");
    expect(r.knockouts.length).toBeGreaterThanOrEqual(4);
    expect(r.odds.band).toBe("red");
  });

  it("a knockout caps approval odds in the red band, so number, dial and label agree", () => {
    const i = exampleA();
    i.profile.latePayments12mo = 2; // one knockout, everything else strong
    const r = scoreRefinance(i);
    expect(r.knockouts).toHaveLength(1);
    expect(r.odds.score).toBe(39);
    expect(r.odds.band).toBe("red");
    expect(r.odds.uncappedScore).toBeGreaterThan(39);
    expect(r.odds.uncappedScore).toBe(Math.round(r.odds.factors.reduce((s, f) => s + f.points, 0)));
    expect(scoreRefinance(exampleA()).odds.uncappedScore).toBeUndefined();
  });
});

// ── Score properties ──────────────────────────────────────────────────────────
const scales = (r: ReturnType<typeof scoreRefinance>) => [r.odds, r.worth];
const withScenario = (i: ScoreInput, patch: Partial<Scenario>): ScoreInput => ({ ...i, scenario: { ...i.scenario, ...patch } });

describe("score properties", () => {
  it("factor points sum to each score and weights to 100", () => {
    for (const i of [exampleA(), exampleB()]) {
      for (const sc of scales(scoreRefinance(i))) {
        const sum = sc.factors.reduce((s, f) => s + f.points, 0);
        expect(Math.round(sum)).toBe(sc.score);
        expect(sc.factors.reduce((s, f) => s + f.maxPoints, 0)).toBe(100);
      }
    }
  });

  it("is deterministic", () => {
    expect(scoreRefinance(exampleA())).toEqual(scoreRefinance(exampleA()));
  });

  it("lower target APR never lowers either score", () => {
    for (const base of [exampleA(), exampleB()]) {
      let prev = [-1, -1];
      for (let apr = 20; apr >= 2; apr -= 0.25) {
        const r = scoreRefinance(withScenario(base, { targetApr: apr }));
        expect(r.odds.score).toBeGreaterThanOrEqual(prev[0]);
        expect(r.worth.score).toBeGreaterThanOrEqual(prev[1]);
        prev = [r.odds.score, r.worth.score];
      }
    }
  });

  it("higher LTV never raises either score", () => {
    for (const base of [exampleA(), exampleB()]) {
      let prev = [101, 101];
      const payoff = scoreRefinance(base).metrics.payoff;
      for (let ltv = 0.5; ltv <= 1.6; ltv += 0.02) {
        const r = scoreRefinance({ ...base, vehicle: { ...base.vehicle, estValue: payoff / ltv } });
        expect(r.odds.score).toBeLessThanOrEqual(prev[0]);
        expect(r.worth.score).toBeLessThanOrEqual(prev[1]);
        prev = [r.odds.score, r.worth.score];
      }
    }
  });

  it("more extra payment never lowers the value score, and saves interest", () => {
    const base = exampleA();
    let prev = -1;
    for (let x = 0; x <= 500; x += 25) {
      const r = scoreRefinance(withScenario(base, { extraMonthlyPayment: x }));
      expect(r.worth.score).toBeGreaterThanOrEqual(prev);
      prev = r.worth.score;
    }
    const r = scoreRefinance(withScenario(base, { extraMonthlyPayment: 200 }));
    expect(r.metrics.extraInterestSaved).toBeGreaterThan(1_000);
    expect(r.metrics.extraMonthsSooner).toBeGreaterThan(5);
  });

  it("comparison card adds up: overall savings = interest today − interest new − fees", () => {
    for (const i of [exampleA(), exampleB()])
      for (const patch of [{}, { termMonths: 84 }, { paymentBehavior: "late" as const }, { loanType: "cash-out" as const }, { extraMonthlyPayment: 200 }]) {
        const m = scoreRefinance(withScenario(i, patch)).metrics;
        expect(m.lifetimeInterestDelta).toBeCloseTo(m.currentInterestLeft - m.newTotalInterest - m.newFees, 6);
        expect(m.currentMonthsLeft).toBe(i.profile.currentAutoLoan.monthsRemaining);
      }
  });

  it("scores stay within 1–100", () => {
    const i = exampleA();
    i.profile.latePayments12mo = 5;
    i.profile.monthlyIncome = 500;
    i.vehicle.estValue = 1_000;
    for (const sc of scales(scoreRefinance(i))) {
      expect(sc.score).toBeGreaterThanOrEqual(1);
      expect(sc.score).toBeLessThanOrEqual(100);
    }
  });
});

// ── Every control on the audit page moves a score ─────────────────────────────
describe("sliders and controls move the scores", () => {
  const inputs = () =>
    PERSONAS.slice(0, 2).map((p) => {
      const profile = personaProfile(p.id, ASOF);
      const vehicle = personaVehicle(p, ASOF);
      const r0 = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile), asOf: ASOF });
      return { name: p.first, input: { profile, vehicle, scenario: defaultScenario(profile, r0.metrics.likelyApr), asOf: ASOF } as ScoreInput };
    });
  const moved = (a: ScoreInput, b: ScoreInput) => {
    const x = scoreRefinance(a), y = scoreRefinance(b);
    return x.odds.score !== y.odds.score || x.worth.score !== y.worth.score;
  };
  const cases: [string, (i: ScoreInput) => Partial<Scenario>][] = [
    ["loan length 36 → 72", () => ({ termMonths: 36 })],
    ["loan length 72", () => ({ termMonths: 72 })],
    ["loan length 84", () => ({ termMonths: 84 })],
    ["APR +1.5 within range", (i) => ({ targetApr: i.scenario.targetApr + 1.5 })],
    ["extra $150/mo", () => ({ extraMonthlyPayment: 150 })],
    ["pay late", () => ({ paymentBehavior: "late" })],
    ["variable rate", () => ({ loanType: "variable" })],
    ["cash-out", () => ({ loanType: "cash-out" })],
    ["finance company", () => ({ channel: "financeCompany" })],
  ];
  for (const { name, input } of inputs())
    for (const [label, patch] of cases)
      it(`${name}: ${label}`, () => expect(moved(input, { ...input, scenario: applyScenarioPatch(input, patch(input)) })).toBe(true));

  it("paying early helps a borrower with a late payment, and trims interest for everyone", () => {
    const [rachel, alex] = inputs().map((x) => x.input);
    expect(moved(alex, withScenario(alex, { paymentBehavior: "early" }))).toBe(true);
    const early = scoreRefinance(withScenario(rachel, { paymentBehavior: "early" })).metrics.newTotalInterest;
    expect(early).toBeLessThan(scoreRefinance(rachel).metrics.newTotalInterest);
  });

  it("switching lender moves the target rate with the likely rate", () => {
    const [rachel] = inputs().map((x) => x.input);
    const s = applyScenarioPatch(rachel, { channel: "creditUnion" });
    expect(s.targetApr).toBeCloseTo(rachel.scenario.targetApr - 0.5, 1);
    expect(applyScenarioPatch(rachel, { targetApr: 7 }).targetApr).toBe(7);
  });

  it("each step of the loan-length slider changes a score", () => {
    for (const { input } of inputs()) {
      let changes = 0;
      for (let t = 24; t < 84; t += 6) if (moved(withScenario(input, { termMonths: t }), withScenario(input, { termMonths: t + 6 }))) changes++;
      expect(changes).toBeGreaterThanOrEqual(8);
    }
  });
});

// ── Valuation (§4 with the high-mileage fix) ──────────────────────────────────
describe("car value", () => {
  const camry = (mileage: number) =>
    estimateValue({ make: "Toyota", model: "Camry", year: 2021, mileage, condition: "good" }, ASOF);

  it("a 2021 Camry at 45k miles is worth a realistic amount", () => {
    const v = camry(45_000);
    expect(v.trade).toBeGreaterThan(13_000);
    expect(v.trade).toBeLessThan(22_000);
  });

  it("a 900,000-mile car is worth salvage value only", () => {
    expect(camry(900_000).trade).toBeLessThan(1_500);
    expect(camry(900_000).trade).toBeGreaterThanOrEqual(500);
  });

  it("value never rises with mileage", () => {
    let prev = Infinity;
    for (let m = 0; m <= 500_000; m += 5_000) {
      const v = camry(m).trade;
      expect(v).toBeLessThanOrEqual(prev + 0.01);
      prev = v;
    }
  });

  it("250k miles is well under half the 45k-mile value", () => {
    expect(camry(250_000).trade).toBeLessThan(camry(45_000).trade * 0.3);
  });
});

// ── Personas (plan: land in their target bands) ───────────────────────────────
describe("demo personas", () => {
  for (const p of PERSONAS) {
    it(`${p.first} lands in ${p.targetBand} on both scales`, () => {
      const profile = personaProfile(p.id, ASOF);
      const vehicle = personaVehicle(p, ASOF);
      const r0 = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile), asOf: ASOF });
      const r = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile, r0.metrics.likelyApr), asOf: ASOF });
      const why = JSON.stringify({ odds: r.odds.score, worth: r.worth.score, verdict: r.verdict });
      expect(r.odds.band, why).toBe(p.targetBand);
      expect(r.worth.band, why).toBe(p.targetBand);
    });
  }
});
