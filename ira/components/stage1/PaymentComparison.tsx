import { Tip } from "@/components/ui/Tip";
import type { Scenario, ScoreResult } from "@/lib/scoring/types";

const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

/**
 * Keeping the current loan vs. the loan the sliders describe. Every row compares
 * the same two loans, and the bottom line is exactly interest(today) − interest(new) − fees.
 */
export function PaymentComparison({ result, scenario }: { result: ScoreResult; scenario: Scenario }) {
  const m = result.metrics;
  const change = m.currentPayment - m.newPayment; // > 0: payment goes down
  const flat = Math.abs(change) < 1;
  const total = m.lifetimeInterestDelta; // > 0: refinancing costs less overall
  const be = m.breakEvenMonthsScenario;
  const cashOut = scenario.loanType === "cash-out" ? scenario.cashOutAmount : 0;

  // UDAAP note (research §12): lead with total cost, not just the monthly payment.
  const bottomLine =
    Math.abs(total) < 1
      ? "Overall you'd pay about the same in interest and fees as keeping your current loan."
      : `Overall you'd pay ${usd(total)} ${total > 0 ? "less" : "more"} in interest and fees than keeping your current loan.`;
  const paymentLine = flat
    ? "Your required payment stays about the same."
    : `Your required payment goes ${change > 0 ? "down" : "up"} ${usd(change)} a month.${
        change > 0 && be !== null && scenario.upfrontCosts > 0
          ? ` The ${usd(scenario.upfrontCosts)} fee pays for itself in ${months(Math.max(1, Math.ceil(be)))}.`
          : ""
      }`;

  return (
    <section className="card p-6" aria-labelledby="cmp-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cmp-h" className="text-[22px] font-bold">Today vs. after refinancing</h2>
        <span className="font-bold px-3 py-1.5 rounded-full" style={total >= 0 ? { background: "var(--greenSoft)", color: "var(--green)" } : { background: "var(--amberSoft)", color: "var(--amber)" }}>
          {total >= 0 ? `Save ${usd(total)} overall` : `Costs ${usd(total)} more overall`}
        </span>
      </div>
      <p className="hint mt-1">Keeping your current loan vs. the new loan you set up with the sliders.</p>
      <div className="mt-5 rounded-2xl overflow-x-auto" style={{ boxShadow: "inset 0 0 0 1.5px var(--line)" }}>
        <table className="w-full text-left">
          <thead>
            <tr className="hint text-[14px]" style={{ background: "var(--chip)" }}>
              <th className="py-3 px-3 sm:px-4 font-semibold"><span className="sr-only">Measure</span></th>
              <th className="py-3 px-3 sm:px-4 font-semibold">Keep current loan</th>
              <th className="py-3 px-3 sm:px-4 font-semibold">Refinance</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Monthly payment" now={`${usd(m.currentPayment)}/mo`} next={`${usd(m.newPayment)}/mo`} sub={scenario.extraMonthlyPayment ? `+ $${scenario.extraMonthlyPayment} extra you chose` : undefined} />
            <Row label="Months to pay off" now={months(m.currentMonthsLeft)} next={months(m.monthsToPayoff)} />
            <Row label="Total interest" tip="The extra money you pay the lender, on top of what you borrowed." now={usd(m.currentInterestLeft)} next={usd(m.newTotalInterest)} sub={cashOut ? `Includes interest on the ${usd(cashOut)} cash out` : undefined} />
            <Row
              label="Fees"
              tip="Typical title, lien and lender fees to refinance. Paying late adds late fees."
              now="$0"
              next={usd(m.newFees)}
              sub={scenario.paymentBehavior === "late" ? "Includes expected late fees" : undefined}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-semibold">{bottomLine}</p>
      <p className="hint mt-1">{paymentLine}</p>
      {change > 0 && total < 0 && (
        <p className="hint mt-1">Spreading the loan over more months lowers the payment but costs more in total.</p>
      )}
    </section>
  );
}

function Row({ label, now, next, tip, sub }: { label: string; now: string; next: string; tip?: string; sub?: string }) {
  return (
    <tr style={{ borderTop: "1px solid var(--line)" }}>
      <th scope="row" className="py-4 px-3 sm:px-4 font-semibold text-[15px]"><span className="inline-flex items-center gap-1">{label}{tip && <Tip text={tip} label={label} />}</span></th>
      <td className="py-4 px-3 sm:px-4 text-[16px] sm:text-[18px] font-bold" style={{ color: "var(--ink2)" }}>{now}</td>
      <td className="py-4 px-3 sm:px-4 text-[18px] sm:text-[22px] font-extrabold">{next}{sub && <span className="block hint font-semibold">{sub}</span>}</td>
    </tr>
  );
}
