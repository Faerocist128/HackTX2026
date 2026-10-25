/*
 * C. Invalid and malformed input.
 *
 * scoreRefinance() validates nothing; the only guard is ScoreInputSchema at the
 * /api/advice boundary (the browser pages call the engine directly). So:
 *  1. the schema must reject each bad value, naming the offending field;
 *  2. the engine's own behavior on bad input is pinned down (crash type or output);
 *  3. where that behavior is unsafe, an `it.fails` test states the correct behavior
 *     and stays red-inverted until the engine is fixed (BUG ids → TEST_REPORT.md).
 */
import { describe, expect, it } from "vitest";
import { itBug } from "./helpers/bug";
import { scoreRefinance } from "@/lib/scoring/engine";
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

describe("C2. what the engine itself does with bad input (no validation layer)", () => {
  it("throws a TypeError when the scenario is missing", () => {
    const { profile, vehicle } = makeInput();
    expect(() => scoreRefinance({ profile, vehicle } as never)).toThrow(TypeError);
  });

  it("throws a TypeError on an empty input object", () => {
    expect(() => scoreRefinance({} as never)).toThrow(TypeError);
  });

  it("throws a TypeError for an unknown payment behavior", () => {
    expect(() => scoreRefinance(makeInput({ scenario: { paymentBehavior: "sometimes" as never } }))).toThrow(TypeError);
  });

  it("throws a TypeError for an unknown credit tier (no label to look up)", () => {
    expect(() => scoreRefinance(makeInput({ profile: { estCreditTier: "excellent" as never } }))).toThrow(TypeError);
  });

  it("does not throw for an unknown loan type or channel: it returns NaN instead (BUG-5)", () => {
    for (const o of [{ scenario: { loanType: "balloon" as never } }, { scenario: { channel: "pawnshop" as never } }] satisfies Overrides[]) {
      const r = scoreRefinance(makeInput(o));
      expect(Number.isNaN(r.metrics.likelyApr)).toBe(true);
    }
  });

  it("treats NaN income as no income (PTI = DTI = 100%), silently", () => {
    const r = scoreRefinance(makeInput({ profile: { monthlyIncome: Number.NaN } }));
    expect(r.metrics.pti).toBe(1);
    expect(r.metrics.dti).toBe(1);
    expect(r.approval).toBe("low");
  });

  it("treats a NaN or zero car value as unknown: LTV 9.99, so the LTV knockout fires (safe)", () => {
    for (const estValue of [Number.NaN, 0]) {
      const r = scoreRefinance(makeInput({ vehicle: { estValue } }));
      expect(r.metrics.ltv).toBe(9.99);
      expect(r.verdict).toBe("notEligible");
    }
  });

  it("coerces numeric strings silently ('48' months behaves like 48)", () => {
    const a = scoreRefinance(makeInput());
    const b = scoreRefinance(makeInput({ scenario: { termMonths: "48" as never } }));
    expect(b.metrics.newPayment).toBeCloseTo(a.metrics.newPayment, 8);
  });
});

describe("C3. BUG-5: the engine returns garbage instead of failing on invalid numbers", () => {
  const scoresAreNumbers = (o: Overrides) => {
    const r = scoreRefinance(makeInput(o));
    expect(Number.isNaN(r.odds.score)).toBe(false);
    expect(Number.isNaN(r.worth.score)).toBe(false);
  };

  itBug.each<[string, Overrides]>([
    ["NaN balance", { loan: { balance: Number.NaN } }],
    ["NaN current APR", { loan: { apr: Number.NaN } }],
    ["NaN target APR", { scenario: { targetApr: Number.NaN } }],
    ["NaN fees", { scenario: { upfrontCosts: Number.NaN } }],
    ["unknown loan type", { scenario: { loanType: "balloon" as never } }],
    ["unknown channel", { scenario: { channel: "pawnshop" as never } }],
  ])("BUG-5: %s should not produce a NaN score", (_, o) => scoresAreNumbers(o));

  it("BUG-5 detail: a NaN score is shown as a red band with verdict 'notYet', so it looks like real advice", () => {
    const r = scoreRefinance(makeInput({ loan: { balance: Number.NaN } }));
    expect(Number.isNaN(r.odds.score)).toBe(true);
    expect(r.odds.band).toBe("red");
    expect(r.verdict).toBe("notYet");
  });

  itBug("BUG-5: a 0-month new loan should not score as a green, worth-it refinance", () => {
    const r = scoreRefinance(makeInput({ scenario: { termMonths: 0 } }));
    expect(r.worth.band).not.toBe("green");
  });

  itBug("BUG-5: a negative extra payment should not invent lifetime savings larger than the whole balance", () => {
    const r = scoreRefinance(makeInput({ scenario: { extraMonthlyPayment: -500 } }));
    expect(r.metrics.lifetimeInterestDelta).toBeLessThan(20_000);
  });

  itBug("BUG-5: a missing monthly payment (undefined) should not produce NaN scores", () => {
    const input = makeInput();
    (input.profile.currentAutoLoan as { monthlyPayment?: number }).monthlyPayment = undefined;
    const r = scoreRefinance(input);
    expect(Number.isNaN(r.worth.score)).toBe(false);
  });
});

describe("C4. percent vs. decimal confusion", () => {
  it("rates are percents: 12 means 12%, and the payment math agrees", () => {
    const r = scoreRefinance(makeInput({ loan: { apr: 12 } }));
    expect(r.metrics.payoff).toBeCloseTo(20_000 * (1 + 0.12 * 10 / 365), 6);
  });

  it("FINDING (BUG-6): a decimal APR (0.12 meant as 12%) passes the schema and silently says 'keep your loan'", () => {
    // Stated payment is the 12% payment, but APR is entered as 0.12.
    const asPercent = makeInput({ loan: { apr: 12 } });
    const asDecimal = makeInput({ loan: { apr: 0.12, monthlyPayment: asPercent.profile.currentAutoLoan.monthlyPayment } });
    const json = JSON.parse(JSON.stringify(asDecimal));
    delete json.asOf;
    expect(ScoreInputSchema.safeParse(json).success).toBe(true);
    expect(scoreRefinance(asPercent).verdict).toBe("possible");
    expect(scoreRefinance(asDecimal).verdict).toBe("keepCurrentLoan");
  });

  itBug("BUG-6: an APR that contradicts the stated payment by 10x+ should be flagged, not scored", () => {
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

  it("FINDING (BUG-7): the schema accepts more months remaining than the original term", () => {
    const json = JSON.parse(JSON.stringify(makeInput({ loan: { monthsRemaining: 100, originalTerm: 60 } })));
    delete json.asOf;
    expect(ScoreInputSchema.safeParse(json).success).toBe(true);
  });
});
