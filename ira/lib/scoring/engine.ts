/*
 * scoreRefinance(): the deterministic refinance audit. Pure and synchronous, so it
 * runs in the browser on every slider move.
 *
 * Two layers, both from "Toyota Refinance Readiness" (research brief):
 *
 *  1. The research verdict, implemented exactly as §8 S1–S5: knockouts, approval
 *     likelihood, rate estimate, term-matched economics, verdict + check-again timing.
 *
 *  2. Two 1–100 scales, each a pure additive score whose points sum exactly to it:
 *     - Approval odds: how likely a lender says yes (§2 underwriting factors).
 *     - Refinance value: whether this loan is worth it for you (§6 economics).
 *     The brief has no numeric score or weights; every threshold comes from it.
 *     Keeping them apart stops a strong borrower with a bad deal (or a great deal
 *     out of reach) from reading as one middling number.
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
import { bandOf } from "./bands";
import type {
  Approval,
  FactorBreakdown,
  FactorKey,
  OddsFactorKey,
  Scale,
  ScoreInput,
  ScoreMetrics,
  ScoreResult,
  Verdict,
  WorthFactorKey,
} from "./types";
import { vehicleAgeYears } from "../vehicle/value";

/** Weights per scale sum to 100. Order is display order. */
export const ODDS_WEIGHTS: Record<OddsFactorKey, number> = {
  creditTier: 22, // §1 tier table: the biggest driver of approval and price
  paymentHistory: 22, // §2, §3 recent lates; §8 S1 2+ lates is a knockout
  ltv: 16, // §2, §8 S3 LTV bands
  dti: 14, // §2 DTI thresholds
  pti: 10, // §2 PTI thresholds
  vehicle: 8, // §2 age/mileage limits
  loanStructure: 8, // §2 balance, remaining term; §7 terms > 72 months
};

export const WORTH_WEIGHTS: Record<WorthFactorKey, number> = {
  rateGap: 25, // §1 key findings: the rate gap is the single biggest driver
  lifetimeCost: 25, // §6/§7: total cost, including term and extra payments
  npvSavings: 20, // §6 NPV savings, term-matched, net of costs
  breakEven: 10, // §8 S5: breakeven ≤ 6 months
  paymentFit: 10, // §7: monthly payment change
  loanRisk: 10, // §7: loan type and length risk
};

