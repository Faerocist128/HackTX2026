/*
 * scoreRefinance(): the deterministic refinance score. Pure and synchronous, so it
 * runs in the browser on every slider move.
 *
 * Two layers, both from "Toyota Refinance Readiness" (research brief):
 *
 *  1. The research verdict, implemented exactly as §8 S1–S5: knockouts, approval
 *     likelihood, rate estimate, term-matched economics, verdict + check-again timing.
 *
 *  2. The 1–100 score. The brief has no numeric score or weights, so per the build
 *     plan's fallback list and the product decision to use a pure additive score,
 *     we score 11 factors whose thresholds all come from the brief. Points sum
 *     exactly to the score; nothing overrides the sum. The display band comes from
 *     the score, except "Keep current loan", which always shows green (product
 *     decision: a healthy borrower whose current rate already wins).
 *
 * Assumptions (not in the brief) are marked ASSUMPTION with the section they extend.
 */

import { POLICY } from "./config";
import {
  amortize,
  breakEvenMonths,
  payment,
  payoffAmount,
  presentValue,
} from "./loanMath";
import { estimateApr, NEXT_TIER, TIER_LABEL, TIER_MID_SCORE } from "./rateModel";
import type {
  Approval,
  Band,
  FactorBreakdown,
  FactorKey,
  ScoreInput,
  ScoreMetrics,
  ScoreResult,
  Verdict,
} from "./types";
import { vehicleAgeYears } from "../vehicle/value";

/** Weights sum to 100. Order is display order. */
export const WEIGHTS: Record<FactorKey, number> = {
  rateGap: 20, // §1 key findings: tier/rate gap is the single biggest driver
  npvSavings: 15, // §6 NPV savings, term-matched, net of costs
  lifetimeCost: 10, // §6/§7: term extension can raise total cost
  breakEven: 5, // §8 S5: breakeven ≤ 6 months
  ltv: 12, // §2, §8 S3 LTV bands
  dti: 8, // §2 DTI thresholds
  pti: 4, // §2 PTI thresholds
  paymentHistory: 12, // §2, §3 recent lates
  creditTier: 6, // §1 tier table
  vehicle: 4, // §2 age/mileage limits
  loanStructure: 4, // §2 balance, remaining term; §7 terms > 72 months
};

