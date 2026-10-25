import { payment } from "./scoring/loanMath";
import { TIER_MID_SCORE } from "./scoring/rateModel";
import type { CreditTier, FinancialProfile } from "./scoring/types";

export interface ManualInput {
  firstName: string;
  monthlyIncome: number;
  monthlyDebts: number;
  balance: number;
  apr: number | null; // blank → estimate (design: "leave it blank and we'll estimate")
  monthsLeft: number;
  credit: CreditTier;
  lates: number;
}

/** Research §1: market average for an existing loan when the user doesn't know their APR. */
const AVG_USED_LOAN_APR = 11.19;

export function manualProfile(m: ManualInput): FinancialProfile {
  const apr = m.apr ?? AVG_USED_LOAN_APR;
  const monthlyPayment = payment(m.balance, apr, Math.max(1, m.monthsLeft));
  const originalTerm = Math.max(m.monthsLeft, Math.ceil((m.monthsLeft + 12) / 12) * 12);
  return {
    customerId: "manual",
    name: m.firstName || "You",
    monthlyIncome: m.monthlyIncome,
    monthlyDebtPayments: m.monthlyDebts,
    dti: m.monthlyIncome > 0 ? (m.monthlyDebts + monthlyPayment) / m.monthlyIncome : 1,
    totalBalances: 0,
    savingsBalance: 0,
    onTimePaymentRate: m.lates === 0 ? 1 : Math.max(0, 1 - m.lates / 24),
    latePayments12mo: m.lates,
    creditUtilization: 0.3,
    creditScore: TIER_MID_SCORE[m.credit],
    estCreditTier: m.credit,
    currentAutoLoan: { balance: m.balance, apr, monthlyPayment, monthsRemaining: m.monthsLeft, originalTerm },
    evidence: [
      `You told us about $${Math.round(m.monthlyIncome).toLocaleString()} comes in each month`,
      m.apr === null ? `Rate estimated at ${AVG_USED_LOAN_APR}% (2026 average used-car loan)` : `Your car loan is at ${m.apr}% with ${m.monthsLeft} months left`,
      m.lates ? `${m.lates} late payment${m.lates > 1 ? "s" : ""} in the last 12 months` : "No late payments in the last 12 months",
    ],
    source: "manual",
  };
}
