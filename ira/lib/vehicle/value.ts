// Research brief §4 depreciation model:
//   V(t) = MSRP × e^(−δ·t) × m(miles, t) × c(condition) × k(trade)
//   δ_model = −ln(1 − D5_model) / 5
//   m = 1 − β × (miles − 13,476·t) / 1,000
// β = 0.35% per 1,000 miles and k = 0.85 are the brief's placeholders, not sourced
// values. Condition multipliers are our assumption. Every value here is an estimate.

import type { Condition } from "../scoring/types";

const FHWA_MILES_PER_YEAR = 13_476;
const BETA = 0.0035;
export const TRADE_FACTOR = 0.85;

export const CONDITION_FACTOR: Record<Condition, number> = {
  excellent: 1.05,
  good: 1.0,
  fair: 0.9,
  poor: 0.78,
};

const delta = (fiveYearDepreciation: number) => -Math.log(1 - fiveYearDepreciation) / 5;

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

export function deltaFor(make: string, model: string): number {
  if (key(make) === "toyota") return TOYOTA_DELTA[key(model)] ?? ALL_VEHICLES_DELTA;
  return ALL_VEHICLES_DELTA;
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

export function estimateValue(
  input: { make: string; model: string; year: number; mileage: number; condition: Condition; msrp?: number },
  asOf = new Date(),
): ValueEstimate {
  const msrp = input.msrp ?? lookupMsrp(input.make, input.model) ?? 32_000; // fallback: rough market-average base MSRP
  const t = vehicleAgeYears(input.year, asOf);
  const d = deltaFor(input.make, input.model);
  const m = Math.max(0.5, 1 - (BETA * (input.mileage - FHWA_MILES_PER_YEAR * t)) / 1000);
  const retail = msrp * Math.exp(-d * t) * Math.min(m, 1.15) * CONDITION_FACTOR[input.condition];
  return { retail, trade: retail * TRADE_FACTOR, msrp, ageYears: t, delta: d, isEstimate: true };
}

/** Pure §4 formula with an explicit age, used by tests against the worked examples. */
export function valueAt(msrp: number, d: number, t: number, miles: number, c = 1, k = 1): number {
  const m = 1 - (BETA * (miles - FHWA_MILES_PER_YEAR * t)) / 1000;
  return msrp * Math.exp(-d * t) * m * c * k;
}
