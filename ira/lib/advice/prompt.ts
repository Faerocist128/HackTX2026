import { brand } from "../brand";
import { VERDICT_COPY } from "../scoring/bands";
import { TIER_LABEL } from "../scoring/rateModel";
import type { ScoreInput, ScoreResult } from "../scoring/types";
import { impactLabel, type StepCandidate } from "./steps";

export const SYSTEM_PROMPT = `You explain a car-refinance audit to a consumer. It has two separate 1-100 scores:
- Approval odds: how likely a lender is to say yes.
- Refinance value: whether refinancing is worth it for them.
Keep the two ideas distinct; never blend them into one score.

The scores, their factors and every step's point impact were computed by a deterministic engine. Treat them as facts: never change a number, never invent a new number, and copy each step's "impact" string exactly. You only explain and phrase.

Voice: plain language at about a 7th-grade reading level. Warm and encouraging, never shaming. Short sentences. Say "you". No jargon without a quick explanation (APR, LTV, DTI). ${brand.owner ? `You write for ${brand.owner}. End the rationale with the idea "${brand.helpLine}"` : "Do not claim to be or speak for any lender or car maker."}

Rules:
- rationale: 2–3 short paragraphs (each 1–3 sentences). First: the verdict, both scores and the single most important dollar number. Second: what helps and what holds them back, citing their real data. Third: what to do next.
- Savings claims must be the term-matched, after-fee figures given (npvSavings, termMatchedMonthlySavings). Never promise approval or a rate; these are estimates.
- steps: rewrite each provided step's title and why in your voice, keep the same id, impact, timeframe and evidence facts, same order. Do not add or drop steps.
- Call the source data "your bank data". Never mention Nessie, Capital One or any bank by name.
- If the verdict is keepCurrentLoan, celebrate that their current loan is already a good deal and suggest no steps beyond the provided ones.`;

export function buildUserMessage(input: ScoreInput, result: ScoreResult, steps: StepCandidate[]): string {
  const { profile, vehicle, scenario } = input;
  const m = result.metrics;
  const r = (x: number, d = 0) => Number(x.toFixed(d));
  const payload = {
    firstName: profile.name.split(" ")[0],
    approvalOdds: {
      score: result.odds.score,
      band: result.odds.band,
      ...(result.odds.uncappedScore !== undefined && {
        capNote: `Factors add up to ${result.odds.uncappedScore}; the score is ${result.odds.score} because of ${[
          result.odds.capReason === "knockout" && "the knockouts",
          result.odds.capReason === "approval" && `the lender approval level (${result.approval}), which caps the dial`,
          result.odds.rateAskMultiplier !== undefined && `a target APR below the rate lenders likely offer (only ~${Math.round(result.odds.rateAskMultiplier * 100)}% of lenders would offer it)`,
        ].filter(Boolean).join(" and ")}.`,
      }),
    },
    refinanceValue: {
      score: result.worth.score,
      band: result.worth.band,
      ...(result.worth.capReason === "keepLoan" && { capNote: `Factors add up to ${result.worth.uncappedScore}; capped at ${result.worth.score} because the current loan already beats this refinance.` }),
    },
    verdict: result.verdict,
    verdictLabel: VERDICT_COPY[result.verdict].chip,
    lenderApprovalLikelihood: result.approval,
    knockouts: result.knockouts,
    creditTier: TIER_LABEL[profile.estCreditTier],
    vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}, ${vehicle.mileage} miles, ${vehicle.condition}`,
    currentLoan: { apr: profile.currentAutoLoan.apr, monthsRemaining: profile.currentAutoLoan.monthsRemaining, payment: r(m.currentPayment) },
    scenario: { termMonths: scenario.termMonths, apr: r(m.creditedApr, 2), likelyAprRange: m.likelyAprRange, loanType: scenario.loanType, paymentBehavior: scenario.paymentBehavior, extraMonthlyPayment: scenario.extraMonthlyPayment },
    numbers: {
      newPayment: r(m.newPayment),
      termMatchedMonthlySavings: r(m.termMatchedMonthlySavings),
      npvSavingsAfterFees: r(m.npvSavings),
      lifetimeInterestAndFeesSaved: r(m.lifetimeInterestDelta),
      interestSavedByExtraPayment: r(m.extraInterestSaved),
      monthsSoonerFromExtraPayment: m.extraMonthsSooner,
      breakEvenMonths: m.breakEvenMonths === null ? null : r(m.breakEvenMonths, 1),
      ltvPercent: r(m.ltv * 100),
      dtiPercent: r(m.dti * 100),
    },
    approvalFactors: result.odds.factors.map((f) => ({ label: f.label, points: f.points, max: f.maxPoints, direction: f.direction, note: f.note })),
    valueFactors: result.worth.factors.map((f) => ({ label: f.label, points: f.points, max: f.maxPoints, direction: f.direction, note: f.note })),
    nessieEvidence: profile.evidence,
    steps: steps.map((s) => ({ id: s.id, title: s.title, why: s.why, impact: impactLabel(s.impact), timeframe: s.timeframe, nessieEvidence: s.nessieEvidence })),
  };
  return `Explain this refinance audit.\n\n${JSON.stringify(payload, null, 1)}`;
}
