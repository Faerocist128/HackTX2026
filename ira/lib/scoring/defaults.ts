import { POLICY } from "./config";
import { estimateValue, vehicleAgeYears } from "../vehicle/value";
import { estimateApr } from "./rateModel";
import type { FinancialProfile, Scenario, ScoreInput, Vehicle } from "./types";
import type { PersonaSpec } from "../nessie/personas";

/** Starting scenario: term-matched (research §6 "compare like for like"), rate at the likely estimate. */
export function defaultScenario(profile: FinancialProfile, likelyApr?: number): Scenario {
  const rem = profile.currentAutoLoan.monthsRemaining;
  return {
    termMonths: Math.min(84, Math.max(24, Math.round(rem / 6) * 6 || 48)),
    targetApr: likelyApr ? Math.round(likelyApr * 10) / 10 : Math.max(2, profile.currentAutoLoan.apr - 2.4),
    loanType: "fixed",
    paymentBehavior: profile.latePayments12mo >= 2 ? "late" : "on-time",
    extraMonthlyPayment: 0,
    channel: "bank",
    upfrontCosts: POLICY.defaultUpfrontCosts,
    refunds: 0,
    cashOutAmount: 2_000,
    discountRate: POLICY.defaultDiscountRate,
  };
}

export function vehicleFor(v: Omit<Vehicle, "estValue" | "estRetail">, asOf = new Date()): Vehicle {
  const est = estimateValue(v, asOf);
  return { ...v, estValue: Math.round(est.trade), estRetail: Math.round(est.retail) };
}

export function personaVehicle(p: PersonaSpec, asOf = new Date()): Vehicle {
  return vehicleFor(p.vehicle!, asOf);
}

/*
 * A scenario change as the audit page applies it. Lender, loan type and loan
 * length change the rate a lender would quote, so the target APR moves by the
 * same amount as the likely rate (plan "target vs. likely"). Moving the APR
 * slider itself sets the target directly.
 */
export function applyScenarioPatch(input: ScoreInput, patch: Partial<Scenario>): Scenario {
  const s = input.scenario;
  const next = { ...s, ...patch };
  if (patch.targetApr !== undefined || (next.channel === s.channel && next.loanType === s.loanType && next.termMonths === s.termMonths))
    return next;
  const { profile, vehicle } = input;
  const age = vehicleAgeYears(vehicle.year);
  const ltvOf = (sc: Scenario) =>
    (profile.currentAutoLoan.balance + (sc.loanType === "cash-out" ? sc.cashOutAmount : 0)) / Math.max(1, vehicle.estValue);
  const rate = (sc: Scenario) =>
    estimateApr(profile.estCreditTier, ltvOf(sc), age, sc.termMonths, sc.channel, { market: input.market, loanType: sc.loanType }).apr;
  const shifted = s.targetApr + rate(next) - rate(s);
  return { ...next, targetApr: Math.round(Math.max(2, Math.min(20, shifted)) * 10) / 10 };
}
