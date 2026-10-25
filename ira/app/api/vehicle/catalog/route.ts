import { NextResponse } from "next/server";

export const runtime = "nodejs";

// NHTSA vPIC (free, no key). Research §11. Makes and models for any model year.
const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles";
const TTL_MS = 24 * 3600_000;
const cache = new Map<string, { at: number; data: string[] }>();

/** The 20 best-selling brands in the US, A–Z. VIN lookup still works for any make. */
const MAKES = [
  "Audi", "BMW", "Buick", "Chevrolet", "Dodge", "Ford", "GMC", "Honda", "Hyundai", "Jeep",
  "Kia", "Lexus", "Mazda", "Mercedes-Benz", "Nissan", "Ram", "Subaru", "Tesla", "Toyota", "Volkswagen",
];

async function cached(key: string, load: () => Promise<string[]>): Promise<string[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await load();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function vpic(path: string, field: string): Promise<string[]> {
  const res = await fetch(`${VPIC}${path}${path.includes("?") ? "&" : "?"}format=json`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`NHTSA returned ${res.status}`);
  const json = (await res.json()) as { Results?: Record<string, string>[] };
  return [...new Set((json.Results ?? []).map((r) => r[field]?.trim()).filter(Boolean))];
}

/**
 * GET /api/vehicle/catalog?year=2021 → { makes }.
 * GET /api/vehicle/catalog?year=2021&make=Toyota → { models }.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const year = Number(q.get("year"));
  const make = q.get("make")?.trim();
  if (!Number.isInteger(year) || year < 1980 || year > 2030) return NextResponse.json({ error: "Choose a year." }, { status: 400 });
  try {
    if (make) {
      const models = await cached(`m|${year}|${make.toLowerCase()}`, async () => {
        // Cars, SUVs/minivans (MPV) and pickups are separate vehicle types in vPIC.
        const lists = await Promise.all(
          ["car", "multipurpose passenger vehicle (mpv)", "truck"].map((t) =>
            vpic(`/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicletype/${encodeURIComponent(t)}`, "Model_Name").catch(() => []),
          ),
        );
        return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
      });
      return NextResponse.json({ models });
    }
    return NextResponse.json({ makes: MAKES });
  } catch (err) {
    console.warn("catalog: NHTSA failed", err);
    return NextResponse.json({ error: "We couldn't load the list of cars. Try again, or use your VIN." }, { status: 502 });
  }
}
