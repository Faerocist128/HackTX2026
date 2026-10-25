// Research brief §4 depreciation model:
//   V(t) = MSRP × e^(−δ·t) × m(miles, t) × c(condition) × k(trade)
//   δ_model = −ln(1 − D5_model) / 5
//   m = 1 − β × (miles − 13,476·t) / 1,000
// β = 0.35% per 1,000 miles and k = 0.85 are the brief's placeholders, not sourced
// values. Condition multipliers are our assumption. Every value here is an estimate.
//
// In the app, MSRP and the 5-year depreciation come from Gemini for any car
// (lib/ai/gemini.ts), anchored on the tables below where the research has data.

import type { Condition } from "../scoring/types";

export const FHWA_MILES_PER_YEAR = 13_476;
const BETA = 0.0035;
export const TRADE_FACTOR = 0.85;

export const CONDITION_FACTOR: Record<Condition, number> = {
  excellent: 1.05,
  good: 1.0,
  fair: 0.9,
  poor: 0.78,
};

export const delta = (fiveYearDepreciation: number) => -Math.log(1 - fiveYearDepreciation) / 5;
export const fiveYearDepreciation = (d: number) => 1 - Math.exp(-5 * d);

/** δ per year from iSeeCars 5-year depreciation (§4 table). */
export const TOYOTA_DELTA: Record<string, number> = {
  tacoma: delta(0.199),
  tundra: delta(0.212),
  "gr supra": delta(0.24),
  supra: delta(0.24),
  rav4: delta(0.252),
  "rav4 hybrid": delta(0.252),
  "corolla hatchback": delta(0.255),
  "4runner": delta(0.255),
  corolla: delta(0.276),
  sienna: delta(0.285),
  "corolla hybrid": delta(0.301),
  prius: delta(0.321),
  "highlander hybrid": delta(0.343),
  highlander: delta(0.36),
  // Not reported by iSeeCars. §4: "use the Camry and Sequoia at or better than
  // segment averages". We use the hybrid-segment average (35.4%) as that floor.
  camry: delta(0.354),
  sequoia: delta(0.342), // trucks segment average
  "grand highlander": delta(0.36),
  crown: delta(0.354),
};
export const ALL_VEHICLES_DELTA = delta(0.418);

/** Approximate base MSRPs. Placeholder baselines until licensed guidebook data is wired in. */
export const MSRP_BASELINE: Record<string, Record<string, number>> = {
  toyota: {
    camry: 29_000, corolla: 23_000, "corolla hatchback": 24_500, "corolla hybrid": 24_500,
    prius: 29_000, rav4: 30_500, "rav4 hybrid": 33_500, highlander: 41_000,
    "highlander hybrid": 45_000, "grand highlander": 44_000, "4runner": 42_000,
    tacoma: 33_000, tundra: 42_000, sequoia: 63_000, sienna: 39_000, "gr supra": 47_000,
    crown: 41_000,
  },
  honda: { civic: 24_500, accord: 29_000, "cr-v": 31_000, "hr-v": 25_500 },
  ford: { "f-150": 40_000, escape: 30_000, explorer: 39_000, maverick: 26_000 },
  chevrolet: { silverado: 40_000, equinox: 29_000, malibu: 26_000, trax: 22_000 },
  hyundai: { elantra: 22_500, tucson: 29_000, "santa fe": 34_000, sonata: 27_500 },
  nissan: { altima: 27_000, rogue: 30_000, sentra: 21_500, pathfinder: 37_000 },
};

export const MAKES = Object.keys(MSRP_BASELINE);

const key = (s: string) => s.trim().toLowerCase();

export function lookupMsrp(make: string, model: string): number | null {
  return MSRP_BASELINE[key(make)]?.[key(model)] ?? null;
}

/** The research δ for this model, or null when the brief has no data for it. */
export function researchDelta(make: string, model: string): number | null {
  if (key(make) === "toyota") return TOYOTA_DELTA[key(model)] ?? null;
  return null;
}

export function deltaFor(make: string, model: string): number {
  return researchDelta(make, model) ?? ALL_VEHICLES_DELTA;
}

export interface ValueEstimate {
  retail: number;
  trade: number;
  msrp: number;
  ageYears: number;
  delta: number;
  isEstimate: true;
}

export function vehicleAgeYears(modelYear: number, asOf = new Date()): number {
  // Model years go on sale roughly the prior autumn; treat MY as starting Oct 1 of year−1.
  const start = new Date(modelYear - 1, 9, 1);
  return Math.max(0, (asOf.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000));
}

/*
 * ASSUMPTION (extends §4): the brief's linear mileage term m = 1 − β·excess/1000
 * is only sensible near typical mileage; read literally it never reaches zero
 * fast enough (a 900,000-mile car kept half its value under the old 0.5 floor).
 * We keep the linear term up to 100,000 excess miles (m = 0.65), then decay it
 * exponentially. Past 200,000 total miles lenders and buyers treat a car as near
 * the end of its life, so value fades toward a salvage floor and reaches it at
 * 300,000 miles. No car is worth less than its salvage value.
 */
const LINEAR_EXCESS_LIMIT = 100_000;
const HIGH_MILES = 200_000;
const SALVAGE_MILES = 300_000;

export function mileageFactor(miles: number, ageYears: number): number {
  const excess = miles - FHWA_MILES_PER_YEAR * ageYears;
  if (excess <= LINEAR_EXCESS_LIMIT) return Math.min(1.15, 1 - (BETA * excess) / 1000);
  const atLimit = 1 - (BETA * LINEAR_EXCESS_LIMIT) / 1000;
  return atLimit * Math.exp(-(excess - LINEAR_EXCESS_LIMIT) / 60_000);
}

/** Scrap value: roughly curb weight × scrap price, scaled a little by the car's class. */
export const salvageValue = (msrp: number) => Math.max(500, Math.min(1_500, 300 + 0.02 * msrp));

export function estimateValue(
  input: { make: string; model: string; year: number; mileage: number; condition: Condition; msrp?: number; delta?: number },
  asOf = new Date(),
): ValueEstimate {
  const msrp = input.msrp ?? lookupMsrp(input.make, input.model) ?? 32_000; // fallback: rough market-average base MSRP
  const t = vehicleAgeYears(input.year, asOf);
  const d = input.delta ?? deltaFor(input.make, input.model);
  const floor = salvageValue(msrp);
  let retail = msrp * Math.exp(-d * t) * mileageFactor(input.mileage, t) * CONDITION_FACTOR[input.condition];
  if (input.mileage >= SALVAGE_MILES) retail = floor;
  else if (input.mileage > HIGH_MILES) {
    const w = (input.mileage - HIGH_MILES) / (SALVAGE_MILES - HIGH_MILES);
    retail = retail * (1 - w) + floor * w;
  }
  retail = Math.max(floor, retail);
  // Salvage is what a scrapyard pays: it is already a trade-in price.
  const trade = Math.max(floor, retail * TRADE_FACTOR);
  return { retail, trade, msrp, ageYears: t, delta: d, isEstimate: true };
}

/** Pure §4 formula with an explicit age, used by tests against the worked examples. */
export function valueAt(msrp: number, d: number, t: number, miles: number, c = 1, k = 1): number {
  const m = 1 - (BETA * (miles - FHWA_MILES_PER_YEAR * t)) / 1000;
  return msrp * Math.exp(-d * t) * m * c * k;
}
