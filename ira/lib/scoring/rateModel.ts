// Research brief §8 S3: APR_est = Base_used(tier) + adj_LTV + adj_age + adj_term + adj_channel.
// Base rates are Experian Q2 2026 used-vehicle APRs (§1). The adjustment sizes are
// the brief's "informed starting values", not published constants.

import type { CreditTier, LenderChannel, LoanType, MarketRate } from "./types";

export const BASE_USED_APR: Record<CreditTier, number> = {
  superPrime: 6.29,
  prime: 8.81,
  nearPrime: 13.93,
  subprime: 19.1,
  deepSubprime: 21.62,
};

export const TIER_LABEL: Record<CreditTier, string> = {
  superPrime: "Super prime",
  prime: "Prime",
  nearPrime: "Near prime",
  subprime: "Subprime",
  deepSubprime: "Deep subprime",
};

/** VantageScore 4.0 bands from §1. */
export function tierFromScore(score: number): CreditTier {
  if (score >= 781) return "superPrime";
  if (score >= 661) return "prime";
  if (score >= 601) return "nearPrime";
  if (score >= 501) return "subprime";
  return "deepSubprime";
}

/** Midpoint score for a tier, used where §8 S2 needs a score but we only have a tier. */
export const TIER_MID_SCORE: Record<CreditTier, number> = {
  superPrime: 800,
  prime: 720,
  nearPrime: 630,
  subprime: 550,
  deepSubprime: 450,
};

export const NEXT_TIER: Record<CreditTier, CreditTier | null> = {
  deepSubprime: "subprime",
  subprime: "nearPrime",
  nearPrime: "prime",
  prime: "superPrime",
  superPrime: null,
};

export function adjLtv(ltv: number): number {
  if (ltv <= 0.8) return -0.25;
  if (ltv <= 1.0) return 0;
  if (ltv <= 1.15) return 0.5;
  if (ltv <= 1.25) return 1.0;
  return 2.0;
}

export function adjAge(years: number): number {
  if (years <= 3) return -0.25;
  if (years <= 6) return 0;
  if (years <= 8) return 0.5;
  return 1.0;
}

export function adjTerm(months: number): number {
  if (months <= 48) return -0.25;
  if (months <= 72) return 0;
  return 1.5;
}

export const CHANNEL_ADJ: Record<LenderChannel, number> = {
  creditUnion: -0.5,
  bank: 0,
  financeCompany: 0.5,
};

/*
 * ASSUMPTION (extends §8 S3): variable-rate loans start about 0.75 points under a
 * fixed rate and lease buyouts price about 0.5 points over a standard refinance.
 */
export const LOAN_TYPE_ADJ: Record<LoanType, number> = {
  fixed: 0,
  variable: -0.75,
  "cash-out": 0.25,
  "lease-buyout": 0.5,
};

/*
 * ASSUMPTION (extends §8 S3): Gemini's market-rate check is a sanity input, not
 * the source of truth. Half of its gap to the research base rate (60 months, bank)
 * is added, capped at ±1.5 points, so a stale or odd answer can't swing the score.
 */
export function marketAdj(tier: CreditTier, market?: MarketRate | null): number {
  if (!market) return 0;
  const gap = market.typicalApr - BASE_USED_APR[tier];
  return Math.max(-1.5, Math.min(1.5, gap * 0.5));
}

export interface RateEstimate {
  apr: number;
  range: [number, number];
}

/**
 * Likely offered APR. The range spans credit union to finance company and adds
 * ±0.75 points, the §13 target error for the rate estimate. That uncertainty band is
 * our assumption for the "rates you'll likely qualify for" line in the design.
 */
export function estimateApr(
  tier: CreditTier,
  ltv: number,
  vehicleAgeYears: number,
  termMonths: number,
  channel: LenderChannel,
  opts: { market?: MarketRate | null; loanType?: LoanType } = {},
): RateEstimate {
  const core =
    BASE_USED_APR[tier] + adjLtv(ltv) + adjAge(vehicleAgeYears) + adjTerm(termMonths) +
    marketAdj(tier, opts.market) + LOAN_TYPE_ADJ[opts.loanType ?? "fixed"];
  const apr = core + CHANNEL_ADJ[channel];
  const lo = core + CHANNEL_ADJ.creditUnion - 0.75;
  const hi = core + CHANNEL_ADJ.financeCompany + 0.75;
  return { apr: round2(apr), range: [round2(Math.max(0, lo)), round2(hi)] };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
