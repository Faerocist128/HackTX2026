/*
 * H. Golden scenarios. Inputs only; expected values live in golden.expected.ts and
 * were produced from helpers/specModel.ts (the brief + reference math), never by
 * running the engine.
 */
import type { Overrides } from "./helpers/builders";
import { asOfForAge } from "./helpers/reference";

export interface GoldenCase { id: string; why: string; o: Overrides }

const P = (apr: number, extra: Overrides = {}): Overrides => ({ ...extra, loan: { apr, ...extra.loan } });

export const GOLDEN: GoldenCase[] = [
  { id: "G01", why: "Baseline prime: 12% → 7.5%, 48 mo; approval high but breakeven ≈ 8 mo > 6 → possible", o: {} },
  { id: "G02", why: "Super prime, short 36-mo refi, LTV 0.53, DTI tiny: every S2 'high' rule passes", o: { profile: { estCreditTier: "superPrime", creditScore: 800, monthlyIncome: 15_000, monthlyDebtPayments: 500 }, vehicle: { estValue: 38_000 }, loan: { apr: 9, monthsRemaining: 36 }, scenario: { termMonths: 36, targetApr: 0 } } },
  { id: "G03", why: "Prime, 15% → 7.31%, $0 fees: gap ≥ 1, NPV ≫ $500, breakeven 0 → wellPositioned", o: P(15, { scenario: { targetApr: 7.31, upfrontCosts: 0 } }) },
  { id: "G04", why: "Subsidized 3.99% captive loan → keepCurrentLoan regardless of savings (S5)", o: P(3.99, { loan: { subsidized: true } }) },
  { id: "G05", why: "Current 7.4% vs credited 7.31%: gap 0.09 < 0.5 → keepCurrentLoan", o: P(7.4, { scenario: { targetApr: 7.31 } }) },
  { id: "G06", why: "Near prime 15.5% → floor of likely range; approval medium (score 630) → possible", o: { profile: { estCreditTier: "nearPrime", creditScore: 630 }, loan: { apr: 15.5 }, scenario: { targetApr: 0 } } },
  { id: "G07", why: "Subprime 22% → floor 17.60% (19.10 − 0.25 term − 1.25); score 560 < 601 → approval low, savings exist → notYet", o: { profile: { estCreditTier: "subprime", creditScore: 560 }, loan: { apr: 22 }, scenario: { targetApr: 0 } } },
  { id: "G08", why: "Deep subprime 26% → floor 20.12% (21.62 − 0.25 − 1.25); approval low → notYet", o: { profile: { estCreditTier: "deepSubprime", creditScore: 470 }, loan: { apr: 26 }, scenario: { targetApr: 0 } } },
  { id: "G09", why: "Balance $4,500 < $5,000 → knockout → notEligible", o: { loan: { balance: 4_500 } } },
  { id: "G10", why: "10 months left < 12 → knockout → notEligible", o: { loan: { monthsRemaining: 10 } } },
  { id: "G11", why: "2016 car, 10.07 years old > 10 → knockout → notEligible", o: { vehicle: { year: 2016 }, asOf: asOfForAge(2016, 10.07) } },
  { id: "G12", why: "160,000 miles > 150,000 → knockout → notEligible", o: { vehicle: { mileage: 160_000 } } },
  { id: "G13", why: "2 lates in 12 months → knockout → notEligible", o: { profile: { latePayments12mo: 2 } } },
  { id: "G14", why: "Car worth $14,800 → LTV ≈ 1.356 > 1.30 → knockout → notEligible", o: { vehicle: { estValue: 14_800 } } },
  { id: "G15", why: "1 late payment: high needs 0 → medium → possible", o: P(14, { profile: { latePayments12mo: 1 }, scenario: { targetApr: 7.31 } }) },
  { id: "G16", why: "Debts push DTI to ≈ 0.48: over 45% → medium → possible", o: P(14, { profile: { monthlyIncome: 6_000, monthlyDebtPayments: 2_400 }, scenario: { targetApr: 7.31 } }) },
  { id: "G17", why: "Income $2,700 → PTI ≈ 0.18: over 15% → medium → possible", o: P(14, { profile: { monthlyIncome: 2_700, monthlyDebtPayments: 300 }, scenario: { targetApr: 7.31 } }) },
  { id: "G18", why: "Finance company, target set to its likely rate 9.06% (8.56 + 0.5): credited = target", o: P(14, { scenario: { channel: "financeCompany", targetApr: 9.06 } }) },
  { id: "G19", why: "84-month stretch: +1.5 term adjustment lifts the likely range; credited = new floor", o: P(14, { scenario: { termMonths: 84, targetApr: 0 } }) },
  { id: "G20", why: "0% current loan: no interest to save → keepCurrentLoan", o: P(0) },
];
