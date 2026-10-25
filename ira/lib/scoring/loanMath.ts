// Loan math from research brief §6 "Core formulas". Pure functions, no rounding
// until display. All APRs are percents (11.9 means 11.9%).

export const monthlyRate = (apr: number) => apr / 1200;

/** A = P·r / (1 − (1 + r)^−n) */
export function payment(principal: number, apr: number, n: number): number {
  if (n <= 0) return 0;
  const r = monthlyRate(apr);
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** B_k = P·(1 + r)^k − A·((1 + r)^k − 1) / r */
export function balanceAfter(principal: number, apr: number, n: number, k: number): number {
  const r = monthlyRate(apr);
  const a = payment(principal, apr, n);
  if (r === 0) return Math.max(0, principal - a * k);
  const g = Math.pow(1 + r, k);
  return Math.max(0, principal * g - (a * (g - 1)) / r);
}

/** Payoff = B + B·(APR/100)/365 × days since last payment (simple-interest per diem). */
export function payoffAmount(balance: number, apr: number, perDiemDays = 10): number {
  return balance + (balance * (apr / 100) * perDiemDays) / 365;
}

/** PV(A, n, d) = A·(1 − (1 + d/1200)^−n) / (d/1200) */
export function presentValue(a: number, n: number, discountApr: number): number {
  const d = discountApr / 1200;
  if (d === 0) return a * n;
  return (a * (1 - Math.pow(1 + d, -n))) / d;
}

export interface Schedule {
  months: number;
  totalInterest: number;
  totalPaid: number;
  balances: number[]; // balances[0] = principal, balances[k] after k payments
}

/**
 * Amortize with optional extra principal each month. `interestFactor` scales the
 * interest that accrues each month: simple-interest loans paid a few days early
 * accrue slightly less (see engine.ts behaviour notes).
 */
export function amortize(
  principal: number,
  apr: number,
  n: number,
  extra = 0,
  interestFactor = 1,
  feePerMonth = 0,
): Schedule {
  const r = monthlyRate(apr) * interestFactor;
  const a = payment(principal, apr, n);
  const balances = [principal];
  let b = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  let k = 0;
  while (b > 0.005 && k < 600) {
    const interest = b * r;
    const pay = Math.min(b + interest, a + extra);
    b = b + interest - pay;
    totalInterest += interest;
    totalPaid += pay + feePerMonth;
    balances.push(Math.max(0, b));
    k++;
  }
  return { months: k, totalInterest, totalPaid, balances };
}

/** Breakeven months = upfront costs / (A_old − A_new), term-matched only. */
export function breakEvenMonths(upfrontCosts: number, aOld: number, aNew: number): number | null {
  const diff = aOld - aNew;
  if (diff <= 0) return null;
  if (upfrontCosts <= 0) return 0;
  return upfrontCosts / diff;
}
