/*
 * Raw Nessie → FinancialProfile. Nessie is a mock bank: it has no credit score
 * field on customers, no APR or term on loans, no due dates on bills and no card
 * limits. Every derivation is listed here so judges can check it by hand.
 *
 *  monthlyIncome        Completed deposits described as payroll/salary/direct deposit
 *                       over the last 6 full calendar months ÷ 6. Treated as gross income.
 *  monthlyDebtPayments  Recurring bills tagged "debt" (rent, card minimums, other
 *                       loans). If a bill has no tag, payee matches
 *                       /rent|mortgage|card|loan/ count as debt. Excludes the car loan.
 *  dti                  (debts + current car payment) ÷ income.
 *  onTimePaymentRate    Completed bills paid on or before their due date ÷ all
 *                       completed bills in the last 12 months.
 *  latePayments12mo     Completed bills paid 30+ days after their due date, last 12 months.
 *                       Due date comes from "due YYYY-MM-DD" in the bill nickname,
 *                       falling back to recurring_date in the payment month.
 *  creditUtilization    Σ card balances ÷ Σ card limits ("limit N" in the account nickname).
 *  creditScore          Nessie *loans* carry a credit_score; we use the auto loan's.
 *  estCreditTier        VantageScore 4.0 band of that score (research §1). With no
 *                       score, derived from on-time rate, utilization and DTI.
 *  currentAutoLoan      Nessie loan type "auto". APR, term and payments made are read
 *                       from "apr x | term n | paid k" in its description; balance
 *                       is the amortized balance after k payments (research §6 B_k).
 */

import { balanceAfter, payment } from "../scoring/loanMath";
import { tierFromScore } from "../scoring/rateModel";
import type { CreditTier, FinancialProfile } from "../scoring/types";
import type { NessieBill, NessieBundle } from "./types";

const DAY = 86_400_000;
const num = (s: string | undefined, re: RegExp) => {
  const m = s?.match(re);
  return m ? Number(m[1]) : undefined;
};

function dueDate(b: NessieBill): Date | null {
  const tagged = b.nickname?.match(/due (\d{4}-\d{2}-\d{2})/);
  if (tagged) return new Date(tagged[1] + "T00:00:00");
  if (b.payment_date && b.recurring_date) {
    const p = new Date(b.payment_date + "T00:00:00");
    return new Date(p.getFullYear(), p.getMonth(), b.recurring_date);
  }
  return null;
}

const isDebtBill = (b: NessieBill) =>
  /\| debt\b/.test(b.nickname ?? "") ||
  (!/\| (debt|other)\b/.test(b.nickname ?? "") && /rent|mortgage|card|loan/i.test(b.payee));

