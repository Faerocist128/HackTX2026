"use client";
import { useState } from "react";
import { POLICY } from "@/lib/scoring/config";
import { amortize, payment } from "@/lib/scoring/loanMath";

const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;
const num = (s: string) => Number(s.replace(/[^0-9.]/g, ""));

/**
 * The home page's live piece: the interest math only, same loan length, typical fees.
 * The full audit adds approval odds, the car's value and the lender's rate range.
 */
export function QuickCheck() {
  const [owe, setOwe] = useState("18,000");
  const [rate, setRate] = useState("9.5");
  const [left, setLeft] = useState("48");
  const [next, setNext] = useState(6.5);

  const P = num(owe), apr = num(rate), n = Math.round(num(left));
  const ok = P >= 1000 && P <= 200_000 && apr > 0 && apr <= 30 && n >= 6 && n <= 96;
  const fees = POLICY.defaultUpfrontCosts;
  const nowInt = ok ? amortize(P, apr, n).totalInterest : 0;
  const newInt = ok ? amortize(P, next, n).totalInterest : 0;
  const saved = nowInt - newInt - fees;
  const payNow = ok ? payment(P, apr, n) : 0;
  const payNew = ok ? payment(P, next, n) : 0;
  const max = Math.max(nowInt, newInt + fees, 1);
  const good = saved >= 0;
  const pct = ((next - 2) / (20 - 2)) * 100;

  return (
    <section className="card p-5 sm:p-7" aria-labelledby="qc-h">
      <h3 id="qc-h" className="text-[20px]">Quick check</h3>
      <p className="hint">Same loan length, typical fees.</p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Num label="You owe" prefix="$" value={owe} onChange={setOwe} />
        <Num label="Your rate" suffix="%" value={rate} onChange={setRate} />
        <Num label="Months left" value={left} onChange={setLeft} />
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="qc-new" className="label">A new rate</label>
          <output htmlFor="qc-new" className="text-[20px] font-bold tabular-nums">{next.toFixed(1)}%</output>
        </div>
        <div className="slider mt-1">
          <div className="track"><div className="done" style={{ width: `${pct}%` }} /></div>
          <input id="qc-new" className="range" type="range" min={2} max={20} step={0.1} value={next} aria-valuetext={`${next.toFixed(1)} percent`} onChange={(e) => setNext(Math.round(Number(e.target.value) * 10) / 10)} />
        </div>
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }} aria-live="polite">
        {ok ? (
          <>
            <p className="text-[32px] sm:text-[36px] font-bold leading-[1.1] tracking-tight" style={{ color: good ? "var(--green)" : "var(--amber)" }}>
              {Math.abs(saved) < 1 ? "About the same" : good ? `Save ${usd(saved)}` : `Costs ${usd(saved)} more`}
            </p>
            <p className="hint mt-1">{usd(payNew)}/mo instead of {usd(payNow)}/mo, after about {usd(fees)} in fees.</p>
            <div className="mt-4 space-y-2" aria-hidden>
              <Bar label="Interest, keeping your loan" value={nowInt} max={max} color="var(--ink2)" />
              <Bar label="Interest and fees, new loan" value={newInt + fees} max={max} color="var(--brand)" />
            </div>
          </>
        ) : (
          <p className="font-semibold" style={{ color: "var(--amber)" }}>Enter a balance from $1,000, a rate up to 30% and 6 to 96 months.</p>
        )}
      </div>
    </section>
  );
}

function Num({ label, value, onChange, prefix, suffix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="relative block mt-1.5">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold" style={{ color: "var(--ink2)" }} aria-hidden>{prefix}</span>}
        <input className="field !min-h-[46px] !text-[16px] tabular-nums" style={{ paddingLeft: prefix ? 24 : 12, paddingRight: suffix ? 26 : 12 }} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 font-semibold" style={{ color: "var(--ink2)" }} aria-hidden>{suffix}</span>}
      </span>
    </label>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[13px]"><span style={{ color: "var(--ink2)" }}>{label}</span><span className="font-bold tabular-nums">{usd(value)}</span></div>
      <div className="mt-1 h-2 rounded-sm overflow-hidden" style={{ background: "var(--chip)" }}>
        <div className="bar h-full rounded-sm" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
