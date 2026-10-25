/*
 * Input guard for scoreRefinance(). The browser pages call the engine directly
 * (only /api/advice runs the zod schema), so the engine checks its own input and
 * fails loudly instead of returning NaN scores or invented savings.
 * Ranges are deliberately loose: this catches impossible values, not unusual ones.
 */
import type { ScoreInput } from "./types";

export class ScoreInputError extends RangeError {
  constructor(readonly field: string, problem: string) {
    super(`Invalid refinance input: ${field} ${problem}`);
    this.name = "ScoreInputError";
  }
}

const TIERS = ["superPrime", "prime", "nearPrime", "subprime", "deepSubprime"];
const LOAN_TYPES = ["fixed", "variable", "cash-out", "lease-buyout"];
const BEHAVIORS = ["early", "on-time", "late"];
const CHANNELS = ["creditUnion", "bank", "financeCompany"];

function num(value: unknown, field: string, min?: number, max?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ScoreInputError(field, `must be a finite number (got ${String(value)})`);
  if (min !== undefined && value < min) throw new ScoreInputError(field, `must be at least ${min} (got ${value})`);
  if (max !== undefined && value > max) throw new ScoreInputError(field, `must be at most ${max} (got ${value})`);
}

function oneOf(value: unknown, field: string, allowed: string[]) {
  if (typeof value !== "string" || !allowed.includes(value)) throw new ScoreInputError(field, `must be one of ${allowed.join(", ")} (got ${String(value)})`);
}

function obj(value: unknown, field: string) {
  if (!value || typeof value !== "object") throw new ScoreInputError(field, "is required");
}

export function validateScoreInput(input: ScoreInput): void {
  obj(input, "input");
  const { profile, vehicle, scenario, market } = input;
  obj(profile, "profile");
  obj(vehicle, "vehicle");
  obj(scenario, "scenario");
  const loan = profile.currentAutoLoan;
  obj(loan, "profile.currentAutoLoan");

  num(profile.monthlyIncome, "profile.monthlyIncome", 0);
  num(profile.monthlyDebtPayments, "profile.monthlyDebtPayments", 0);
  num(profile.onTimePaymentRate, "profile.onTimePaymentRate", 0, 1);
  num(profile.latePayments12mo, "profile.latePayments12mo", 0);
  if (profile.creditScore !== undefined) num(profile.creditScore, "profile.creditScore", 0);
  oneOf(profile.estCreditTier, "profile.estCreditTier", TIERS);

  num(loan.balance, "loan.balance", 0);
  num(loan.apr, "loan.apr", 0);
  num(loan.monthlyPayment, "loan.monthlyPayment", 0);
  num(loan.monthsRemaining, "loan.monthsRemaining", 0);
  num(loan.originalTerm, "loan.originalTerm", 0);

  num(vehicle.year, "vehicle.year");
  num(vehicle.mileage, "vehicle.mileage", 0);
  num(vehicle.estValue, "vehicle.estValue", 0);
  if (vehicle.estRetail !== undefined) num(vehicle.estRetail, "vehicle.estRetail", 0);

  num(scenario.termMonths, "scenario.termMonths", 1);
  num(scenario.targetApr, "scenario.targetApr", 0);
  oneOf(scenario.loanType, "scenario.loanType", LOAN_TYPES);
  oneOf(scenario.paymentBehavior, "scenario.paymentBehavior", BEHAVIORS);
  num(scenario.extraMonthlyPayment, "scenario.extraMonthlyPayment", 0);
  oneOf(scenario.channel, "scenario.channel", CHANNELS);
  num(scenario.upfrontCosts, "scenario.upfrontCosts", 0);
  num(scenario.refunds, "scenario.refunds", 0);
  num(scenario.cashOutAmount, "scenario.cashOutAmount", 0);
  num(scenario.discountRate, "scenario.discountRate", 0);

  if (market) num(market.typicalApr, "market.typicalApr", 0);
}
