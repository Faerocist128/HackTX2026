import { Tip } from "@/components/ui/Tip";
import type { Scenario, ScoreResult } from "@/lib/scoring/types";

const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

export function PaymentComparison({ result, scenario }: { result: ScoreResult; scenario: Scenario }) {
  const m = result.metrics;
  const save = m.monthlySavings;
  const be = m.breakEvenMonths;
  // UDAAP note (research §12): headline savings are term-matched and net of fees.
  const summary =
    m.lifetimeInterestDelta >= 0
      ? `${usd(m.lifetimeInterestDelta)} less in interest and fees over the loan.`
      : `${usd(m.lifetimeInterestDelta)} more in interest and fees over the loan. A lower payment isn't always a better deal.`;
  return (
    <section className="card p-6" aria-labelledby="cmp-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cmp-h" className="text-[22px] font-bold">Today vs. after refinancing</h2>
        <span className="font-bold px-3 py-1.5 rounded-full" style={save >= 0 ? { background: "var(--greenSoft)", color: "var(--green)" } : { background: "var(--amberSoft)", color: "var(--amber)" }}>
          {save >= 0 ? `Save ${usd(save)}/mo` : `Pay ${usd(save)}/mo more`}
        </span>
      </div>
      <div className="mt-5 rounded-2xl overflow-x-auto" style={{ boxShadow: "inset 0 0 0 1.5px var(--line)" }}>
        <table className="w-full text-left min-w-[420px]">
          <thead>
            <tr className="hint text-[14px]" style={{ background: "var(--chip)" }}>
              <th className="py-3 px-4 font-semibold">Measure</th>
              <th className="py-3 px-4 font-semibold">Today</th>
              <th className="py-3 px-4 font-semibold">After refinancing</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Monthly payment" now={`${usd(m.currentPayment)}/mo`} next={`${usd(m.newPayment)}/mo`} sub={scenario.extraMonthlyPayment ? `+ $${scenario.extraMonthlyPayment} extra you chose` : undefined} />
            <Row label="Total interest left" tip="The extra money you pay the lender, on top of what you borrowed." now={usd(m.currentInterestLeft)} next={usd(m.newTotalInterest)} />
            <Row
              label="Months until you break even"
              tip={`How long your monthly savings take to pay back the about ${usd(scenario.upfrontCosts)} in fees to refinance. Measured at the same loan length you have now.`}
              now="—"
              next={be === null ? "Never" : `${Math.max(1, Math.ceil(be))} month${Math.ceil(be) === 1 ? "" : "s"}`}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-semibold">{summary}</p>
      <p className="hint mt-1">
        Like for like, keeping your current loan length: {m.termMatchedMonthlySavings >= 0 ? `save ${usd(m.termMatchedMonthlySavings)}/mo` : `pay ${usd(m.termMatchedMonthlySavings)}/mo more`}, worth {m.npvSavings >= 0 ? usd(m.npvSavings) : `−${usd(m.npvSavings)}`} in today&apos;s dollars after fees.
      </p>
    </section>
  );
}

function Row({ label, now, next, tip, sub }: { label: string; now: string; next: string; tip?: string; sub?: string }) {
  return (
    <tr style={{ borderTop: "1px solid var(--line)" }}>
      <th scope="row" className="py-4 px-4 font-semibold text-[15px]"><span className="inline-flex items-center gap-1">{label}{tip && <Tip text={tip} label={label} />}</span></th>
      <td className="py-4 px-4 text-[18px] font-bold" style={{ color: "var(--ink2)" }}>{now}</td>
      <td className="py-4 px-4 text-[22px] font-extrabold">{next}{sub && <span className="block hint font-semibold">{sub}</span>}</td>
    </tr>
  );
}