export function normalize(raw: NessieBundle, asOf = new Date()): FinancialProfile {
  const allBills = Object.values(raw.bills).flat();
  const allDeposits = Object.values(raw.deposits).flat();
  const allLoans = Object.values(raw.loans).flat();
  const evidence: string[] = [];

  // Income
  // Six full calendar months before the current one.
  const winStart = new Date(asOf.getFullYear(), asOf.getMonth() - 6, 1).getTime();
  const winEnd = new Date(asOf.getFullYear(), asOf.getMonth(), 1).getTime();
  const payroll = allDeposits.filter((d) => {
    const t = new Date(d.transaction_date + "T00:00:00").getTime();
    return d.status !== "cancelled" && /payroll|salary|direct deposit|paycheck/i.test(d.description) && t >= winStart && t < winEnd;
  });
  const monthlyIncome = Math.round(payroll.reduce((s, d) => s + d.amount, 0) / 6);
  evidence.push(`${payroll.length} payroll deposits in the last 6 months, about $${monthlyIncome.toLocaleString()}/month`);

  // Debts (recurring bills only, to avoid double counting the history)
  const recurring = allBills.filter((b) => b.status === "recurring");
  const debtBills = recurring.filter(isDebtBill);
  const monthlyDebtPayments = Math.round(debtBills.reduce((s, b) => s + b.payment_amount, 0));

  // Payment history
  const yearAgo = asOf.getTime() - 365 * DAY;
  const history = allBills.filter(
    (b) => b.status === "completed" && b.payment_date && new Date(b.payment_date).getTime() >= yearAgo,
  );
  let onTime = 0;
  const lates: { payee: string; date: string; days: number }[] = [];
  for (const b of history) {
    const due = dueDate(b);
    const paid = new Date(b.payment_date + "T00:00:00");
    const days = due ? Math.round((paid.getTime() - due.getTime()) / DAY) : 0;
    if (days <= 0) onTime++;
    if (days >= 30) lates.push({ payee: b.payee, date: b.payment_date!, days });
  }
  const onTimePaymentRate = history.length ? onTime / history.length : 1;
  for (const l of lates.slice(0, 3)) {
    const when = new Date(l.date + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
    evidence.push(`${l.payee} bill paid ${l.days} days late in ${when}`);
  }
  if (!lates.length) evidence.push(`All ${history.length} bills in the last 12 months paid on time`);

  // Utilization
  const cards = raw.accounts.filter((a) => a.type === "Credit Card");
  const limits = cards.reduce((s, a) => s + (num(a.nickname, /limit (\d+)/) ?? 0), 0);
  const cardBal = cards.reduce((s, a) => s + a.balance, 0);
  const creditUtilization = limits > 0 ? cardBal / limits : 0;
  if (cards.length) evidence.push(`Credit cards at ${Math.round(creditUtilization * 100)}% of their limits ($${cardBal.toLocaleString()} of $${limits.toLocaleString()})`);

  const savingsBalance = raw.accounts.filter((a) => a.type === "Savings").reduce((s, a) => s + a.balance, 0);
  const totalBalances = raw.accounts.reduce((s, a) => s + (a.type === "Credit Card" ? 0 : a.balance), 0);

  // Auto loan
  const auto = allLoans.find((l) => l.type === "auto" && l.status !== "declined");
  const apr = num(auto?.description, /apr ([\d.]+)/) ?? 0;
  const term = num(auto?.description, /term (\d+)/) ?? 60;
  const paid = num(auto?.description, /paid (\d+)/) ?? 0;
  const amount = auto?.amount ?? 0;
  const monthlyPayment = auto?.monthly_payment || payment(amount, apr, term);
  const balance = balanceAfter(amount, apr, term, paid);
  if (auto) evidence.push(`Car loan: ${paid} payments made at ${apr}% APR, ${term - paid} months left`);

  const dti = monthlyIncome > 0 ? (monthlyDebtPayments + monthlyPayment) / monthlyIncome : 1;

  const creditScore = auto?.credit_score || undefined;
  const estCreditTier: CreditTier = creditScore ? tierFromScore(creditScore) : proxyTier(onTimePaymentRate, creditUtilization, dti, lates.length);

  return {
    customerId: raw.customer._id,
    name: `${raw.customer.first_name} ${raw.customer.last_name}`.trim(),
    monthlyIncome,
    monthlyDebtPayments,
    dti,
    totalBalances,
    savingsBalance,
    onTimePaymentRate,
    latePayments12mo: lates.length,
    creditUtilization,
    creditScore,
    estCreditTier,
    currentAutoLoan: {
      balance: Math.round(balance * 100) / 100,
      apr,
      monthlyPayment,
      monthsRemaining: Math.max(0, term - paid),
      originalTerm: term,
      originalAmount: amount,
      subsidized: /subsidized/i.test(auto?.description ?? ""),
    },
    evidence,
    source: "nessie",
  };
}

/** Fallback tier when no score exists: payment history and utilization drive ~65% of bureau scores. */
function proxyTier(onTime: number, util: number, dti: number, lates: number): CreditTier {
  let pts = 0;
  pts += onTime >= 0.98 ? 3 : onTime >= 0.9 ? 2 : onTime >= 0.8 ? 1 : 0;
  pts += util <= 0.1 ? 3 : util <= 0.3 ? 2 : util <= 0.6 ? 1 : 0;
  pts += dti <= 0.36 ? 1 : 0;
  pts -= Math.min(2, lates);
  if (pts >= 6) return "superPrime";
  if (pts >= 4) return "prime";
  if (pts >= 2) return "nearPrime";
  if (pts >= 0) return "subprime";
  return "deepSubprime";
}
