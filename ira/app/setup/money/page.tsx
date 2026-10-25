"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome/Header";
import { Tip } from "@/components/ui/Tip";
import type { ManualInput } from "@/lib/nessie/personas";
import { useAuditStore, useHydrated } from "@/lib/store";
import type { CreditTier, FinancialProfile } from "@/lib/scoring/types";

interface PersonaRow { id: string; name: string; first: string; blurb: string }
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export default function MoneyPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, personaId, manualInput, setProfile } = useAuditStore();
  const [personas, setPersonas] = useState<PersonaRow[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [own, setOwn] = useState(false);
  const [form, setForm] = useState({ firstName: "", income: "", debts: "", balance: "", apr: "", months: "48", credit: "prime" as CreditTier, lates: "0" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setPersonas).catch(() => setError("We couldn't load the demo people. Try refreshing."));
  }, []);
  // Editing your own info: open the form filled in with what you typed last time.
  useEffect(() => {
    if (!hydrated || personaId !== "manual") return;
    setOwn(true);
    if (manualInput)
      setForm({
        firstName: manualInput.firstName,
        income: String(manualInput.monthlyIncome),
        debts: String(manualInput.monthlyDebts),
        balance: String(manualInput.balance),
        apr: manualInput.apr === null ? "" : String(manualInput.apr),
        months: String(manualInput.monthsLeft),
        credit: manualInput.credit,
        lates: String(manualInput.lates),
      });
  }, [hydrated, personaId, manualInput]);

  async function pick(id: string) {
    setOwn(false);
    setError(null);
    setLoading(id);
    try {
      const res = await fetch(`/api/profile?persona=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setProfile(json as FinancialProfile, id);
    } catch (e) {
      setError((e as Error).message || "We couldn't load that profile from the bank. Try again.");
    } finally {
      setLoading(null);
    }
  }

  const n = (s: string) => Number(s.replace(/[$,\s]/g, ""));
  const manualValid = n(form.income) > 0 && n(form.balance) > 0 && n(form.months) > 0 && !Number.isNaN(n(form.debts) || 0);
  async function next() {
    if (own) {
      const m: ManualInput = {
        firstName: form.firstName.trim(),
        monthlyIncome: n(form.income),
        monthlyDebts: n(form.debts) || 0,
        balance: n(form.balance),
        apr: form.apr.trim() ? n(form.apr) : null,
        monthsLeft: Math.round(n(form.months)),
        credit: form.credit,
        lates: Number(form.lates),
      };
      // Unchanged since the last save: reuse the Nessie customer instead of creating another.
      if (!(personaId === "manual" && profile && JSON.stringify(m) === JSON.stringify(manualInput))) {
        setSaving(true);
        setError(null);
        try {
          const res = await fetch("/api/profile/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          setProfile(json as FinancialProfile, "manual", m);
        } catch (e) {
          setError((e as Error).message || "We couldn't save your info to the bank. Try again.");
          return;
        } finally {
          setSaving(false);
        }
      }
    }
    router.push("/setup/car");
  }

  const sel = hydrated && !own && personaId !== "manual" ? profile : null;
  const canNext = (own ? manualValid : !!sel) && !saving;

  return (
    <>
      <Header step={1} />
      <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-10 py-10">
        <h1 className="text-[34px] sm:text-[40px] font-extrabold">Your money</h1>
        <p className="mt-2 max-w-[560px]" style={{ color: "var(--ink2)" }}>Pick a demo person to explore, or use your own info. Everything is loaded from and saved to a demo bank account. This doesn&apos;t check your credit.</p>

        <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Choose a profile">
          {(personas ?? Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, name: "", first: "", blurb: "" }))).map((p) => {
            const active = !own && personaId === p.id;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={active}
                disabled={!personas || !!loading}
                onClick={() => pick(p.id)}
                className="card p-5 text-left relative transition-shadow"
                style={{ boxShadow: active ? "inset 0 0 0 2px var(--brand), var(--shadow)" : undefined, minHeight: 168 }}
              >
                {personas ? (
                  <>
                    <span className="w-11 h-11 rounded-full inline-flex items-center justify-center font-extrabold" style={{ background: "var(--redSoft)", color: "var(--redInk)" }}>{p.first[0]}</span>
                    {active && <span className="absolute top-5 right-5 w-7 h-7 rounded-full inline-flex items-center justify-center text-white" style={{ background: "var(--brand)" }} aria-hidden>✓</span>}
                    <div className="mt-4 font-bold text-[18px]">{p.name}</div>
                    <div className="mt-1 hint">{loading === p.id ? "Loading from the bank…" : p.blurb}</div>
                  </>
                ) : (
                  <div className="space-y-3"><div className="shimmer w-11 !h-11 !rounded-full" /><div className="shimmer w-2/3" /><div className="shimmer" /></div>
                )}
              </button>
            );
          })}
          <button role="radio" aria-checked={own} onClick={() => setOwn(true)} className="card p-5 text-left relative" style={{ boxShadow: own ? "inset 0 0 0 2px var(--brand), var(--shadow)" : undefined, minHeight: 168 }}>
            <span className="w-11 h-11 rounded-full inline-flex items-center justify-center font-extrabold text-[22px]" style={{ background: "var(--chip)", color: "var(--ink2)" }}>+</span>
            <div className="mt-4 font-bold text-[18px]">Use my own info</div>
            <div className="mt-1 hint">Type in a few rough numbers. Takes about a minute.</div>
          </button>
        </div>

        {error && <p role="alert" className="mt-5 font-semibold" style={{ color: "var(--redInk)" }}>{error}</p>}

        {sel && (
          <section className="card p-6 mt-8 rise" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[22px] font-bold">Here&apos;s what we see for {sel.name.split(" ")[0]}</h2>
              <span className="text-[13px] font-bold px-3 py-1 rounded-full" style={{ background: "var(--greenSoft)", color: "var(--green)" }}>
                ✓ Loaded from the bank
              </span>
            </div>
            <dl className="mt-5 grid gap-4 grid-cols-2 lg:grid-cols-5">
              <Stat label="Money coming in each month" value={usd(sel.monthlyIncome)} />
              <Stat label="Monthly debt payments" value={usd(sel.monthlyDebtPayments)} />
              <Stat label="Left to pay on your car" value={usd(sel.currentAutoLoan.balance)} />
              <Stat label="Interest rate (APR)" value={`${sel.currentAutoLoan.apr}%`} tip="The yearly cost of borrowing, shown as a percent of what you owe." />
              <Stat label="Paying on time" value={sel.latePayments12mo ? `${sel.latePayments12mo} late in 12 mo` : "Always on time"} />
            </dl>
            <ul className="mt-5 space-y-1 hint">
              {sel.evidence.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          </section>
        )}

        {own && (
          <section className="card p-6 mt-8 rise">
            <h2 className="text-[22px] font-bold">Tell us a little about your money</h2>
            <p className="hint mt-1">Rough numbers are fine. You can change them later. We save them to a demo bank account.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="First name (optional)" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <Field label="Money coming in each month" prefix="$" value={form.income} onChange={(v) => setForm({ ...form, income: v })} inputMode="decimal" hint="Before taxes." />
              <Field label="Monthly debt payments" prefix="$" value={form.debts} onChange={(v) => setForm({ ...form, debts: v })} inputMode="decimal" hint="Rent or mortgage, cards, other loans. Not your car." />
              <Field label="Left to pay on your car" prefix="$" value={form.balance} onChange={(v) => setForm({ ...form, balance: v })} inputMode="decimal" />
              <Field label="Interest rate (APR)" suffix="%" value={form.apr} onChange={(v) => setForm({ ...form, apr: v })} inputMode="decimal" hint="Not sure of your rate? It's on your monthly loan statement, or leave it blank and we'll estimate." />
              <Field label="Months left on your loan" value={form.months} onChange={(v) => setForm({ ...form, months: v })} inputMode="numeric" />
              <label className="block">
                <span className="label">How&apos;s your credit?</span>
                <select className="field mt-2" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value as CreditTier })}>
                  <option value="superPrime">Excellent (781+)</option>
                  <option value="prime">Good (661–780)</option>
                  <option value="nearPrime">Fair (601–660)</option>
                  <option value="subprime">Rebuilding (501–600)</option>
                  <option value="deepSubprime">Just starting (500 or less)</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Late payments in the last year</span>
                <select className="field mt-2" value={form.lates} onChange={(e) => setForm({ ...form, lates: e.target.value })}>
                  <option value="0">None</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3 or more</option>
                </select>
              </label>
            </div>
          </section>
        )}

        <div className="mt-8 flex justify-between gap-4">
          <button className="btn btn-ghost" onClick={() => router.push("/")}>Back</button>
          <button className="btn btn-primary" disabled={!canNext} onClick={next}>{saving ? "Saving…" : <>Next: Your car <span aria-hidden>→</span></>}</button>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--chip)" }}>
      <dt className="hint flex items-center gap-1">{label}{tip && <Tip text={tip} label={label} />}</dt>
      <dd className="mt-1 text-[22px] font-extrabold">{value}</dd>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; hint?: string; inputMode?: "decimal" | "numeric" }) {
  return (
    <label className="block">
      <span className="label">{props.label}</span>
      <div className="relative mt-2">
        {props.prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 hint">{props.prefix}</span>}
        <input className="field" style={{ paddingLeft: props.prefix ? 30 : undefined }} value={props.value} inputMode={props.inputMode} onChange={(e) => props.onChange(e.target.value)} />
        {props.suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 hint">{props.suffix}</span>}
      </div>
      {props.hint && <span className="hint block mt-1.5">{props.hint}</span>}
    </label>
  );
}
