"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { amortize } from "@/lib/scoring/loanMath";
import type { FinancialProfile, Scenario, ScoreResult } from "@/lib/scoring/types";

const usdK = (x: number) => (x >= 1000 ? `$${Math.round(x / 1000)}k` : `$${Math.round(x)}`);
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export function SavingsChart({ profile, scenario, result, compact }: { profile: FinancialProfile; scenario: Scenario; result: ScoreResult; compact?: boolean }) {
  const loan = profile.currentAutoLoan;
  const data = useMemo(() => {
    const cur = amortize(loan.balance, loan.apr, loan.monthsRemaining).balances;
    const principal = result.metrics.payoff + (scenario.loanType === "cash-out" ? scenario.cashOutAmount : 0);
    const nw = amortize(principal, result.metrics.creditedApr, scenario.termMonths, scenario.extraMonthlyPayment).balances;
    const n = Math.max(cur.length, nw.length);
    return Array.from({ length: n }, (_, k) => ({ month: k, current: cur[k] ?? 0, next: nw[k] ?? 0 }));
  }, [loan, scenario, result.metrics.payoff, result.metrics.creditedApr]);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const curEnd = loan.monthsRemaining;
  const newEnd = result.metrics.monthsToPayoff;
  const caption =
    newEnd === curEnd
      ? `Your current loan is paid off in ${curEnd} months. The new loan is paid off in ${newEnd} months, the same time.`
      : `Your current loan is paid off in ${curEnd} months. The new loan is paid off in ${newEnd} months, ${Math.abs(newEnd - curEnd)} months ${newEnd < curEnd ? "sooner" : "later"}.`;

  return (
    <section className={`card ${compact ? "p-4" : "p-6"}`} aria-labelledby="chart-h">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="chart-h" className={`${compact ? "text-[17px]" : "text-[22px]"} font-bold`}>What you still owe over time</h2>
        <div className="flex gap-4 text-[13px] font-semibold" aria-hidden>
          <span className="inline-flex items-center gap-2"><svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="var(--ink2)" strokeWidth="2.5" strokeDasharray="4 3" /></svg>Current loan</span>
          <span className="inline-flex items-center gap-2"><svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="var(--brand)" strokeWidth="3" /></svg>New loan</span>
        </div>
      </div>
      <div className={`mt-3 ${compact ? "h-[150px]" : "h-[240px]"}`} role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--line)" }} tick={{ fill: "var(--ink2)", fontSize: 13 }} tickFormatter={(m) => (m === 0 ? "Now" : `${m} mo`)} interval="preserveStartEnd" minTickGap={40} />
            <YAxis width={48} tickLine={false} axisLine={false} tick={{ fill: "var(--ink2)", fontSize: 13 }} tickFormatter={usdK} />
            <Tooltip formatter={(v, name) => [usd(Number(v)), name === "current" ? "Current loan" : "New loan"]} labelFormatter={(m) => (m === 0 ? "Now" : `Month ${m}`)} contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} />
            <Line type="monotone" dataKey="current" stroke="var(--ink2)" strokeWidth={2.5} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="next" stroke="var(--brand)" strokeWidth={3} dot={false} isAnimationActive={!reduceMotion} animationDuration={450} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className={`hint ${compact ? "mt-2 text-[13px]" : "mt-3"}`}>{caption}</p>
    </section>
  );
}
