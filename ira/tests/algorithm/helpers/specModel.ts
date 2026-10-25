/*
 * Spec-level expectations for one input: S1 knockouts, S2 approval, S3 rate,
 * §6 economics and S5 verdict, rebuilt from the brief with the reference math.
 * Only types come from lib/; no engine logic is reused.
 */
import type { ScoreInput } from "@/lib/scoring/types";
import {
  refPayment, refPayoff, refPV, specAgeYears, specApproval, specRate, type Tier,
} from "./reference";

export type Knockout = "balance" | "months" | "age" | "mileage" | "lates" | "ltv";

export function specExpect(input: ScoreInput) {
  const { profile, vehicle, scenario } = input;
  const loan = profile.currentAutoLoan;
  const asOf = input.asOf!;
  const tier = profile.estCreditTier as Tier;

  const payoff = refPayoff(loan.balance, loan.apr);
  const cashOut = scenario.loanType === "cash-out" ? scenario.cashOutAmount : 0;
  const principal = payoff + cashOut;
  const ltv = vehicle.estValue > 0 ? principal / vehicle.estValue : Infinity;
  const age = specAgeYears(vehicle.year, asOf);
  const nRem = Math.max(1, loan.monthsRemaining);
  const typical = input.market?.typicalApr;

  const likely = specRate(tier, ltv, age, scenario.termMonths, scenario.channel, scenario.loanType, typical);
  const credited = Math.max(scenario.targetApr, likely.lo);
  const tm = specRate(tier, ltv, age, nRem, scenario.channel, scenario.loanType, typical);
  // Term-matched rate: same target, shifted by the term adjustment (engine ASSUMPTION, S3).
  const tmApr = Math.max(credited + (tm.apr - likely.apr), tm.lo);

  const newPayment = refPayment(principal, credited, scenario.termMonths);
  const aTM = refPayment(principal, tmApr, nRem);
  const aOld = loan.monthlyPayment;
  // §6 formula as written in the brief: no separate cash-out term.
  const npvBrief = refPV(aOld, nRem, scenario.discountRate) - refPV(aTM, nRem, scenario.discountRate) - scenario.upfrontCosts + scenario.refunds;
  const diff = aOld - aTM;
  const breakEven = diff <= 0 ? null : scenario.upfrontCosts <= 0 ? 0 : scenario.upfrontCosts / diff;

  const income = profile.monthlyIncome;
  const pti = income > 0 ? newPayment / income : 1;
  const dti = income > 0 ? (profile.monthlyDebtPayments + newPayment) / income : 1;

  const knockouts: Knockout[] = [];
  if (loan.balance < 5_000) knockouts.push("balance");
  if (loan.monthsRemaining < 12) knockouts.push("months");
  if (age > 10) knockouts.push("age");
  if (vehicle.mileage > 150_000) knockouts.push("mileage");
  if (profile.latePayments12mo > 1) knockouts.push("lates");
  if (ltv > 1.3) knockouts.push("ltv");

  const MID: Record<Tier, number> = { superPrime: 800, prime: 720, nearPrime: 630, subprime: 550, deepSubprime: 450 };
  const approval = specApproval({
    score: profile.creditScore ?? MID[tier], dti, pti, ltv, lates: profile.latePayments12mo, mileage: vehicle.mileage,
  });

  const gap = loan.apr - tmApr;
  let verdict: string;
  if (knockouts.length) verdict = "notEligible";
  else if (gap < 0.5 || npvBrief < 250 || loan.subsidized) verdict = "keepCurrentLoan";
  else if (approval === "high" && gap >= 1 && npvBrief >= Math.max(500, 0.02 * payoff) && breakEven !== null && breakEven <= 6)
    verdict = "wellPositioned";
  else if (approval !== "low") verdict = "possible";
  else verdict = "notYet";

  return { payoff, principal, ltv, age, likely, credited, tmApr, newPayment, aTM, npvBrief, breakEven, pti, dti, knockouts, approval, verdict, gap };
}
