// NHTSA vPIC VIN decode (free, no key). Research §11.

export interface DecodedVin {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
}

export const isVin = (s: string) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(s.trim());

export async function decodeVin(vin: string): Promise<DecodedVin> {
  const v = vin.trim().toUpperCase();
  if (!isVin(v)) throw new Error("A VIN is 17 letters and numbers (no I, O or Q).");
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(v)}?format=json`,
    { signal: AbortSignal.timeout(6_000) },
  );
  if (!res.ok) throw new Error(`NHTSA returned ${res.status}`);
  const json = (await res.json()) as { Results?: Record<string, string>[] };
  const r = json.Results?.[0];
  const year = Number(r?.ModelYear);
  if (!r || !year || !r.Make || !r.Model) throw new Error("We couldn't find that VIN. Try choosing year, make and model.");
  const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { vin: v, year, make: title(r.Make), model: r.Model, trim: r.Trim || undefined };
}

/*
 * No public Toyota ownership database exists. This interface is where a real
 * source (TFS servicing records, a licensed history provider) would plug in.
 */
export interface VehicleHistory {
  openRecalls: string[];
  titleStatus: "clean" | "branded" | "unknown";
  owners?: number;
}

export interface VehicleHistoryProvider {
  name: string;
  lookup(v: { vin?: string; year: number; make: string; model: string }): Promise<VehicleHistory>;
}

/** Mock "Toyota Owner Records". Flags the V35A recall campaign named in research §5. */
export const mockToyotaOwnerRecords: VehicleHistoryProvider = {
  name: "Toyota Owner Records (mock)",
  async lookup(v) {
    const recalls: string[] = [];
    if (/toyota/i.test(v.make) && /tundra/i.test(v.model) && v.year >= 2022 && v.year <= 2024)
      recalls.push("NHTSA 24V381 / 25V767 / 26V320: V35A engine inspection or replacement");
    return { openRecalls: recalls, titleStatus: "clean" };
  },
};
