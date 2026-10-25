import { NextResponse } from "next/server";
import { z } from "zod";
import { MissingKeyError } from "@/lib/env";
import { fetchBundle } from "@/lib/nessie/client";
import { normalize } from "@/lib/nessie/normalize";
import { manualSpec } from "@/lib/nessie/personas";
import { writePerson } from "@/lib/nessie/write";

export const runtime = "nodejs";

const Body = z.object({
  firstName: z.string().max(40),
  monthlyIncome: z.number().positive().max(1e6),
  monthlyDebts: z.number().min(0).max(1e6),
  balance: z.number().positive().max(1e6),
  apr: z.number().min(0).max(40).nullable(),
  monthsLeft: z.number().int().min(1).max(96),
  credit: z.enum(["superPrime", "prime", "nearPrime", "subprime", "deepSubprime"]),
  lates: z.number().int().min(0).max(3),
});

/**
 * POST /api/profile/manual → writes "Use my own info" into Nessie as a new
 * customer, then reads it back like any persona. Returns the FinancialProfile.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the numbers you typed." }, { status: 400 });
  try {
    const customerId = await writePerson(manualSpec(parsed.data));
    return NextResponse.json(normalize(await fetchBundle(customerId)));
  } catch (err) {
    if (err instanceof MissingKeyError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.warn("manual profile: Nessie failed", (err as Error).message);
    return NextResponse.json({ error: "We couldn't save your info to the bank. Try again." }, { status: 502 });
  }
}
