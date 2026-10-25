import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchBundle, nessieOffline } from "@/lib/nessie/client";
import { fixtureProfile } from "@/lib/nessie/fixtures";
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

/** GET /api/profile → persona list. GET /api/profile?persona=<id> → FinancialProfile. */
export async function GET(req: Request) {
  const persona = new URL(req.url).searchParams.get("persona");
  if (!persona) {
    return NextResponse.json(
      PERSONAS.map((p) => ({ id: p.id, name: `${p.first} ${p.last}`, first: p.first, blurb: p.blurb, vehicle: p.vehicle })),
    );
  }
  if (!PERSONAS.some((p) => p.id === persona)) return NextResponse.json({ error: "Unknown persona" }, { status: 404 });

  const customerId = (await seededIds())[persona];
  if (!nessieOffline() && customerId) {
    try {
      return NextResponse.json(normalize(await fetchBundle(customerId)));
    } catch (err) {
      console.warn("Nessie unavailable, using fixture:", (err as Error).message);
    }
  }
  return NextResponse.json(fixtureProfile(persona));
}