const LABELS: Record<FactorKey, string> = {
  rateGap: "Rate you could get",
  npvSavings: "Savings after fees",
  lifetimeCost: "Total interest",
  breakEven: "Time to break even",
  ltv: "Car value vs. loan",
  dti: "Debt-to-income",
  pti: "Payment vs. income",
  paymentHistory: "Payment history",
  creditTier: "Credit tier",
  vehicle: "Car age & mileage",
  loanStructure: "Loan length & size",
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Linear ramp: 0 at `zero`, 1 at `full` (works for decreasing ramps too). */
const ramp = (x: number, zero: number, full: number) => clamp01((x - zero) / (full - zero));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

/*
 * ASSUMPTION (extends §8 S4, plan "payment behavior slider"): simple-interest
 * loans (§5 payoff mechanics) accrue daily, so paying ~7 days early every month
 * trims accrued interest; we model it as 7/30.4 fewer accrual days in the first
 * cycle plus a small ongoing reduction (2%). Late payers are modeled as one late
 * fee ($25, typical contract) every 4 months, and late interest accrual (+3%).
 */
const BEHAVIOR = {
  early: { interestFactor: 0.98, feePerMonth: 0, historyShift: +1 },
  "on-time": { interestFactor: 1, feePerMonth: 0, historyShift: 0 },
  late: { interestFactor: 1.03, feePerMonth: 25 / 4, historyShift: -1 },
} as const;

export function scoreRefinance(input: ScoreInput): ScoreResult {
  const { profile, vehicle, scenario } = input;
  const asOf = input.asOf ?? new Date();
  const loan = profile.currentAutoLoan;
  const behavior = BEHAVIOR[scenario.paymentBehavior];

  // ── S0 normalize ────────────────────────────────────────────────────────────
  const payoff = payoffAmount(loan.balance, loan.apr, POLICY.perDiemDays);
  const cashOut = scenario.loanType === "cash-out" ? scenario.cashOutAmount : 0;
  const principal = payoff + cashOut;
  const ageYears = vehicleAgeYears(vehicle.year, asOf);
  const ltv = vehicle.estValue > 0 ? principal / vehicle.estValue : 9.99;
  const ltvRetail = vehicle.estRetail ? principal / vehicle.estRetail : null;
  const nRem = Math.max(1, loan.monthsRemaining);
  const aOld = loan.monthlyPayment;

  // ── S3 rate estimate ────────────────────────────────────────────────────────
  const tier = profile.estCreditTier;
  const likely = estimateApr(tier, ltv, ageYears, scenario.termMonths, scenario.channel);
  /*
   * ASSUMPTION (extends §8 S3; plan "target vs. likely"): the slider sets a target
   * APR, but the economics never credit a rate better than the low end of what the
   * borrower likely qualifies for. This keeps the score honest when someone drags
   * the rate to 2%, and keeps "lower APR never lowers the score" true.
   */
  const creditedApr = Math.max(scenario.targetApr, likely.range[0]);
  const termMatchedLikely = estimateApr(tier, ltv, ageYears, nRem, scenario.channel);
  const termMatchedApr = Math.max(
    creditedApr + (termMatchedLikely.apr - likely.apr), // same target, term-adjusted
    termMatchedLikely.range[0],
  );

  // ── S4 economics ────────────────────────────────────────────────────────────
  // Term-matched comparison first (§6 "Compare like for like").
  const aTermMatched = payment(principal, termMatchedApr, nRem);
  const npvSavings =
    presentValue(aOld, nRem, scenario.discountRate) -
    presentValue(aTermMatched, nRem, scenario.discountRate) -
    scenario.upfrontCosts +
    scenario.refunds -
    // Cash-out is new borrowing, not savings (§4 negative equity): remove its value.
    cashOut;
  const breakEven = breakEvenMonths(scenario.upfrontCosts, aOld, aTermMatched);

  // The scenario the user built (any term, extra payments, behavior).
  const newPayment = payment(principal, creditedApr, scenario.termMonths);
  const current = amortize(loan.balance, loan.apr, nRem, 0);
  const scen = amortize(
    principal,
    creditedApr,
    scenario.termMonths,
    scenario.extraMonthlyPayment,
    behavior.interestFactor,
    behavior.feePerMonth,
  );
  const lateFees = scen.totalPaid - (principal + scen.totalInterest);
  const lifetimeInterestDelta =
    current.totalInterest - scen.totalInterest - lateFees - scenario.upfrontCosts + scenario.refunds;

  const pti = profile.monthlyIncome > 0 ? newPayment / profile.monthlyIncome : 1;
  const dti =
    profile.monthlyIncome > 0
      ? (profile.monthlyDebtPayments + newPayment) / profile.monthlyIncome
      : 1;
  const rateGap = loan.apr - creditedApr;

  // ── S1 knockouts ────────────────────────────────────────────────────────────
  const knockouts: string[] = [];
  if (loan.balance < POLICY.minBalance)
    knockouts.push(`Your balance (${usd(loan.balance)}) is under the ${usd(POLICY.minBalance)} most lenders will refinance.`);
  if (loan.monthsRemaining < POLICY.minMonthsRemaining)
    knockouts.push(`Only ${loan.monthsRemaining} months are left on your loan; lenders usually want 12 or more.`);
  if (ageYears > POLICY.maxVehicleAgeYears)
    knockouts.push(`Your car is about ${Math.floor(ageYears)} years old; many lenders stop at 10.`);
  if (vehicle.mileage > POLICY.maxMileage)
    knockouts.push(`At ${vehicle.mileage.toLocaleString()} miles, your car is past the 150,000-mile limit.`);
  if (profile.latePayments12mo > POLICY.maxLates12mo)
    knockouts.push(`${profile.latePayments12mo} payments 30+ days late in the last 12 months.`);
  if (ltv > POLICY.maxLtv)
    knockouts.push(`You owe ${pct(ltv)} of the car's estimated trade-in value; the usual limit is 130%.`);

  // ── S2 approval likelihood ──────────────────────────────────────────────────
  const score = profile.creditScore ?? TIER_MID_SCORE[tier];
  const lates = profile.latePayments12mo;
  let approval: Approval = "low";
  if (score >= 661 && dti <= 0.45 && pti <= 0.15 && ltv <= 1.2 && lates === 0 && vehicle.mileage <= 100_000)
    approval = "high";
  else if (score >= 601 && dti <= 0.5 && pti <= 0.2 && ltv <= 1.3 && lates <= 1) approval = "medium";

  // ── S5 verdict ──────────────────────────────────────────────────────────────
  // The verdict uses the term-matched comparison (§6) at the credited rate, so it
  // follows the rate slider but never credits a rate below the likely range.
  const researchGap = loan.apr - termMatchedApr;
  const researchNpv = npvSavings + cashOut;
  const researchBreakEven = breakEven;
  let verdict: Verdict;
  if (knockouts.length) verdict = "notEligible";
  else if (researchGap < POLICY.keepLoanRateGap || researchNpv < POLICY.keepLoanNpv || loan.subsidized)
    verdict = "keepCurrentLoan";
  else if (
    approval === "high" &&
    researchGap >= POLICY.wellPositionedRateGap &&
    researchNpv >= Math.max(POLICY.wellPositionedNpvFloor, POLICY.wellPositionedNpvPct * payoff) &&
    researchBreakEven !== null &&
    researchBreakEven <= POLICY.wellPositionedBreakEven
  )
    verdict = "wellPositioned";
  else if (approval !== "low") verdict = "possible";
  else verdict = "notYet";

  // Check-again timing (§8 S5 "Not yet"): earlier of the LTV crossover month and
  // the §3 seasoning month for the borrower's current tier.
  const checkAgainMonths = checkAgain(verdict, profile, vehicle, loan, ltv, current.balances);

  // ── Factors ─────────────────────────────────────────────────────────────────
  const historyLevel =
    lates === 0 && profile.onTimePaymentRate >= 0.98 ? 2 : lates === 0 ? 1.5 : lates === 1 ? 1 : 0;
  const projectedHistory = Math.max(0, Math.min(2, historyLevel + behavior.historyShift * 0.5));

  const tierShare: Record<typeof tier, number> = {
    superPrime: 1, prime: 0.85, nearPrime: 0.5, subprime: 0.25, deepSubprime: 0,
  };

  const raw: Record<FactorKey, { share: number; raw: number; note: string }> = {
    // §1: avg achievable reduction ≈ 2.4 pts; §8 S5: < 0.5 means keep loan. Full credit at 3.0.
    rateGap: {
      share: ramp(rateGap, POLICY.keepLoanRateGap, 3.0),
      raw: rateGap,
      note:
        rateGap >= POLICY.keepLoanRateGap
          ? `Your rate (${loan.apr.toFixed(2)}%) is about ${rateGap.toFixed(1)} points above ${creditedApr.toFixed(2)}%.`
          : `Your current ${loan.apr.toFixed(2)}% is already close to or below what you'd likely get.`,
    },
    // §8 S5: < $250 keep loan; ASSUMPTION full credit at $2,500 (example A ≈ $2,641).
    npvSavings: {
      share: ramp(npvSavings, POLICY.keepLoanNpv, 2_500),
      raw: npvSavings,
      note:
        npvSavings >= 0
          ? `Same ${nRem}-month length, you'd keep about ${usd(npvSavings)} in today's dollars after fees.`
          : `Over the same ${nRem} months, fees outweigh the savings by ${usd(npvSavings)}.`,
    },
    // §7 "lead with total savings"; ASSUMPTION full credit at $1,500 saved, zero at break-even.
    lifetimeCost: {
      share: ramp(lifetimeInterestDelta, 0, 1_500),
      raw: lifetimeInterestDelta,
      note:
        lifetimeInterestDelta >= 0
          ? `This loan would cost about ${usd(lifetimeInterestDelta)} less in interest and fees overall.`
          : `This loan would cost about ${usd(lifetimeInterestDelta)} more in interest and fees overall.`,
    },
    // §8 S5: ≤ 6 months; ASSUMPTION zero at 24 months.
    breakEven: {
      share: breakEven === null ? 0 : 1 - ramp(breakEven, POLICY.wellPositionedBreakEven, 24),
      raw: breakEven ?? -1,
      note:
        breakEven === null
          ? "At the same loan length, the new payment isn't lower, so fees never pay back."
          : `Your monthly savings would cover the ${usd(scenario.upfrontCosts)} in fees in ${Math.max(1, Math.ceil(breakEven))} month${Math.ceil(breakEven) === 1 ? "" : "s"}.`,
    },
    // §8 S3 bands: ≤80% best; 100% neutral; 125%+ worst; 130% knockout.
    ltv: {
      share: ltv <= 0.8 ? 1 : ltv <= 1.0 ? 1 - ramp(ltv, 0.8, 1.0) * 0.3 : ltv <= 1.3 ? 0.7 * (1 - ramp(ltv, 1.0, 1.3)) : 0,
      raw: ltv,
      note: `You'd owe ${pct(ltv)} of your car's estimated trade-in value. Lenders like this under 100%, best under 80%.`,
    },
    // §2: < 36% preferred; 45–50% accepted by many.
    dti: {
      share: 1 - ramp(dti, 0.36, 0.5),
      raw: dti,
      note: `${pct(dti)} of your monthly income would go to debt payments. Under 36% is the goal.`,
    },
    // §2: prime pools 7–9%; S&P flags > 10%; subprime caps 15–20%.
    pti: {
      share: 1 - ramp(pti, 0.1, 0.2),
      raw: pti,
      note: `Your car payment would be ${pct(pti)} of your income. Lenders like 10% or less.`,
    },
    // §2: no 30-day lates in 12 months; §8 S1: 2+ is a knockout.
    paymentHistory: {
      share: projectedHistory / 2,
      raw: lates,
      note:
        scenario.paymentBehavior === "late"
          ? "Paying late would be the biggest thing holding you back."
          : lates === 0
            ? scenario.paymentBehavior === "early"
              ? "Paying early keeps your perfect record and trims interest."
              : `No late payments in the last 12 months. ${pct(profile.onTimePaymentRate)} of bills paid on time.`
            : `${lates} late payment${lates > 1 ? "s" : ""} in the last 12 months. Lenders look closely at this.`,
    },
    creditTier: {
      share: tierShare[tier],
      raw: score,
      note: `Your estimated credit tier is ${TIER_LABEL[tier].toLowerCase()}.`,
    },
    // §2: under 8–10 years; 100k common cutoff, 150k hard.
    vehicle: {
      share: Math.min(1 - ramp(ageYears, 8, 10), 1 - ramp(vehicle.mileage, 100_000, 150_000)),
      raw: ageYears,
      note: `A ${vehicle.year} with ${vehicle.mileage.toLocaleString()} miles${ageYears <= 8 && vehicle.mileage <= 100_000 ? " is still young to most lenders" : " is near many lenders' limits"}.`,
    },
    // §2: ≥ 24 months remaining, ≥ $5k balance; §7: terms > 72 months default more.
    loanStructure: {
      share:
        ramp(loan.monthsRemaining, 12, 24) * 0.4 +
        ramp(loan.balance, 3_000, 7_500) * 0.3 +
        (scenario.termMonths <= 72 ? 0.3 : 0),
      raw: scenario.termMonths,
      note:
        scenario.termMonths > 72
          ? `A ${scenario.termMonths}-month loan is riskier; loans over 72 months default about twice as often.`
          : `${loan.monthsRemaining} months left on a ${usd(loan.balance)} balance, refinancing over ${scenario.termMonths} months.`,
    },
  };

  const factors: FactorBreakdown[] = (Object.keys(WEIGHTS) as FactorKey[]).map((key) => {
    const w = WEIGHTS[key];
    const points = Math.round(clamp01(raw[key].share) * w * 10) / 10;
    return {
      key,
      label: LABELS[key],
      weight: w,
      rawValue: raw[key].raw,
      points,
      maxPoints: w,
      direction: points >= w * 0.6 ? "helps" : "hurts",
      note: raw[key].note,
    };
  });

  const total = factors.reduce((s, f) => s + f.points, 0);
  const finalScore = Math.max(1, Math.min(100, Math.round(total)));
  // "Keep your loan" shows green only for healthy borrowers (high approval odds)
  // whose current rate already wins; otherwise the score's own band applies.
  const band: Band =
    verdict === "keepCurrentLoan" && approval === "high"
      ? "green"
      : finalScore >= POLICY.bands.green
        ? "green"
        : finalScore >= POLICY.bands.yellow
          ? "yellow"
          : "red";

  const metrics: ScoreMetrics = {
    payoff,
    currentPayment: aOld,
    newPayment,
    monthlySavings: aOld - newPayment,
    termMatchedPayment: aTermMatched,
    termMatchedMonthlySavings: aOld - aTermMatched,
    npvSavings,
    currentInterestLeft: current.totalInterest,
    newTotalInterest: scen.totalInterest,
    lifetimeInterestDelta,
    breakEvenMonths: breakEven,
    ltv,
    ltvRetail,
    pti,
    dti,
    likelyApr: likely.apr,
    likelyAprRange: likely.range,
    creditedApr,
    monthsToPayoff: scen.months,
  };

  return {
    score: finalScore,
    band,
    verdict,
    approval,
    knockouts,
    reasons: rankedReasons(factors, knockouts),
    factors,
    metrics,
    checkAgainMonths,
  };
}

/** §8 "Reason codes": top factors in plain language, ranked by points lost. */
function rankedReasons(factors: FactorBreakdown[], knockouts: string[]): string[] {
  const lost = [...factors]
    .filter((f) => f.maxPoints - f.points > 0.5)
    .sort((a, b) => b.maxPoints - b.points - (a.maxPoints - a.points))
    .map((f) => f.note);
  return [...knockouts, ...lost].slice(0, 4);
}

/** §3 seasoning matrix: months of on-time payment until risk converges with the next tier. */
const SEASONING_TO_NEXT: Partial<Record<string, number>> = {
  deepSubprime: 50,
  subprime: 23,
  nearPrime: 14,
  prime: 10,
};

function checkAgain(
  verdict: Verdict,
  profile: ScoreInput["profile"],
  vehicle: ScoreInput["vehicle"],
  loan: ScoreInput["profile"]["currentAutoLoan"],
  ltv: number,
  balances: number[],
): number | null {
  if (verdict === "wellPositioned" || verdict === "keepCurrentLoan") return null;
  const candidates: number[] = [];
  // LTV crossover: first month the balance falls under the value curve (value held
  // flat as a conservative ASSUMPTION; depreciation would push it later).
  if (ltv > 1) {
    const idx = balances.findIndex((b) => b <= vehicle.estValue);
    if (idx > 0) candidates.push(idx);
  }
  // Seasoning: months already paid count toward the §3 convergence window.
  const paid = loan.originalTerm - loan.monthsRemaining;
  const need = SEASONING_TO_NEXT[profile.estCreditTier];
  if (need !== undefined && NEXT_TIER[profile.estCreditTier]) candidates.push(Math.max(3, need - paid));
  // Recent lates age out of the 12-month window.
  if (profile.latePayments12mo > 0) candidates.push(12);
  if (!candidates.length) return 3;
  return Math.max(3, Math.min(...candidates));
}

/**
 * Re-run the engine with one input improved, to price a next step in points.
 * The plan requires "+N pts" to come from the engine, never from the AI.
 */
export function scoreDelta(base: ScoreInput, improved: ScoreInput): number {
  return scoreRefinance(improved).score - scoreRefinance(base).score;
}
