import { NextResponse } from "next/server";
import { z } from "zod";
import { decodeVin, mockToyotaOwnerRecords } from "@/lib/vehicle/decode";
import { estimateValue } from "@/lib/vehicle/value";

export const runtime = "nodejs";

const Body = z.object({
  vin: z.string().optional(),
  year: z.number().int().min(1980).max(2030).optional(),
  make: z.string().max(40).optional(),
  model: z.string().max(60).optional(),
  mileage: z.number().min(0).max(1e6),
  condition: z.enum(["excellent", "good", "fair", "poor"]),
});

/** POST /api/vehicle → decoded vehicle + estimated trade/retail value + mock history. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the car details." }, { status: 400 });
  const b = parsed.data;

  let ymm: { vin?: string; year: number; make: string; model: string; trim?: string };
  try {
    if (b.vin) ymm = await decodeVin(b.vin);
    else if (b.year && b.make && b.model) ymm = { year: b.year, make: b.make, model: b.model };
    else return NextResponse.json({ error: "Enter a VIN or choose year, make and model." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  const est = estimateValue({ ...ymm, mileage: b.mileage, condition: b.condition });
  const history = await mockToyotaOwnerRecords.lookup(ymm);
  return NextResponse.json({
    vehicle: { ...ymm, mileage: b.mileage, condition: b.condition, estValue: Math.round(est.trade), estRetail: Math.round(est.retail) },
    history,
    historySource: mockToyotaOwnerRecords.name,
  });
}
