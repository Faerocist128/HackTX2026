import { brand } from "../brand";
import { VERDICT_COPY } from "../scoring/bands";
import { TIER_LABEL } from "../scoring/rateModel";
import type { ScoreInput, ScoreResult } from "../scoring/types";
import type { StepCandidate } from "./steps";

export const SYSTEM_PROMPT = `You explain a car-refinance readiness score to a consumer.

The score, its factors and every step's point impact were computed by a deterministic engine. Treat them as facts: never change a number, never invent a new number, and copy each step's "impact" string exactly. You only explain and phrase.

Voice: plain language at about a 7th-grade reading level. Warm and encouraging, never shaming. Short sentences. Say "you". No jargon without a quick explanation (APR, LTV, DTI). ${brand.owner ? `You write for ${brand.owner}. End the rationale with the idea "${brand.helpLine}"` : "Do not claim to be or speak for any lender or car maker."}

Rules:
- rationale: 2–3 short paragraphs (each 1–3 sentences). First: the verdict and the single most important number. Second: what helps and what holds them back, citing their real data. Third: what to do next.
- Savings claims must be the term-matched, after-fee figures given (npvSavings, termMatchedMonthlySavings). Never promise approval or a rate; these are estimates.
- steps: rewrite each provided step's title and why in your voice, keep the same id, impact, timeframe and evidence facts, same order. Do not add or drop steps.
- If the verdict is keepCurrentLoan with a green band, celebrate that their loan is already good and suggest no steps beyond the provided ones.
- checkBackMonths: copy the value given.`;

export function buildUserMessage(input: ScoreInput, result: ScoreResult, steps: StepCandidate[]): string {
  const { profile, vehicle, scenario } = input;
  const m = result.metrics;
  const r = (x: number, d = 0) => Number(x.toFixed(d));
  const payload = {
    firstName: profile.name.split(" ")[0],
    score: result.score,
    band: result.band,
    verdict: result.verdict,
    verdictLabel: VERDICT_COPY[result.verdict].chip,
    approvalLikelihood: result.approval,
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
      breakEvenMonths: m.breakEvenMonths === null ? null : r(m.breakEvenMonths, 1),
      ltvPercent: r(m.ltv * 100),
      dtiPercent: r(m.dti * 100),
    },
    factors: result.factors.map((f) => ({ label: f.label, points: f.points, max: f.maxPoints, direction: f.direction, note: f.note })),
    nessieEvidence: profile.evidence,
    steps: steps.map((s) => ({ id: s.id, title: s.title, why: s.why, impact: `+${s.impact} pts`, timeframe: s.timeframe, nessieEvidence: s.nessieEvidence })),
    checkBackMonths: result.checkAgainMonths,
  };
  return `Explain this refinance audit.\n\n${JSON.stringify(payload, null, 1)}`;
}
