/*
 * G. Fairness and compliance sanity. The engine must not take protected attributes
 * (ECOA / Reg B: race, color, religion, national origin, sex, marital status, age)
 * or obvious proxies (ZIP/address), and fields that don't belong in a credit
 * decision must not change the result.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreRefinance } from "@/lib/scoring/engine";
import { ScoreInputSchema } from "@/lib/scoring/schema";
import { makeInput } from "./helpers/builders";
import { arbInput, clone } from "./helpers/arbitraries";

/** Field names that would be protected attributes or location proxies (matched exactly, any case). */
const PROTECTED = new Set([
  "race", "ethnicity", "color", "religion", "nationalorigin", "nationality", "citizenship", "sex", "gender",
  "maritalstatus", "married", "spouse", "birthdate", "dateofbirth", "dob", "age", "borrowerage",
  "zip", "zipcode", "postalcode", "address", "street", "city", "county", "state", "region", "neighborhood",
]);

/** Every key path in a zod object schema. */
function schemaKeys(shape: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(shape).flatMap(([k, v]) => {
    const inner = (v as { unwrap?: () => unknown; shape?: Record<string, unknown> });
    const obj = inner.shape ?? (inner.unwrap?.() as { shape?: Record<string, unknown> })?.shape;
    return obj ? [`${prefix}${k}`, ...schemaKeys(obj, `${prefix}${k}.`)] : [`${prefix}${k}`];
  });
}

describe("G1. no protected attributes or location proxies are inputs", () => {
  const keys = schemaKeys(ScoreInputSchema.shape as Record<string, unknown>);

  it("the input schema has the fields we expect (guard against an empty walk)", () => {
    expect(keys).toEqual(expect.arrayContaining(["profile.monthlyIncome", "profile.currentAutoLoan.apr", "vehicle.mileage", "scenario.termMonths"]));
  });

  it("no input field names a protected attribute or a ZIP/address proxy", () => {
    const hits = keys.filter((k) => PROTECTED.has(k.split(".").pop()!.toLowerCase()));
    expect(hits).toEqual([]);
  });

  it("the test fixture carries no protected attributes either", () => {
    const flat = JSON.stringify(makeInput());
    expect(flat).not.toMatch(/"(race|sex|gender|religion|maritalStatus|zip|zipCode|dateOfBirth|age)"\s*:/i);
  });
});

describe("G2. irrelevant fields don't change the result", () => {
  it("name and customer id (which can proxy for sex or national origin) have no effect", () => {
    fc.assert(fc.property(arbInput, fc.string(), fc.string(), (i, name, id) => {
      const j = clone(i); j.profile.name = name; j.profile.customerId = id;
      expect(scoreRefinance(j)).toEqual(scoreRefinance(i));
    }), { seed: 11, numRuns: 300 });
  });

  it("unused profile fields (evidence, stored DTI, balances, savings, utilization) have no effect", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const j = clone(i);
      Object.assign(j.profile, { evidence: ["anything"], dti: 0.99, totalBalances: 1e6, savingsBalance: 0, creditUtilization: 4.9 });
      expect(scoreRefinance(j)).toEqual(scoreRefinance(i));
    }), { seed: 12, numRuns: 300 });
  });

  it("make, model, trim, VIN and condition have no effect once the car's value is fixed", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const j = clone(i);
      Object.assign(j.vehicle, { make: "Honda", model: "Civic", trim: "EX", vin: "1HGBH41JXMN109186", condition: "poor" });
      expect(scoreRefinance(j)).toEqual(scoreRefinance(i));
    }), { seed: 13, numRuns: 300 });
  });

  it("retail value only changes the retail-LTV metric, never a score or decision", () => {
    fc.assert(fc.property(arbInput, (i) => {
      const j = clone(i); j.vehicle.estRetail = (i.vehicle.estRetail ?? 20_000) * 3;
      const a = scoreRefinance(i), b = scoreRefinance(j);
      expect({ ...b, metrics: { ...b.metrics, ltvRetail: 0 } }).toEqual({ ...a, metrics: { ...a.metrics, ltvRetail: 0 } });
    }), { seed: 14, numRuns: 300 });
  });

  it("two borrowers identical in every credit-relevant field get identical results", () => {
    const a = makeInput({ profile: { name: "Maria Garcia", customerId: "A" } });
    const b = makeInput({ profile: { name: "John Smith", customerId: "B" } });
    expect(scoreRefinance(a)).toEqual(scoreRefinance(b));
  });
});
