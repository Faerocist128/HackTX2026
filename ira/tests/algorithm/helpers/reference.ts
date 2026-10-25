/*
 * Independent reference implementation for expected values.
 * Written from the research brief (§6 formulas, §8 S2/S3/S5 tables) without
 * importing anything from lib/, so a bug in the engine can't leak into an
 * expected value.
 */

export type Tier = "superPrime" | "prime" | "nearPrime" | "subprime" | "deepSubprime";
export type Channel = "creditUnion" | "bank" | "financeCompany";
export type LoanKind = "fixed" | "variable" | "cash-out" | "lease-buyout";

// ── §6 core formulas ────────────────────────────────────────────────────────

/** Level payment A = P·r / (1 − (1+r)^−n), r = APR/1200; P/n when the rate is 0. */
export function refPayment(principal: number, aprPct: number, n: number): number {
  if (n <= 0) throw new Error("n must be positive");
  const r = aprPct / 1200;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

/** Payoff = B + B·APR/100/365 × days (simple-interest per diem, 10 days by default). */
export function refPayoff(balance: number, aprPct: number, days = 10): number {
  return balance + (balance * aprPct * days) / 36_500;
}

/** PV of a level payment A for n months at discount APR d (percent). */
export function refPV(a: number, n: number, dPct: number): number {
  const d = dPct / 1200;
  if (d === 0) return a * n;
  return (a * (1 - (1 + d) ** -n)) / d;
}

/** Balance after k level payments (closed form). */
export function refBalanceAfter(principal: number, aprPct: number, n: number, k: number): number {
  const r = aprPct / 1200;
  const a = refPayment(principal, aprPct, n);
  if (r === 0) return Math.max(0, principal - a * k);
  return principal * (1 + r) ** k - (a * ((1 + r) ** k - 1)) / r;
}

/**
 * Month-by-month schedule kept in integer cents, the way a servicer posts it:
 * payment rounded to the cent, interest rounded to the cent each month, last
 * payment trimmed to the balance. Used to bound the engine's unrounded float math.
 */
export function refCentSchedule(principal: number, aprPct: number, n: number, extra = 0) {
  let bal = Math.round(principal * 100);
  const pay = Math.round(refPayment(principal, aprPct, n) * 100) + Math.round(extra * 100);
  const r = aprPct / 1200;
  let interestC = 0, principalC = 0, months = 0;
  while (bal > 0 && months < 1_000) {
    const i = Math.round(bal * r);
    const p = Math.min(bal, pay - i);
    if (p <= 0) throw new Error("payment does not cover interest");
    bal -= p;
    interestC += i;
    principalC += p;
    months++;
  }
  return { months, totalInterest: interestC / 100, totalPrincipal: principalC / 100 };
}

/** Total interest of a level-payment loan with no extras: n·A − P. */
export const refTotalInterest = (principal: number, aprPct: number, n: number) =>
  refPayment(principal, aprPct, n) * n - principal;

// ── §8 S3 rate table (transcribed from the brief, not from rateModel.ts) ─────

export const SPEC_BASE: Record<Tier, number> = {
  superPrime: 6.29, prime: 8.81, nearPrime: 13.93, subprime: 19.1, deepSubprime: 21.62,
};

export function specLtvAdj(ltv: number) {
  return ltv <= 0.8 ? -0.25 : ltv <= 1.0 ? 0 : ltv <= 1.15 ? 0.5 : ltv <= 1.25 ? 1.0 : 2.0;
}
export function specAgeAdj(years: number) {
  return years <= 3 ? -0.25 : years <= 6 ? 0 : years <= 8 ? 0.5 : 1.0;
}
export function specTermAdj(months: number) {
  return months <= 48 ? -0.25 : months <= 72 ? 0 : 1.5;
}
export const SPEC_CHANNEL: Record<Channel, number> = { creditUnion: -0.5, bank: 0, financeCompany: 0.5 };
/** ASSUMPTION in the code comments (extends S3). */
export const SPEC_LOAN_TYPE: Record<LoanKind, number> = { fixed: 0, variable: -0.75, "cash-out": 0.25, "lease-buyout": 0.5 };

export function specMarketAdj(tier: Tier, typicalApr?: number) {
  if (typicalApr === undefined) return 0;
  return Math.max(-1.5, Math.min(1.5, (typicalApr - SPEC_BASE[tier]) * 0.5));
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Likely APR and range: credit union core − 0.75 to finance company core + 0.75. */
export function specRate(
  tier: Tier, ltv: number, ageYears: number, term: number, channel: Channel,
  loanType: LoanKind = "fixed", typicalApr?: number,
) {
  const core = SPEC_BASE[tier] + specLtvAdj(ltv) + specAgeAdj(ageYears) + specTermAdj(term) +
    specMarketAdj(tier, typicalApr) + SPEC_LOAN_TYPE[loanType];
  return {
    apr: r2(core + SPEC_CHANNEL[channel]),
    lo: r2(Math.max(0, core - 0.5 - 0.75)),
    hi: r2(core + 0.5 + 0.75),
  };
}

// ── §8 S2 approval rules ─────────────────────────────────────────────────────

export function specApproval(x: { score: number; dti: number; pti: number; ltv: number; lates: number; mileage: number }) {
  if (x.score >= 661 && x.dti <= 0.45 && x.pti <= 0.15 && x.ltv <= 1.2 && x.lates === 0 && x.mileage <= 100_000) return "high";
  if (x.score >= 601 && x.dti <= 0.5 && x.pti <= 0.2 && x.ltv <= 1.3 && x.lates <= 1) return "medium";
  return "low";
}

/** VantageScore 4.0 tier bands (§1). */
export function specTier(score: number): Tier {
  return score >= 781 ? "superPrime" : score >= 661 ? "prime" : score >= 601 ? "nearPrime" : score >= 501 ? "subprime" : "deepSubprime";
}

/** Vehicle age: model year starts Oct 1 of the prior calendar year; 365.25-day years. */
export function specAgeYears(modelYear: number, asOf: Date) {
  const start = new Date(modelYear - 1, 9, 1).getTime();
  return Math.max(0, (asOf.getTime() - start) / (365.25 * 86_400_000));
}

/** asOf date at which a model year is exactly `years` old. */
export function asOfForAge(modelYear: number, years: number) {
  return new Date(new Date(modelYear - 1, 9, 1).getTime() + years * 365.25 * 86_400_000);
}

/** §6 NPV savings exactly as the brief writes it (no cash-out term). */
export function specNpv(aOld: number, nRem: number, aNew: number, dPct: number, costs: number, refunds: number) {
  return refPV(aOld, nRem, dPct) - refPV(aNew, nRem, dPct) - costs + refunds;
}

// ── Rate-ask multiplier (config.ts ASSUMPTION extending §8 S3) ───────────────
/**
 * Share of lenders likely to offer the target APR: 1 at or above the likely rate,
 * falling linearly to 0.85 at the low end of the likely range, then 0.85·e^(−gap/2).
 */
export function specRateAsk(target: number, likelyApr: number, lo: number): number {
  if (target >= likelyApr) return 1;
  if (target >= lo) return 1 - ((likelyApr - target) / (likelyApr - lo)) * 0.15;
  return 0.85 * Math.exp(-(lo - target) / 2);
}
