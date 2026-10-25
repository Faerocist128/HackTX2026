// Rule-based rationale and steps from the lowest-scoring factors, so the demo
// never shows an empty panel when the AI is slow, down or unconfigured.
import { brand } from "../brand";
import { VERDICT_COPY } from "../scoring/bands";
import type { ScoreResult } from "../scoring/types";
import type { Advice } from "./types";
import type { StepCandidate } from "./steps";

const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

export function fallbackAdvice(result: ScoreResult, steps: StepCandidate[], firstName: string): Advice {
  const m = result.metrics;
  const weakest = [...result.factors]
    .sort((a, b) => b.maxPoints - b.points - (a.maxPoints - a.points))
    .slice(0, 2);
  const strongest = [...result.factors].sort((a, b) => b.points / b.maxPoints - a.points / a.maxPoints)[0];

  const p1 =
    result.verdict === "keepCurrentLoan" && result.band === "green"
      ? `${firstName}, your current loan is already a good deal. At ${m.creditedApr.toFixed(1)}%, a new loan would save less than the fees cost.`
      : m.npvSavings > 0
        ? `At about ${m.creditedApr.toFixed(1)}% for the same length, your payment would drop about ${usd(m.termMatchedMonthlySavings)} a month, worth about ${usd(m.npvSavings)} after fees.`
        : `With these settings, refinancing would cost more than it saves after fees.`;
  const p2 = result.knockouts.length
    ? `Right now most lenders would say no because: ${result.knockouts[0].replace(/\.$/, "").toLowerCase()}.`
    : `${strongest.note} The biggest things holding your score back: ${weakest.map((f) => f.label.toLowerCase()).join(" and ")}.`;
  const p3 = steps.length
    ? `The steps below are ranked by how many points each adds. ${brand.helpLine}`
    : `Keep paying on time and check back to see if rates improve. ${brand.helpLine}`;

  return {
    verdict: VERDICT_COPY[result.verdict].headline,
    rationale: [p1, p2, p3],
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      why: s.why,
      impact: `+${s.impact} pts`,
      timeframe: s.timeframe,
      nessieEvidence: s.nessieEvidence,
    })),
    checkBackMonths: result.checkAgainMonths,
    source: "rules",
  };
}
