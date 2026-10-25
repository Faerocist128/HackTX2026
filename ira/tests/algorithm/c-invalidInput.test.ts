/*
 * C. Invalid and malformed input.
 *
 * Two guards: ScoreInputSchema (zod) at the /api/advice boundary, and since the
 * BUG-5 fix, validateScoreInput() inside the engine for the browser pages that
 * call scoreRefinance() directly. Both must reject bad values and name the field.
 */
import { describe, expect, it } from "vitest";
import { scoreRefinance, ScoreInputError } from "@/lib/scoring/engine";
import { ScoreInputSchema } from "@/lib/scoring/schema";
import { makeInput, type Overrides } from "./helpers/builders";

type Path = (string | number)[];
const rejects = (input: unknown, path: Path) => {
  const r = ScoreInputSchema.safeParse(input);
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues.map((i) => i.path.join("."))).toContain(path.join("."));
};

/** Set a nested value on a fresh valid input. */
function withValue(path: Path, value: unknown) {
  const input = JSON.parse(JSON.stringify(makeInput())) as Record<string, unknown>;
  delete input.asOf;
  let node = input as Record<string | number, unknown>;
  for (const k of path.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
  if (value === "__delete__") delete node[path[path.length - 1]];
  else node[path[path.length - 1]] = value;
  return input;
}

describe("C1. the API schema rejects bad values and names the field", () => {
  const L = ["profile", "currentAutoLoan"];
  it.each<[string, Path, unknown]>([
    ["negative balance", [...L, "balance"], -1],
    ["negative APR", [...L, "apr"], -0.5],
    ["NaN APR", [...L, "apr"], Number.NaN],
    ["infinite balance", [...L, "balance"], Number.POSITIVE_INFINITY],
    ["APR as a string", [...L, "apr"], "12"],
    ["null monthly payment", [...L, "monthlyPayment"], null],
    ["fractional months remaining", [...L, "monthsRemaining"], 12.5],
    ["negative months remaining", [...L, "monthsRemaining"], -1],
    ["missing balance", [...L, "balance"], "__delete__"],
    ["negative income", ["profile", "monthlyIncome"], -100],
    ["on-time rate as a percent (98)", ["profile", "onTimePaymentRate"], 98],
    ["fractional late count", ["profile", "latePayments12mo"], 0.5],
    ["unknown credit tier", ["profile", "estCreditTier"], "excellent"],
    ["credit score 200", ["profile", "creditScore"], 200],
    ["negative mileage", ["vehicle", "mileage"], -10],
    ["negative car value", ["vehicle", "estValue"], -1],
    ["model year 1970", ["vehicle", "year"], 1970],
    ["loan term 0", ["scenario", "termMonths"], 0],
    ["loan term 120", ["scenario", "termMonths"], 120],
    ["negative extra payment", ["scenario", "extraMonthlyPayment"], -50],
    ["unknown loan type", ["scenario", "loanType"], "balloon"],
    ["unknown payment behavior", ["scenario", "paymentBehavior"], "sometimes"],
    ["unknown channel", ["scenario", "channel"], "pawnshop"],
    ["negative fees", ["scenario", "upfrontCosts"], -1],
    ["missing discount rate", ["scenario", "discountRate"], "__delete__"],
  ])("%s", (_, path, value) => rejects(withValue(path, value), path));

  it.each([null, undefined, {}, [], "input"])("rejects a non-object or empty input (%s)", (v) => {
    expect(ScoreInputSchema.safeParse(v).success).toBe(false);
  });

  it("accepts the baseline input (the fixture itself is valid)", () => {
    expect(ScoreInputSchema.safeParse(withValue(["name-not-a-field"], 1)).success).toBe(true);
  });
});

describe("C2. the engine rejects bad input with ScoreInputError (BUG-5, fixed)", () => {
  /** Assert the specific error type and that it names the offending field. */
  const rejectsField = (input: unknown, field: string) => {
    let err: unknown;
    try { scoreRefinance(input as never); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ScoreInputError);
    expect(err).toBeInstanceOf(RangeError);
    expect((err as ScoreInputError).field).toBe(field);
  };

  it("a missing scenario", () => {
    const { profile, vehicle } = makeInput();
    rejectsField({ profile, vehicle }, "scenario");
  });

  it("an empty input object", () => rejectsField({}, "profile"));
  it("null input", () => rejectsField(null, "input"));

  it.each<[string, Overrides, string]>([
    ["NaN balance", { loan: { balance: Number.NaN } }, "loan.balance"],
    ["NaN current APR", { loan: { apr: Number.NaN } }, "loan.apr"],
    ["infinite income", { profile: { monthlyIncome: Number.POSITIVE_INFINITY } }, "profile.monthlyIncome"],
    ["NaN income", { profile: { monthlyIncome: Number.NaN } }, "profile.monthlyIncome"],
    ["NaN car value", { vehicle: { estValue: Number.NaN } }, "vehicle.estValue"],
    ["NaN target APR", { scenario: { targetApr: Number.NaN } }, "scenario.targetApr"],
    ["NaN fees", { scenario: { upfrontCosts: Number.NaN } }, "scenario.upfrontCosts"],
    ["a 0-month new loan", { scenario: { termMonths: 0 } }, "scenario.termMonths"],
    ["a negative extra payment", { scenario: { extraMonthlyPayment: -500 } }, "scenario.extraMonthlyPayment"],
    ["a negative balance", { loan: { balance: -1 } }, "loan.balance"],
    ["an on-time rate given as a percent (98)", { profile: { onTimePaymentRate: 98 } }, "profile.onTimePaymentRate"],
    ["an unknown loan type", { scenario: { loanType: "balloon" as never } }, "scenario.loanType"],
    ["an unknown channel", { scenario: { channel: "pawnshop" as never } }, "scenario.channel"],
    ["an unknown payment behavior", { scenario: { paymentBehavior: "sometimes" as never } }, "scenario.paymentBehavior"],
    ["an unknown credit tier", { profile: { estCreditTier: "excellent" as never } }, "profile.estCreditTier"],
    ["months as a string ('48')", { scenario: { termMonths: "48" as never } }, "scenario.termMonths"],
  ])("BUG-5 regression: %s → ScoreInputError naming the field", (_, o, field) => rejectsField(makeInput(o), field));

  it("BUG-5 regression: a missing (undefined) monthly payment → ScoreInputError", () => {
    const input = makeInput();
    (input.profile.currentAutoLoan as { monthlyPayment?: number }).monthlyPayment = undefined;
    rejectsField(input, "loan.monthlyPayment");
  });

  it("a car value of 0 is allowed and treated as unknown: LTV 9.99, so the LTV knockout fires (safe)", () => {
    const r = scoreRefinance(makeInput({ vehicle: { estValue: 0 } }));
    expect(r.metrics.ltv).toBe(9.99);
    expect(r.verdict).toBe("notEligible");
  });

  it("income of 0 is allowed: PTI = DTI = 100%, approval low", () => {
    const r = scoreRefinance(makeInput({ profile: { monthlyIncome: 0 } }));
    expect(r.metrics.pti).toBe(1);
    expect(r.approval).toBe("low");
  });

  it("valid unusual values still score: 0% APR, 0 months left, $0 balance, no credit score, a market rate", () => {
    for (const o of [
      { loan: { apr: 0 } }, { loan: { monthsRemaining: 0, monthlyPayment: 0 } }, { loan: { balance: 0, monthlyPayment: 0 } },
      { profile: { creditScore: undefined } }, { market: { typicalApr: 9, note: "" } },
    ] satisfies Overrides[]) expect(() => scoreRefinance(makeInput(o))).not.toThrow();
  });
});

describe("C4. percent vs. decimal confusion", () => {
  it("rates are percents: 12 means 12%, and the payment math agrees", () => {
    const r = scoreRefinance(makeInput({ loan: { apr: 12 } }));
    expect(r.metrics.payoff).toBeCloseTo(20_000 * (1 + 0.12 * 10 / 365), 6);
  });

  it("a decimal APR (0.12 meant as 12%) still passes the schema, which can't know the intent", () => {
    const asPercent = makeInput({ loan: { apr: 12 } });
    const asDecimal = makeInput({ loan: { apr: 0.12, monthlyPayment: asPercent.profile.currentAutoLoan.monthlyPayment } });
    const json = JSON.parse(JSON.stringify(asDecimal));
    delete json.asOf;
    expect(ScoreInputSchema.safeParse(json).success).toBe(true);
  });

  it("BUG-6 regression: an APR that contradicts the stated payment is flagged in the reasons", () => {
    const pay = makeInput({ loan: { apr: 12 } }).profile.currentAutoLoan.monthlyPayment;
    const r = scoreRefinance(makeInput({ loan: { apr: 0.12, monthlyPayment: pay } }));
    // Any signal would do: a knockout, a reason, or refusing to give a verdict.
    expect(r.knockouts.length + r.reasons.filter((s) => /payment|rate/i.test(s) && /check|confirm|doesn't match/i.test(s)).length).toBeGreaterThan(0);
  });

  it("FINDING: a decimal discount rate (0.05 meant as 5%) is accepted and treated as 0.05%", () => {
    const r5 = scoreRefinance(makeInput({ scenario: { discountRate: 5 } }));
    const r005 = scoreRefinance(makeInput({ scenario: { discountRate: 0.05 } }));
    // Near-zero discounting inflates NPV savings slightly; direction documented, not failed.
    expect(r005.metrics.npvSavings).toBeGreaterThan(r5.metrics.npvSavings);
  });

  it("BUG-7 regression: the schema rejects more months remaining than the original term", () => {
    const json = JSON.parse(JSON.stringify(makeInput({ loan: { monthsRemaining: 100, originalTerm: 60 } })));
    delete json.asOf;
    rejects(json, ["profile", "currentAutoLoan", "monthsRemaining"]);
    const ok = JSON.parse(JSON.stringify(makeInput({ loan: { monthsRemaining: 60, originalTerm: 60 } })));
    delete ok.asOf;
    expect(ScoreInputSchema.safeParse(ok).success).toBe(true);
  });
});
