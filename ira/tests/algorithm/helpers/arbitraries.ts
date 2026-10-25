/*
 * fast-check generators for realistic, internally consistent inputs (assumption S4):
 * credit score inside its tier's band, stated payment = amortized payment, months
 * remaining ≤ original term, all values inside the API schema.
 */
import fc from "fast-check";
import type { ScoreInput } from "@/lib/scoring/types";
import { makeInput, TIERS } from "./builders";

const TIER_BAND = {
  deepSubprime: [300, 500], subprime: [501, 600], nearPrime: [601, 660], prime: [661, 780], superPrime: [781, 850],
} as const;

const money = (min: number, max: number) => fc.integer({ min: min * 100, max: max * 100 }).map((c) => c / 100);
const rate = (min: number, max: number) => fc.integer({ min: Math.round(min * 100), max: Math.round(max * 100) }).map((x) => x / 100);

export const arbInput: fc.Arbitrary<ScoreInput> = fc
  .record({
    tier: fc.constantFrom(...TIERS),
    scoreFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    balance: money(5_000, 80_000),
    apr: rate(0, 30),
    monthsRemaining: fc.integer({ min: 12, max: 84 }),
    termExtra: fc.integer({ min: 0, max: 24 }),
    income: money(1_500, 30_000),
    debts: money(0, 8_000),
    lates: fc.integer({ min: 0, max: 3 }),
    onTime: rate(0.8, 1),
    mileage: fc.integer({ min: 0, max: 200_000 }),
    year: fc.integer({ min: 2012, max: 2027 }),
    ltvTarget: rate(0.4, 1.6),
    termMonths: fc.integer({ min: 24, max: 84 }),
    targetApr: rate(2, 30),
    loanType: fc.constantFrom("fixed", "variable", "cash-out", "lease-buyout" as const),
    behavior: fc.constantFrom("early", "on-time", "late" as const),
    extra: fc.oneof(fc.constant(0), money(0, 1_000)),
    channel: fc.constantFrom("creditUnion", "bank", "financeCompany" as const),
    upfront: money(0, 2_000),
    refunds: fc.oneof(fc.constant(0), money(0, 500)),
    cashOut: money(0, 10_000),
    discount: rate(0, 15),
    subsidized: fc.integer({ min: 0, max: 9 }).map((x) => x === 0), // ~10% of loans
  })
  .map((g) => {
    const [lo, hi] = TIER_BAND[g.tier];
    return makeInput({
      profile: {
        estCreditTier: g.tier, creditScore: Math.round(lo + g.scoreFrac * (hi - lo)),
        monthlyIncome: g.income, monthlyDebtPayments: g.debts, latePayments12mo: g.lates, onTimePaymentRate: g.onTime,
      },
      loan: { balance: g.balance, apr: g.apr, subsidized: g.subsidized, monthsRemaining: g.monthsRemaining, originalTerm: Math.min(120, g.monthsRemaining + g.termExtra) },
      vehicle: { mileage: g.mileage, year: g.year, estValue: Math.round(g.balance / g.ltvTarget) },
      scenario: {
        termMonths: g.termMonths, targetApr: g.targetApr, loanType: g.loanType, paymentBehavior: g.behavior,
        extraMonthlyPayment: g.extra, channel: g.channel, upfrontCosts: g.upfront, refunds: g.refunds,
        cashOutAmount: g.cashOut, discountRate: g.discount,
      },
    });
  });

/** Deep copy so a property can change one field and compare. */
export const clone = (i: ScoreInput): ScoreInput => ({
  ...i,
  profile: { ...i.profile, currentAutoLoan: { ...i.profile.currentAutoLoan } },
  vehicle: { ...i.vehicle },
  scenario: { ...i.scenario },
});
