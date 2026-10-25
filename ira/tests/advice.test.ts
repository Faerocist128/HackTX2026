import { describe, expect, it } from "vitest";
import { candidateSteps, previewWithSteps } from "@/lib/advice/steps";
import { fallbackAdvice } from "@/lib/advice/fallback";
import { scoreRefinance } from "@/lib/scoring/engine";
import { defaultScenario, personaVehicle } from "@/lib/scoring/defaults";
import { fixtureProfile } from "@/lib/nessie/fixtures";
import { PERSONAS } from "@/lib/nessie/personas";
import type { ScoreInput } from "@/lib/scoring/types";

const ASOF = new Date(2026, 9, 24);
const inputFor = (id: string): ScoreInput => {
  const p = PERSONAS.find((x) => x.id === id)!;
  const profile = fixtureProfile(id, ASOF)!;
  const vehicle = personaVehicle(p, ASOF);
  const r0 = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile), asOf: ASOF });
  return { profile, vehicle, scenario: defaultScenario(profile, r0.metrics.likelyApr), asOf: ASOF };
};

describe("next steps", () => {
  for (const p of PERSONAS) {
    it(`${p.first}: every +N pts equals an engine re-run`, () => {
      const input = inputFor(p.id);
      const base = scoreRefinance(input);
      for (const s of candidateSteps(input, base)) {
        expect(s.impact).toBe(scoreRefinance(s.apply(input)).score - base.score);
        expect(s.impact).toBeGreaterThan(0);
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

  it("checked-steps preview never drops below the score", () => {
    const input = inputFor("almost-alex");
    const steps = candidateSteps(input);
    expect(previewWithSteps(input, steps, steps.map((s) => s.id))).toBeGreaterThanOrEqual(scoreRefinance(input).score);
  });

  it("fallback advice is never empty", () => {
    for (const p of PERSONAS) {
      const input = inputFor(p.id);
      const r = scoreRefinance(input);
      const a = fallbackAdvice(r, candidateSteps(input, r), p.first);
      expect(a.rationale.length).toBe(3);
      expect(a.rationale.every((t) => t.length > 20)).toBe(true);
    }
  });

  it("normalize derives Rachel's income and DTI from raw Nessie records", () => {
    const prof = fixtureProfile("ready-rachel", ASOF)!;
    expect(prof.monthlyIncome).toBe(7_400);
    expect(prof.monthlyDebtPayments).toBe(1_685); // rent 1,650 + card minimum 35
    expect(prof.latePayments12mo).toBe(0);
    expect(prof.creditUtilization).toBeCloseTo(0.1, 2);
  });
});
