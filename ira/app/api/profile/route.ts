import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MissingKeyError } from "@/lib/env";
import { fetchBundle } from "@/lib/nessie/client";
import { normalize } from "@/lib/nessie/normalize";
import { PERSONAS } from "@/lib/nessie/personas";

export const runtime = "nodejs";

async function seededIds(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "lib/nessie/seeded.json"), "utf8"));
  } catch {
    return {};
  }
}

/** GET /api/profile → persona list. GET /api/profile?persona=<id> → FinancialProfile from live Nessie. */
export async function GET(req: Request) {
  const persona = new URL(req.url).searchParams.get("persona");
  if (!persona) {
    return NextResponse.json(
      PERSONAS.map((p) => ({ id: p.id, name: `${p.first} ${p.last}`, first: p.first, blurb: p.blurb, vehicle: p.vehicle })),
    );
  }
  if (!PERSONAS.some((p) => p.id === persona)) return NextResponse.json({ error: "Unknown persona" }, { status: 404 });

  const customerId = (await seededIds())[persona];
  if (!customerId) return NextResponse.json({ error: "This demo person isn't in the bank yet. Run npm run seed." }, { status: 503 });
  try {
    return NextResponse.json(normalize(await fetchBundle(customerId)));
  } catch (err) {
    if (err instanceof MissingKeyError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.warn("profile: Nessie failed", (err as Error).message);
    return NextResponse.json({ error: "We couldn't load this profile from the bank. If you changed your key, run npm run seed again." }, { status: 502 });
  }
}