const LABELS: Record<FactorKey, string> = {
  creditTier: "Credit tier",
  paymentHistory: "Payment history",
  ltv: "Car value vs. loan",
  dti: "Debt-to-income",
  pti: "Payment vs. income",
  vehicle: "Car age & mileage",
  loanStructure: "Loan length & size",
  rateGap: "Rate you could get",
  lifetimeCost: "Total interest",
  npvSavings: "Savings after fees",
  breakEven: "Time to break even",
  paymentFit: "Monthly payment",
  loanRisk: "Loan type & length",
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

type Raw = { share: number; raw: number; note: string };

function scale<K extends FactorKey>(weights: Record<K, number>, raw: Record<K, Raw>, forceRed = false): Scale {
  const factors: FactorBreakdown[] = (Object.keys(weights) as K[]).map((key) => {
    const w = weights[key];
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
  const score = Math.max(1, Math.min(100, Math.round(total)));
  return { score, band: forceRed ? "red" : bandOf(score), factors };
}

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
  const rateOpts = { market: input.market, loanType: scenario.loanType };
  const likely = estimateApr(tier, ltv, ageYears, scenario.termMonths, scenario.channel, rateOpts);
  /*
   * ASSUMPTION (extends §8 S3; plan "target vs. likely"): the slider sets a target
   * APR, but the economics never credit a rate better than the low end of what the
   * borrower likely qualifies for. This keeps the score honest when someone drags
   * the rate to 2%, and keeps "lower APR never lowers the score" true.
   */
  const creditedApr = Math.max(scenario.targetApr, likely.range[0]);
  const termMatchedLikely = estimateApr(tier, ltv, ageYears, nRem, scenario.channel, rateOpts);
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
  const scen = amortize(principal, creditedApr, scenario.termMonths, scenario.extraMonthlyPayment, behavior.interestFactor, behavior.feePerMonth);
  const noExtra = scenario.extraMonthlyPayment
    ? amortize(principal, creditedApr, scenario.termMonths, 0, behavior.interestFactor, behavior.feePerMonth)
    : scen;
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

  // ── Approval odds factors ───────────────────────────────────────────────────
  const historyLevel =
    lates === 0 && profile.onTimePaymentRate >= 0.98 ? 2 : lates === 0 ? 1.5 : lates === 1 ? 1 : 0;
  const projectedHistory = Math.max(0, Math.min(2, historyLevel + behavior.historyShift * 0.5));

  const tierShare: Record<typeof tier, number> = {
    superPrime: 1, prime: 0.85, nearPrime: 0.5, subprime: 0.25, deepSubprime: 0,
  };

  const oddsRaw: Record<OddsFactorKey, Raw> = {
    creditTier: {
      share: tierShare[tier],
      raw: score,
      note: `Your estimated credit tier is ${TIER_LABEL[tier].toLowerCase()}.`,
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
    // §8 S3 bands: ≤80% best; 100% neutral; 125%+ worst; 130% knockout.
    ltv: {
      share: ltv <= 0.8 ? 1 : ltv <= 1.0 ? 1 - ramp(ltv, 0.8, 1.0) * 0.3 : ltv <= 1.3 ? 0.7 * (1 - ramp(ltv, 1.0, 1.3)) : 0,
      raw: ltv,
      note: `You'd owe ${pct(ltv)} of your car's estimated trade-in value. Lenders like this under 100%, best under 80%.`,
    },
    // §2: < 36% preferred; 45–50% accepted by many. ASSUMPTION: full credit at 25%.
    dti: {
      share: 1 - ramp(dti, 0.25, 0.5),
      raw: dti,
      note: `${pct(dti)} of your monthly income would go to debt payments. Under 36% is the goal.`,
    },
    // §2: prime pools 7–9%; S&P flags > 10%; subprime caps 15–20%. ASSUMPTION: full credit at 5%.
    pti: {
      share: 1 - ramp(pti, 0.05, 0.2),
      raw: pti,
      note: `Your car payment would be ${pct(pti)} of your income. Lenders like 10% or less.`,
    },
    // §2: under 8–10 years; 100k common cutoff, 150k hard.
    vehicle: {
      share: Math.min(1 - ramp(ageYears, 6, 10), 1 - ramp(vehicle.mileage, 60_000, 150_000)),
      raw: ageYears,
      note: `A ${vehicle.year} with ${vehicle.mileage.toLocaleString()} miles${ageYears <= 6 && vehicle.mileage <= 60_000 ? " is still young to most lenders" : ageYears > 10 || vehicle.mileage > 150_000 ? " is past most lenders' limits" : " is getting close to many lenders' limits"}.`,
    },
    // §2: ≥ 24 months remaining, ≥ $5k balance; §7: terms > 72 months default about twice as often.
    // ASSUMPTION: lender risk rises steadily with term from 36 to 84 months.
    loanStructure: {
      share:
        ramp(loan.monthsRemaining, 12, 24) * 0.3 +
        ramp(loan.balance, 3_000, 7_500) * 0.3 +
        (1 - ramp(scenario.termMonths, 36, 84)) * 0.4,
      raw: scenario.termMonths,
      note:
        scenario.termMonths > 72
          ? `A ${scenario.termMonths}-month loan is riskier to lenders; loans over 72 months default about twice as often.`
          : `${loan.monthsRemaining} months left on a ${usd(loan.balance)} balance, refinancing over ${scenario.termMonths} months.`,
    },
  };

  // ── Refinance value factors ─────────────────────────────────────────────────
  // ASSUMPTION: dollar ramps scale with the payoff so a $40k loan and a $10k loan
  // are judged on the same footing, and typical values don't max out a factor.
  const savingsFull = Math.max(2_000, 0.08 * payoff);
  const paymentChange = aOld > 0 ? (aOld - newPayment) / aOld : 0;
  const typeRisk = { fixed: 1, "lease-buyout": 1, "cash-out": 0.5, variable: 0.4 }[scenario.loanType];

  const worthRaw: Record<WorthFactorKey, Raw> = {
    // §1: avg achievable reduction ≈ 2.4 pts; §8 S5: < 0.5 means keep loan. ASSUMPTION: full credit at 4.
    rateGap: {
      share: ramp(rateGap, 0, 4),
      raw: rateGap,
      note:
        rateGap >= POLICY.keepLoanRateGap
          ? `Your rate (${loan.apr.toFixed(2)}%) is about ${rateGap.toFixed(1)} points above ${creditedApr.toFixed(2)}%.`
          : `Your current ${loan.apr.toFixed(2)}% is already close to or below what you'd likely get.`,
    },
    // §7 "lead with total savings": interest and fees over the whole loan you built,
    // so term and extra payments both count. ASSUMPTION: zero at a loss of 5% of
    // payoff, full credit at savings of 15% of payoff.
    lifetimeCost: {
      share: ramp(lifetimeInterestDelta, -0.05 * payoff, 0.15 * payoff),
      raw: lifetimeInterestDelta,
      note:
        lifetimeInterestDelta >= 0
          ? `This loan would cost about ${usd(lifetimeInterestDelta)} less in interest and fees overall${scenario.extraMonthlyPayment ? `, including ${usd(noExtra.totalInterest - scen.totalInterest)} saved by paying extra` : ""}.`
          : `This loan would cost about ${usd(lifetimeInterestDelta)} more in interest and fees overall.`,
    },
    // §8 S5: < $250 keep loan. ASSUMPTION: full credit at 8% of payoff (min $2,000).
    npvSavings: {
      share: ramp(npvSavings, 0, savingsFull),
      raw: npvSavings,
      note:
        npvSavings >= 0
          ? `Same ${nRem}-month length, you'd keep about ${usd(npvSavings)} in today's dollars after fees.`
          : `Over the same ${nRem} months, fees outweigh the savings by ${usd(npvSavings)}.`,
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
    // ASSUMPTION: zero when the payment rises 10%, full credit when it falls 20%.
    paymentFit: {
      share: ramp(paymentChange, -0.1, 0.2),
      raw: aOld - newPayment,
      note:
        newPayment <= aOld
          ? `Your required payment would drop ${usd(aOld - newPayment)} a month, to ${usd(newPayment)}.`
          : `Your required payment would rise ${usd(newPayment - aOld)} a month, to ${usd(newPayment)}.`,
    },
    // §7: fixed rates are predictable; terms over 72 months raise total cost and risk.
    loanRisk: {
      share: typeRisk * (1 - 0.5 * ramp(scenario.termMonths, 60, 84)),
      raw: scenario.termMonths,
      note:
        scenario.loanType === "variable"
          ? "A variable rate can rise later, so your savings aren't locked in."
          : scenario.loanType === "cash-out"
            ? "Cash-out adds to what you owe, so it raises your risk."
            : scenario.termMonths > 72
              ? `A ${scenario.termMonths}-month loan keeps you in debt longer and costs more overall.`
              : "A fixed rate keeps your payment the same the whole loan.",
    },
  };

  const odds = scale(ODDS_WEIGHTS, oddsRaw, knockouts.length > 0);
  const worth = scale(WORTH_WEIGHTS, worthRaw);

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
    extraInterestSaved: noExtra.totalInterest - scen.totalInterest,
    extraMonthsSooner: noExtra.months - scen.months,
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
    odds,
    worth,
    verdict,
    approval,
    knockouts,
    reasons: rankedReasons([...odds.factors, ...worth.factors], knockouts),
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
export function scoreDelta(base: ScoreInput, improved: ScoreInput): { odds: number; worth: number } {
  const a = scoreRefinance(base), b = scoreRefinance(improved);
  return { odds: b.odds.score - a.odds.score, worth: b.worth.score - a.worth.score };
}
