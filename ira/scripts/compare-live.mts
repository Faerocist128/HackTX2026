// Compares /api/profile (live Nessie) with the offline fixture for each persona.
import { fixtureProfile } from "../lib/nessie/fixtures";
import { PERSONAS } from "../lib/nessie/personas";

const keys = ["monthlyIncome", "monthlyDebtPayments", "dti", "latePayments12mo", "onTimePaymentRate", "creditUtilization", "estCreditTier"] as const;
for (const p of PERSONAS) {
  const live = await (await fetch(`http://localhost:3000/api/profile?persona=${p.id}`)).json();
  const fix = fixtureProfile(p.id)!;
  const diffs = keys.filter((k) => JSON.stringify(live[k]) !== JSON.stringify(fix[k])).map((k) => `${k}: live ${live[k]} vs fixture ${fix[k]}`);
  if (Math.abs(live.currentAutoLoan.balance - fix.currentAutoLoan.balance) > 0.01) diffs.push("loan balance");
  console.log(`${p.first}: source=${live.source} income=${live.monthlyIncome} debts=${live.monthlyDebtPayments} dti=${live.dti.toFixed(3)} lates=${live.latePayments12mo} → ${diffs.length ? "DIFF " + diffs.join("; ") : "matches fixture"}`);
}
