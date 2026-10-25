import { NextResponse } from "next/server";

export const runtime = "nodejs";

// NHTSA vPIC (free, no key). Research §11. Makes and models for any model year.
const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles";
const TTL_MS = 24 * 3600_000;
const cache = new Map<string, { at: number; data: string[] }>();

/** Brands sold new in the US in recent years, listed first so the picker stays usable. */
const POPULAR_MAKES = [
  "Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Fiat",
  "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Land Rover",
  "Lexus", "Lincoln", "Lucid", "Maserati", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Nissan",
  "Polestar", "Porsche", "Ram", "Rivian", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
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

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * GET /api/vehicle/catalog?year=2021 → { popular, other } makes for that year.
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
    const all = await cached("makes", async () => {
      const lists = await Promise.all(["car", "multipurpose passenger vehicle (mpv)", "truck"].map((t) => vpic(`/GetMakesForVehicleType/${encodeURIComponent(t)}`, "MakeName")));
      return [...new Set(lists.flat().map(title))].sort((a, b) => a.localeCompare(b));
    });
    const popularLower = new Set(POPULAR_MAKES.map((m) => m.toLowerCase()));
    return NextResponse.json({ popular: POPULAR_MAKES, other: all.filter((m) => !popularLower.has(m.toLowerCase())) });
  } catch (err) {
    console.warn("catalog: NHTSA failed", err);
    return NextResponse.json({ error: "We couldn't load the list of cars. Try again, or use your VIN." }, { status: 502 });
  }
}
