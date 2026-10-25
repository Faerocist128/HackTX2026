import { NextResponse } from "next/server";
import { z } from "zod";
import { isRateLimited, lookupVehicleSpecs, marketRateCheck } from "@/lib/ai/gemini";
import { MissingKeyError } from "@/lib/env";
import { TIER_LABEL } from "@/lib/scoring/rateModel";
import { decodeVin, mockToyotaOwnerRecords } from "@/lib/vehicle/decode";
import { delta, estimateValue, fiveYearDepreciation, lookupMsrp, researchDelta } from "@/lib/vehicle/value";

export const runtime = "nodejs";

const Body = z.object({
  vin: z.string().optional(),
  year: z.number().int().min(1980).max(2030).optional(),
  make: z.string().max(40).optional(),
  model: z.string().max(60).optional(),
  mileage: z.number().min(0).max(500_000),
  condition: z.enum(["excellent", "good", "fair", "poor"]),
  tier: z.enum(["superPrime", "prime", "nearPrime", "subprime", "deepSubprime"]).optional(),
});

const SCORE_RANGE = { superPrime: "781+", prime: "661-780", nearPrime: "601-660", subprime: "501-600", deepSubprime: "300-500" } as const;

/**
 * POST /api/vehicle → decoded vehicle + estimated trade/retail value + mock history,
 * and (with `tier`) Gemini's market-rate check for the score.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const miles = parsed.error.issues.some((i) => i.path[0] === "mileage");
    return NextResponse.json({ error: miles ? "Miles must be between 0 and 500,000." : "Check the car details." }, { status: 400 });
  }
  const b = parsed.data;

  let ymm: { vin?: string; year: number; make: string; model: string; trim?: string };
  try {
    if (b.vin) ymm = await decodeVin(b.vin);
    else if (b.year && b.make && b.model) ymm = { year: b.year, make: b.make, model: b.model };
    else return NextResponse.json({ error: "Enter a VIN or choose year, make and model." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  try {
    // Research δ wins where the brief has it (sourced); Gemini fills in everything else.
    const known = researchDelta(ymm.make, ymm.model);
    const [specs, market] = await Promise.all([
      lookupVehicleSpecs(ymm, { msrp: lookupMsrp(ymm.make, ymm.model), fiveYearDepreciation: known ? fiveYearDepreciation(known) : null }),
      b.tier ? marketRateCheck(TIER_LABEL[b.tier], SCORE_RANGE[b.tier]) : Promise.resolve(null),
    ]);
    const d = known ?? delta(specs.fiveYearDepreciation);
    const est = estimateValue({ ...ymm, mileage: b.mileage, condition: b.condition, msrp: specs.baseMsrp, delta: d });
    const history = await mockToyotaOwnerRecords.lookup(ymm);
    return NextResponse.json({
      vehicle: { ...ymm, mileage: b.mileage, condition: b.condition, estValue: Math.round(est.trade), estRetail: Math.round(est.retail) },
      specs: { ...specs, depreciationSource: known ? "research" : "gemini" },
      market,
      history,
      historySource: mockToyotaOwnerRecords.name,
    });
  } catch (err) {
    if (err instanceof MissingKeyError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.warn("vehicle: Gemini failed", err);
    const error = isRateLimited(err)
      ? `Found your ${ymm.year} ${ymm.make} ${ymm.model}, but Gemini's per-minute limit is used up, so we can't price it yet. Wait a few seconds and try again.`
      : `Found your ${ymm.year} ${ymm.make} ${ymm.model}, but Gemini couldn't price it right now. Try again in a moment.`;
    return NextResponse.json({ error }, { status: isRateLimited(err) ? 429 : 502 });
  }
}
