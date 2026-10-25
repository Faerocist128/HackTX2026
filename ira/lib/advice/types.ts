import { z } from "zod";

export const AdviceStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string(),
  impact: z.string().describe("Exactly the engine's value, e.g. '+8 pts'"),
  timeframe: z.string(),
  nessieEvidence: z.string(),
});

export const AdviceSchema = z.object({
  verdict: z.string().describe("Short headline, under 8 words"),
  rationale: z.array(z.string()).describe("2–3 short paragraphs, plain language"),
  steps: z.array(AdviceStepSchema),
  checkBackMonths: z.number().nullable(),
});

export type Advice = z.infer<typeof AdviceSchema> & { source: "ai" | "rules" };
