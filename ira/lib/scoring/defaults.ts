import { POLICY } from "./config";
import { estimateValue } from "../vehicle/value";
import type { FinancialProfile, Scenario, Vehicle } from "./types";
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
  return vehicleFor(p.vehicle, asOf);
}
