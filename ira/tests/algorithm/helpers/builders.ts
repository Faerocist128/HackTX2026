/*
 * Builders for engine inputs. Every test starts from one realistic, internally
 * consistent borrower and overrides only what it is about.
 */
import type { FinancialProfile, ScoreInput, Scenario, Vehicle, AutoLoan } from "@/lib/scoring/types";
import { refPayment } from "./reference";

/** Fixed clock: vehicle age depends on it. */
export const ASOF = new Date(2026, 9, 24);

export interface Overrides {
  profile?: Partial<Omit<FinancialProfile, "currentAutoLoan">>;
  loan?: Partial<AutoLoan>;
  vehicle?: Partial<Vehicle>;
  scenario?: Partial<Scenario>;
  market?: ScoreInput["market"];
  asOf?: Date;
}

/**
 * Baseline: prime borrower (720), $20,000 left at 12% with 48 of 60 months to go,
 * 2024 Camry worth $25,000 at 30k miles, refinancing over 48 months at 7.5% through
 * a bank with $350 of fees. Stated payment = amortized payment unless overridden.
 */
/** Drop keys explicitly set to undefined so they don't erase defaults. */
const defined = <T extends object>(x: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(x ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;

export function makeInput(o: Overrides = {}): ScoreInput {
  const loanBase = { balance: 20_000, apr: 12, monthsRemaining: 48, originalTerm: 60, ...defined(o.loan) };
  const loan: AutoLoan = {
    monthlyPayment:
      o.loan?.monthlyPayment ??
      (loanBase.monthsRemaining > 0 ? refPayment(loanBase.balance, loanBase.apr, loanBase.monthsRemaining) : 0),
    ...loanBase,
  };
  const profile: FinancialProfile = {
    customerId: "test-1",
    name: "Test Borrower",
    monthlyIncome: 8_000,
    monthlyDebtPayments: 1_200,
    dti: 0.22,
    totalBalances: 4_000,
    savingsBalance: 5_000,
    onTimePaymentRate: 1,
    latePayments12mo: 0,
    creditUtilization: 0.15,
    creditScore: 720,
    estCreditTier: "prime",
    evidence: [],
    source: "nessie",
    ...o.profile,
    currentAutoLoan: loan,
  };
  const vehicle: Vehicle = {
    year: 2024, make: "Toyota", model: "Camry", mileage: 30_000, condition: "good",
    estValue: 25_000, estRetail: 29_000, ...o.vehicle,
  };
  const scenario: Scenario = {
    termMonths: 48, targetApr: 7.5, loanType: "fixed", paymentBehavior: "on-time",
    extraMonthlyPayment: 0, channel: "bank", upfrontCosts: 350, refunds: 0,
    cashOutAmount: 0, discountRate: 5, ...o.scenario,
  };
  return { profile, vehicle, scenario, market: o.market ?? null, asOf: o.asOf ?? ASOF };
}

/** Credit tier → a representative score inside that tier's band. */
export const TIER_SCORE = {
  deepSubprime: 470, subprime: 560, nearPrime: 630, prime: 720, superPrime: 800,
} as const;

export const TIERS = ["deepSubprime", "subprime", "nearPrime", "prime", "superPrime"] as const;
