import { describe, expect, it } from "vitest";
import { engineSteps } from "@/lib/advice/engineSteps";
import { candidateSteps, impactLabel, previewWithSteps } from "@/lib/advice/steps";
import { scoreRefinance } from "@/lib/scoring/engine";
import { defaultScenario, personaVehicle } from "@/lib/scoring/defaults";
import { payment } from "@/lib/scoring/loanMath";
import { normalize } from "@/lib/nessie/normalize";
import { manualSpec, PERSONAS, personaBundle } from "@/lib/nessie/personas";
import type { ScoreInput } from "@/lib/scoring/types";
import { personaProfile } from "./personaProfile";

const ASOF = new Date(2026, 9, 24);
const inputFor = (id: string): ScoreInput => {
  const p = PERSONAS.find((x) => x.id === id)!;
  const profile = personaProfile(id, ASOF);
  const vehicle = personaVehicle(p, ASOF);
  const r0 = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile), asOf: ASOF });
  return { profile, vehicle, scenario: defaultScenario(profile, r0.metrics.likelyApr), asOf: ASOF };
};

describe("next steps", () => {
  for (const p of PERSONAS) {
    it(`${p.first}: every +N points equals an engine re-run`, () => {
      const input = inputFor(p.id);
      const base = scoreRefinance(input);
      for (const s of candidateSteps(input, base)) {
        const r = scoreRefinance(s.apply(input));
        expect(s.impact).toEqual({ odds: r.odds.score - base.odds.score, worth: r.worth.score - base.worth.score });
        expect(s.impact.odds > 0 || s.impact.worth > 0).toBe(true);
      }
    });
  }

  it("yellow and red personas get a roadmap with Nessie evidence", () => {
    for (const id of ["almost-alex", "rebuilding-riley"]) {
      const steps = candidateSteps(inputFor(id));
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps) expect(s.nessieEvidence.length).toBeGreaterThan(10);
    }
  });

  it("checked-steps preview never drops below either score", () => {
    const input = inputFor("almost-alex");
    const steps = candidateSteps(input);
    const base = scoreRefinance(input);
    const p = previewWithSteps(input, steps, steps.map((s) => s.id));
    expect(p.odds).toBeGreaterThanOrEqual(base.odds.score);
    expect(p.worth).toBeGreaterThanOrEqual(base.worth.score);
  });

  it("engine steps carry readable impact labels", () => {
    expect(impactLabel({ odds: 8, worth: 1 })).toBe("+8 approval points · +1 value point");
    expect(impactLabel({ odds: 0, worth: 3 })).toBe("+3 value points");
    for (const s of engineSteps(candidateSteps(inputFor("almost-alex")))) expect(s.impact).toMatch(/^\+\d+ (approval|value) point/);
  });
});

describe("Nessie normalization", () => {
  it("derives Rachel's income and DTI from raw Nessie records", () => {
    const prof = personaProfile("ready-rachel", ASOF);
    expect(prof.monthlyIncome).toBe(7_400);
    expect(prof.monthlyDebtPayments).toBe(1_685); // rent 1,650 + card minimum 35
    expect(prof.latePayments12mo).toBe(0);
    expect(prof.creditUtilization).toBeCloseTo(0.1, 2);
  });

  it("'use my own info' round-trips through Nessie records", () => {
    const spec = manualSpec({ firstName: "Sam", monthlyIncome: 5_000, monthlyDebts: 1_400, balance: 18_000, apr: 13.5, monthsLeft: 50, credit: "nearPrime", lates: 1 });
    const prof = normalize(personaBundle(spec, payment(spec.loan.amount, spec.loan.apr, spec.loan.term), ASOF), ASOF);
    expect(prof.monthlyIncome).toBe(5_000);
    expect(prof.monthlyDebtPayments).toBe(1_400);
    expect(prof.latePayments12mo).toBe(1);
    expect(prof.estCreditTier).toBe("nearPrime");
    expect(prof.currentAutoLoan.monthsRemaining).toBe(50);
    expect(prof.currentAutoLoan.apr).toBe(13.5);
    expect(Math.abs(prof.currentAutoLoan.balance - 18_000)).toBeLessThan(5);
  });

  it("unknown APR uses the 2026 used-loan average", () => {
    expect(manualSpec({ firstName: "", monthlyIncome: 4_000, monthlyDebts: 0, balance: 9_000, apr: null, monthsLeft: 30, credit: "prime", lates: 0 }).loan.apr).toBe(11.19);
  });
});
