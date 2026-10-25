// Prints each persona's normalized profile and both scores, for tuning and hand checks.
import { scoreRefinance } from "../lib/scoring/engine";
import { defaultScenario, personaVehicle } from "../lib/scoring/defaults";
import { payment } from "../lib/scoring/loanMath";
import { normalize } from "../lib/nessie/normalize";
import { PERSONAS, personaBundle } from "../lib/nessie/personas";

for (const p of PERSONAS) {
  const profile = normalize(personaBundle(p, payment(p.loan.amount, p.loan.apr, p.loan.term)));
  const vehicle = personaVehicle(p);
  const r0 = scoreRefinance({ profile, vehicle, scenario: defaultScenario(profile) });
  const scenario = defaultScenario(profile, r0.metrics.likelyApr);
  const r = scoreRefinance({ profile, vehicle, scenario });
  const m = r.metrics;
  console.log(`\n${p.first} (target ${p.targetBand}) → odds ${r.odds.score} ${r.odds.band} · value ${r.worth.score} ${r.worth.band} · ${r.verdict} · approval ${r.approval}`);
  console.log(`  income ${profile.monthlyIncome} debts ${profile.monthlyDebtPayments} tier ${profile.estCreditTier} lates ${profile.latePayments12mo} util ${profile.creditUtilization.toFixed(2)}`);
  console.log(`  loan bal ${profile.currentAutoLoan.balance.toFixed(0)} @${profile.currentAutoLoan.apr}% pmt ${profile.currentAutoLoan.monthlyPayment.toFixed(2)} rem ${profile.currentAutoLoan.monthsRemaining}`);
  console.log(`  car value ${vehicle.estValue} ltv ${m.ltv.toFixed(2)} likely ${m.likelyApr} [${m.likelyAprRange}] term ${scenario.termMonths} npv ${m.npvSavings.toFixed(0)} life ${m.lifetimeInterestDelta.toFixed(0)} dti ${m.dti.toFixed(2)} pti ${m.pti.toFixed(2)}`);
  console.log("  odds  " + r.odds.factors.map((f) => `${f.key}:${f.points}/${f.maxPoints}`).join(" "));
  console.log("  value " + r.worth.factors.map((f) => `${f.key}:${f.points}/${f.maxPoints}`).join(" "));
  if (r.knockouts.length) console.log("  KO:", r.knockouts.join(" | "));
}
