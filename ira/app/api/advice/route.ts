import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/gemini";
import { engineSteps, withAiWording } from "@/lib/advice/engineSteps";
import { buildUserMessage, SYSTEM_PROMPT } from "@/lib/advice/prompt";
import { candidateSteps } from "@/lib/advice/steps";
import { AdviceSchema, type Advice } from "@/lib/advice/types";
import { MissingKeyError } from "@/lib/env";
import { scoreRefinance } from "@/lib/scoring/engine";
import { ScoreInputSchema } from "@/lib/scoring/schema";

export const runtime = "nodejs";

/** POST /api/advice → Gemini's plain-language explanation of the engine's result. */
export async function POST(req: Request) {
  const parsed = ScoreInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Recompute on the server: the AI only ever sees engine numbers.
  const input = parsed.data;
  const result = scoreRefinance(input);
  const steps = candidateSteps(input, result);

  try {
    const ai = await generateJson(AdviceSchema, {
      system: SYSTEM_PROMPT,
      prompt: buildUserMessage(input, result, steps),
      signal: req.signal,
      temperature: 0.4,
    });
    // Enforce engine numbers: impacts, step set and order come from the engine.
    const advice: Advice = {
      verdict: ai.verdict,
      rationale: ai.rationale.slice(0, 3),
      steps: withAiWording(engineSteps(steps), ai.steps),
    };
    return NextResponse.json(advice);
  } catch (err) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    if (err instanceof MissingKeyError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.warn("advice: Gemini failed", err);
    return NextResponse.json({ error: "Gemini couldn't write your explanation. Try again in a moment." }, { status: 502 });
  }
}
