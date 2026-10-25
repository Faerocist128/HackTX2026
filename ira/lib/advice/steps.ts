/*
 * Candidate next steps. Each one is a concrete change to the inputs, and its
 * "+N points" on each scale comes from re-running scoreRefinance() with that change applied, never
 * from the AI (plan, Stage 2). The same transforms power the "with your checked
 * steps" preview, which applies the checked ones together.
 */
import { scoreRefinance } from "../scoring/engine";
import { estimateApr } from "../scoring/rateModel";
import type { ScoreInput, ScoreResult } from "../scoring/types";
import { vehicleAgeYears } from "../vehicle/value";

export interface StepCandidate {
  id: string;
  title: string;
  why: string;
  nessieEvidence: string;
  timeframe: string;
  impact: StepImpact; // engine-computed score deltas
  apply: (i: ScoreInput) => ScoreInput;
}

export interface StepImpact { odds: number; worth: number }

/** "+8 approval points · +3 value points", for the UI and the AI prompt. */
export function impactLabel(i: StepImpact): string {
  const parts = [];
  if (i.odds > 0) parts.push(`+${i.odds} approval point${i.odds === 1 ? "" : "s"}`);
  if (i.worth > 0) parts.push(`+${i.worth} value point${i.worth === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const clone = (i: ScoreInput): ScoreInput => ({
  ...i,
  profile: { ...i.profile, currentAutoLoan: { ...i.profile.currentAutoLoan } },
  vehicle: { ...i.vehicle },
  scenario: { ...i.scenario },
});

type Draft = Omit<StepCandidate, "impact">;

export function candidateSteps(input: ScoreInput, base: ScoreResult = scoreRefinance(input)): StepCandidate[] {
  const { profile, vehicle, scenario } = input;
  const m = base.metrics;
  const loan = profile.currentAutoLoan;
  const drafts: Draft[] = [];

  if (profile.latePayments12mo > 0 || scenario.paymentBehavior === "late") {
    const late = profile.evidence.find((e) => /late/.test(e));
    drafts.push({
      id: "autopay",
      title: "Turn on autopay for every bill",
      why: "Lenders look hardest at whether bills get paid on time. Late payments drop off the 12-month window lenders check.",
      nessieEvidence:
        late ??
        `You told us you usually pay late. ${Math.round(profile.onTimePaymentRate * 100)}% of your bills were on time last year.`,
      timeframe: profile.latePayments12mo > 0 ? "Starts now, counts fully in 12 months" : "Starts now",
      apply: (i) => {
        const c = clone(i);
        c.profile.latePayments12mo = 0;
        c.profile.onTimePaymentRate = 1;
        if (c.scenario.paymentBehavior === "late") c.scenario.paymentBehavior = "on-time";
        return c;
      },
    });
  }

  // §8 S5 example: "pay down $1,800 to reach 110% LTV". Target 100%, or 110% if far under
  // water; when already near 100%, aim for 90% so the step is worth doing.
  const ltvTarget = m.ltv > 1.25 ? 1.1 : m.ltv > 1.05 ? 1.0 : 0.9;
  const paydown = Math.ceil((m.payoff + (scenario.loanType === "cash-out" ? scenario.cashOutAmount : 0) - ltvTarget * vehicle.estValue) / 100) * 100;
  if (m.ltv > 0.95 && paydown >= 500) {
    const target = ltvTarget;
    const amount = paydown;
    drafts.push({
      id: "paydown",
      title: `Pay ${usd(amount)} toward your car loan`,
      why: `Owing less than the car is worth unlocks better rates. This gets you to about ${Math.round(target * 100)}% of its value.`,
      nessieEvidence: `You owe about ${Math.round(m.ltv * 100)}% of your car's estimated trade-in value (${usd(vehicle.estValue)}).`,
      timeframe: amount > profile.savingsBalance ? "6–12 months" : "1–3 months",
      apply: (i) => {
        const c = clone(i);
        c.profile.currentAutoLoan.balance = Math.max(0, c.profile.currentAutoLoan.balance - amount);
        return c;
      },
    });
  }

  if (scenario.channel !== "creditUnion" && !base.knockouts.length) {
    const cu = estimateApr(profile.estCreditTier, m.ltv, vehicleAgeYears(vehicle.year), scenario.termMonths, "creditUnion", { market: input.market, loanType: scenario.loanType });
    drafts.push({
      id: "shop",
      title: "Compare 2–3 lenders, including a credit union, in one week",
      why: "Rate shopping within 14 days counts as one credit check, and credit unions saved refinancers the most in 2026.",
      nessieEvidence: `Your rate is ${loan.apr}%. You likely qualify for ${m.likelyAprRange[0].toFixed(1)}%–${m.likelyAprRange[1].toFixed(1)}%.`,
      timeframe: "This week",
      apply: (i) => {
        const c = clone(i);
        c.scenario.channel = "creditUnion";
        c.scenario.targetApr = Math.min(c.scenario.targetApr, cu.apr);
        return c;
      },
    });
  }

  if (scenario.termMonths > loan.monthsRemaining + 3 || scenario.termMonths > 72) {
    const term = Math.max(24, Math.min(72, Math.round(loan.monthsRemaining / 6) * 6));
    drafts.push({
      id: "term",
      title: `Keep the loan length near ${term} months`,
      why: "A longer loan lowers the payment but usually raises what you pay in total.",
      nessieEvidence: `You have ${loan.monthsRemaining} months left today; this scenario stretches to ${scenario.termMonths}.`,
      timeframe: "When you apply",
      apply: (i) => {
        const c = clone(i);
        c.scenario.termMonths = term;
        return c;
      },
    });
  }

  if (profile.creditUtilization > 0.3) {
    const util = profile.evidence.find((e) => /Credit cards/.test(e));
    drafts.push({
      id: "cards",
      title: "Pay your cards down under 30% of their limits",
      why: "High card balances weigh on your credit tier and your monthly budget.",
      nessieEvidence: util ?? `Your cards are at ${Math.round(profile.creditUtilization * 100)}% of their limits.`,
      timeframe: "2–4 months",
      /*
       * ASSUMPTION: utilization under 30% plus no recent lates is modeled as one
       * credit tier up (utilization and history are ~65% of bureau scores).
       * Card minimums fall by about $40 a month.
       */
      apply: (i) => {
        const c = clone(i);
        c.profile.creditUtilization = 0.3;
        c.profile.monthlyDebtPayments = Math.max(0, c.profile.monthlyDebtPayments - 40);
        if (c.profile.latePayments12mo === 0) {
          const up = { deepSubprime: "subprime", subprime: "nearPrime", nearPrime: "prime", prime: "superPrime", superPrime: "superPrime" } as const;
          c.profile.estCreditTier = up[c.profile.estCreditTier];
          c.profile.creditScore = undefined;
        }
        return c;
      },
    });
  }

  if (scenario.extraMonthlyPayment < 50 && base.worth.band !== "green") {
    drafts.push({
      id: "extra",
      title: "Add $50 a month to your new payment",
      why: "Extra principal cuts total interest and gets you out of the loan sooner.",
      nessieEvidence: `About ${usd(profile.monthlyIncome)} comes in each month from payroll deposits.`,
      timeframe: "Every month",
      apply: (i) => {
        const c = clone(i);
        c.scenario.extraMonthlyPayment = Math.max(c.scenario.extraMonthlyPayment, 50);
        return c;
      },
    });
  }

  return drafts
    .map((d) => {
      const r = scoreRefinance(d.apply(input));
      return { ...d, impact: { odds: r.odds.score - base.odds.score, worth: r.worth.score - base.worth.score } };
    })
    .filter((s) => s.impact.odds > 0 || s.impact.worth > 0)
    .sort((a, b) => b.impact.odds + b.impact.worth - (a.impact.odds + a.impact.worth))
    .slice(0, 4);
}

/** Scores with several steps applied together (the design's "with your checked steps" preview). */
export function previewWithSteps(input: ScoreInput, steps: StepCandidate[], ids: string[]): StepImpact {
  let next = input;
  for (const s of steps) if (ids.includes(s.id)) next = s.apply(next);
  const r = scoreRefinance(next);
  return { odds: r.odds.score, worth: r.worth.score };
}
