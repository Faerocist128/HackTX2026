// Gemini: car specs, a market-rate check and the plain-language explanation.
// Server-only. Gemini never computes the score: it supplies inputs (MSRP,
// depreciation, a rate sanity check) and words; the engine does the math.
import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { requireKey } from "../env";

// Flash-Lite answers in about a second; gemini-3.8-flash timed out on a standard key.
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const TIMEOUT_MS = 15_000;

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: requireKey("GEMINI_API_KEY") }));

// The key's per-minute quota (about 15 requests on a standard key) returns 429;
// an overloaded model returns 500/503. Both usually clear within seconds.
const RETRY_STATUS = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1_000, 3_000];

/** True when Gemini refused because the key's per-minute quota is used up. */
export const isRateLimited = (err: unknown) => err instanceof ApiError && err.status === 429;

export async function generateJson<S extends z.ZodType>(
  schema: S,
  opts: { system: string; prompt: string; signal?: AbortSignal; temperature?: number },
): Promise<z.infer<S>> {
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateOnce(schema, opts, signal);
    } catch (err) {
      const wait = RETRY_DELAYS_MS[attempt];
      if (!(err instanceof ApiError && RETRY_STATUS.has(err.status)) || wait === undefined || signal.aborted) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function generateOnce<S extends z.ZodType>(
  schema: S,
  opts: { system: string; prompt: string; temperature?: number },
  signal: AbortSignal,
): Promise<z.infer<S>> {
  const res = await ai().models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(schema),
      temperature: opts.temperature ?? 0.2,
      abortSignal: signal,
    },
  });
  const text = res.text;
  if (!text) throw new Error("Gemini returned no content");
  return schema.parse(JSON.parse(text));
}

// ── Vehicle specs ────────────────────────────────────────────────────────────
const SpecsSchema = z.object({
  baseMsrp: z.number().describe("Base MSRP in USD for this model year and trim when new"),
  fiveYearDepreciation: z.number().describe("Typical share of value lost in the first 5 years, 0-1 (e.g. 0.35)"),
  segment: z.string().describe("Short segment, e.g. 'compact SUV', 'full-size truck'"),
  confidence: z.enum(["high", "medium", "low"]),
});
export type VehicleSpecs = z.infer<typeof SpecsSchema>;

// Promises, so lookups already in flight are shared instead of re-sent. Failures are dropped.
const specCache = new Map<string, Promise<VehicleSpecs>>();
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export async function lookupVehicleSpecs(
  v: { year: number; make: string; model: string; trim?: string },
  anchors: { msrp: number | null; fiveYearDepreciation: number | null },
): Promise<VehicleSpecs> {
  const key = `${v.year}|${v.make}|${v.model}|${v.trim ?? ""}`.toLowerCase();
  const hit = specCache.get(key);
  if (hit) return hit;
  const p = fetchSpecs(v, anchors);
  specCache.set(key, p);
  p.catch(() => specCache.delete(key));
  return p;
}

async function fetchSpecs(
  v: { year: number; make: string; model: string; trim?: string },
  anchors: { msrp: number | null; fiveYearDepreciation: number | null },
): Promise<VehicleSpecs> {
  const anchorLines = [
    anchors.msrp ? `Reference base MSRP for a recent model year: $${anchors.msrp}.` : null,
    anchors.fiveYearDepreciation ? `Researched 5-year depreciation for this model (iSeeCars): ${Math.round(anchors.fiveYearDepreciation * 1000) / 10}%.` : null,
  ].filter(Boolean);
  const raw = await generateJson(SpecsSchema, {
    system:
      "You are an automotive pricing analyst for the US market. Answer with your best factual estimate. Use the US base MSRP for the given model year (not today's price) and the typical 5-year depreciation for that model. The industry average 5-year depreciation is about 42%.",
    prompt: `Vehicle: ${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}.\n${anchorLines.join("\n")}`,
  });
  return {
    ...raw,
    baseMsrp: clamp(raw.baseMsrp, 10_000, 300_000),
    fiveYearDepreciation: clamp(raw.fiveYearDepreciation, 0.1, 0.7),
  };
}

// ── Market-rate check ────────────────────────────────────────────────────────
const RateSchema = z.object({
  typicalApr: z.number().describe("Typical APR in percent, e.g. 8.9"),
  note: z.string().describe("One short sentence on what drives this rate"),
});

const rateCache = new Map<string, { at: number; v: Promise<z.infer<typeof RateSchema>> }>();

/** Typical used-car refinance APR for a tier today, from Gemini. Cached for a day. */
export function marketRateCheck(tierLabel: string, scoreRange: string): Promise<z.infer<typeof RateSchema>> {
  const hit = rateCache.get(tierLabel);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.v;
  const v = generateJson(RateSchema, {
    system: "You are a US auto-lending analyst. Give the typical APR a bank offers today on a 60-month used-car refinance loan.",
    prompt: `Borrower credit tier: ${tierLabel} (score ${scoreRange}).`,
  }).then((r) => ({ ...r, typicalApr: clamp(r.typicalApr, 2, 30) }));
  rateCache.set(tierLabel, { at: Date.now(), v });
  v.catch(() => rateCache.delete(tierLabel));
  return v;
}
