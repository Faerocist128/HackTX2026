import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { candidateSteps } from "@/lib/advice/steps";
import { fallbackAdvice } from "@/lib/advice/fallback";
import { buildUserMessage, SYSTEM_PROMPT } from "@/lib/advice/prompt";
import { AdviceSchema, type Advice } from "@/lib/advice/types";
import { scoreRefinance } from "@/lib/scoring/engine";
import { ScoreInputSchema } from "@/lib/scoring/schema";

export const runtime = "nodejs";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 15_000, maxRetries: 1 }) : null;

export async function POST(req: Request) {
  const parsed = ScoreInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Recompute on the server: the AI only ever sees engine numbers.
  const input = parsed.data;
  const result = scoreRefinance(input);
  const steps = candidateSteps(input, result);
  const firstName = input.profile.name.split(" ")[0];
  const rules = fallbackAdvice(result, steps, firstName);

  if (!client) return NextResponse.json(rules);

  try {
    const response = await client.messages.parse(
      {
        model: "claude-sonnet-5-5",
        max_tokens: 2_000,
        output_config: { effort: "low", format: zodOutputFormat(AdviceSchema) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input, result, steps) }],
      },
      { signal: req.signal },
    );
    if (response.stop_reason === "refusal" || !response.parsed_output) return NextResponse.json(rules);

    const ai = response.parsed_output;
    // Enforce engine numbers: impacts, step set and order come from the engine.
    const byId = new Map(ai.steps.map((s) => [s.id, s]));
    const advice: Advice = {
      verdict: ai.verdict,
      rationale: ai.rationale.slice(0, 3),
      steps: rules.steps.map((r) => {
        const s = byId.get(r.id);
        return s ? { ...r, title: s.title, why: s.why } : r;
      }),
      checkBackMonths: result.checkAgainMonths,
      source: "ai",
    };
    return NextResponse.json(advice);
  } catch (err) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    if (err instanceof Anthropic.APIError) console.warn(`advice: Claude API ${err.status}`, err.message);
    else console.warn("advice: falling back to rules", err);
    return NextResponse.json(rules);
  }
}
