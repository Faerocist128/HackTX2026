// The engine's steps in the advice shape. The AI may rephrase title and why; the
// id, order, impact, timeframe and evidence always come from here.
import type { AdviceStep } from "./types";
import { impactLabel, type StepCandidate } from "./steps";

export const engineSteps = (steps: StepCandidate[]): AdviceStep[] =>
  steps.map((s) => ({
    id: s.id,
    title: s.title,
    why: s.why,
    impact: impactLabel(s.impact),
    timeframe: s.timeframe,
    nessieEvidence: s.nessieEvidence,
  }));

/** Engine steps with the AI's title and why where it has rewritten them. */
export function withAiWording(steps: AdviceStep[], ai: AdviceStep[] | undefined): AdviceStep[] {
  if (!ai) return steps;
  const byId = new Map(ai.map((s) => [s.id, s]));
  return steps.map((s) => {
    const w = byId.get(s.id);
    return w ? { ...s, title: w.title, why: w.why } : s;
  });
}
