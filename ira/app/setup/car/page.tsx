"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer, Header } from "@/components/chrome/Header";
import { useAuditStore, useHydrated } from "@/lib/store";
import type { Condition, Vehicle } from "@/lib/scoring/types";
import { MSRP_BASELINE } from "@/lib/vehicle/value";

const CONDITIONS: { id: Condition; label: string; desc: string }[] = [
  { id: "excellent", label: "Excellent", desc: "Looks almost new. No dents or warning lights." },
  { id: "good", label: "Good", desc: "Normal wear. A few small scratches." },
  { id: "fair", label: "Fair", desc: "Some dents, worn inside, or needs minor repairs." },
  { id: "poor", label: "Poor", desc: "Major damage or mechanical problems." },
];
const YEARS = Array.from({ length: 17 }, (_, i) => 2027 - i);
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase()).replace("Rav4", "RAV4").replace("Cr-V", "CR-V").replace("Hr-V", "HR-V").replace("Gr ", "GR ").replace("4runner", "4Runner");
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

interface PersonaRow { id: string; vehicle: Omit<Vehicle, "estValue"> }
interface VehicleResponse { vehicle: Vehicle; history: { openRecalls: string[] }; historySource: string; error?: string }

export default function CarPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, personaId, vehicle: saved, setVehicle } = useAuditStore();
  const [mode, setMode] = useState<"vin" | "ymm">("ymm");
  const [vin, setVin] = useState("");
  const [year, setYear] = useState(2021);
  const [make, setMake] = useState("toyota");
  const [model, setModel] = useState("camry");
  const [mileage, setMileage] = useState("45000");
  const [condition, setCondition] = useState<Condition>("good");
  const [found, setFound] = useState<VehicleResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No profile yet → back to step 1.
  useEffect(() => { if (hydrated && !profile) router.replace("/setup/money"); }, [hydrated, profile, router]);

  // Prefill from the persona's car (or the saved one).
  useEffect(() => {
    if (!hydrated) return;
    const apply = (v: Omit<Vehicle, "estValue">) => {
      setYear(v.year); setMake(v.make.toLowerCase()); setModel(v.model.toLowerCase()); setMileage(String(v.mileage)); setCondition(v.condition);
      if (v.vin) { setVin(v.vin); }
    };
    if (saved) { apply(saved); return; }
    if (personaId) fetch("/api/profile").then((r) => r.json()).then((rows: PersonaRow[]) => { const p = rows.find((r) => r.id === personaId); if (p) apply(p.vehicle); });
  }, [hydrated, personaId, saved]);

  const models = useMemo(() => Object.keys(MSRP_BASELINE[make] ?? {}), [make]);
  const miles = Number(mileage.replace(/[,\s]/g, ""));
  const vinOk = /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim());
  const ready = Number.isFinite(miles) && miles >= 0 && (mode === "vin" ? vinOk : !!model);

  // Re-estimate whenever inputs settle.
  useEffect(() => {
    if (!ready) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        const body = mode === "vin" ? { vin: vin.trim(), mileage: miles, condition } : { year, make: title(make), model: title(model), mileage: miles, condition };
        const res = await fetch("/api/vehicle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        const json = (await res.json()) as VehicleResponse;
        if (!res.ok) { setFound(null); setError(json.error ?? "We couldn't find that car."); }
        else setFound(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("We couldn't reach the vehicle lookup. Try year, make and model.");
      } finally { if (!ctl.signal.aborted) setBusy(false); }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [ready, mode, vin, year, make, model, miles, condition]);

  function next() {
    if (!found) return;
    setVehicle(found.vehicle);
    router.push("/audit");
  }

  return (
    <>
      <Header step={2} />
      <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-10 py-10 grid gap-8 lg:grid-cols-[1.5fr_1fr] items-start">
        <div>
          <h1 className="text-[34px] sm:text-[40px] font-extrabold">Your car</h1>
          <p className="mt-2" style={{ color: "var(--ink2)" }}>We use this to estimate what your car is worth today.</p>

          <section className="card p-6 mt-8">
            <h2 className="text-[19px] font-bold">Which car is it?</h2>
            <div className="seg-group mt-4 max-w-[440px]">
              <button className="seg" aria-pressed={mode === "vin"} onClick={() => setMode("vin")}>Use my VIN</button>
              <button className="seg" aria-pressed={mode === "ymm"} onClick={() => setMode("ymm")}>Choose year, make, model</button>
            </div>

            {mode === "vin" ? (
              <div className="mt-5">
                <label className="block">
                  <span className="label">Vehicle ID number (VIN)</span>
                  <input className="field mt-2 uppercase tracking-wider" maxLength={17} value={vin} onChange={(e) => setVin(e.target.value)} aria-describedby="vin-help" />
                </label>
                <p id="vin-help" className="hint mt-1.5">17 letters and numbers. {vin && !vinOk && <span style={{ color: "var(--redInk)" }}>That doesn&apos;t look like a full VIN yet.</span>}</p>
                <details className="mt-3 hint">
                  <summary className="cursor-pointer font-semibold">Where do I find this?</summary>
                  <ul className="mt-2 space-y-1 pl-4 list-disc">
                    <li>The bottom corner of your windshield, on the driver&apos;s side</li>
                    <li>The sticker inside the driver&apos;s door frame</li>
                    <li>Your insurance card or registration</li>
                  </ul>
                </details>
                <button className="mt-3 hint underline" onClick={() => setMode("ymm")}>Don&apos;t know your VIN? Choose year/make/model instead</button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="block"><span className="label">Year</span>
                  <select className="field mt-2" value={year} onChange={(e) => setYear(Number(e.target.value))}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
                </label>
                <label className="block"><span className="label">Make</span>
                  <select className="field mt-2" value={make} onChange={(e) => { setMake(e.target.value); setModel(Object.keys(MSRP_BASELINE[e.target.value])[0]); }}>
                    {Object.keys(MSRP_BASELINE).map((m) => <option key={m} value={m}>{title(m)}</option>)}
                  </select>
                </label>
                <label className="block"><span className="label">Model</span>
                  <select className="field mt-2" value={model} onChange={(e) => setModel(e.target.value)}>{models.map((m) => <option key={m} value={m}>{title(m)}</option>)}</select>
                </label>
              </div>
            )}

            <label className="block mt-6 max-w-[280px]">
              <span className="label">Miles on the car</span>
              <input className="field mt-2" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} />
              <span className="hint block mt-1.5">It&apos;s on your dashboard. A close guess is fine.</span>
            </label>

            <fieldset className="mt-6">
              <legend className="label">What shape is it in?</legend>
              <p className="hint">Be honest. It only changes the estimate.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup">
                {CONDITIONS.map((c) => (
                  <button key={c.id} role="radio" aria-checked={condition === c.id} onClick={() => setCondition(c.id)} className="text-left rounded-2xl p-4 transition-shadow" style={{ background: "var(--card)", boxShadow: condition === c.id ? "inset 0 0 0 2px var(--brand)" : "inset 0 0 0 1.5px var(--line)" }}>
                    <div className="font-bold">{c.label}</div>
                    <div className="hint">{c.desc}</div>
                  </button>
                ))}
              </div>
            </fieldset>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 space-y-5">
          <section className="card p-6" aria-live="polite">
            {found ? (
              <div className="rise">
                <p className="font-semibold" style={{ color: "var(--green)" }}>✓ We found your car</p>
                <div className="mt-4 rounded-2xl h-28 flex items-center justify-center" style={{ background: "var(--chip)" }} aria-hidden>
                  <svg width="88" height="44" viewBox="0 0 88 44" fill="none" stroke="var(--ink2)" strokeWidth="2.5" strokeLinejoin="round"><path d="M6 32h76v-8l-10-4-12-10H30L18 20 6 24z" /><circle cx="24" cy="34" r="6" fill="var(--chip)" /><circle cx="66" cy="34" r="6" fill="var(--chip)" /></svg>
                </div>
                <h2 className="mt-4 text-[24px] font-extrabold">{found.vehicle.year} {found.vehicle.make} {found.vehicle.model}{found.vehicle.trim ? ` ${found.vehicle.trim}` : ""}</h2>
                <p className="hint">{found.vehicle.mileage.toLocaleString()} miles · {CONDITIONS.find((c) => c.id === found.vehicle.condition)?.label} condition</p>
                <div className="mt-5 rounded-2xl p-4" style={{ background: "var(--chip)" }}>
                  <div className="hint">Estimated trade-in value</div>
                  <div className={`text-[32px] font-extrabold ${busy ? "opacity-50" : ""}`}>{usd(found.vehicle.estValue)}</div>
                  <div className="hint">Retail about {usd(found.vehicle.estRetail ?? 0)}. Lenders usually use the lower trade-in number. This is an estimate.</div>
                </div>
                {found.history.openRecalls.length > 0 && (
                  <p className="mt-4 rounded-2xl p-3 text-[15px]" style={{ background: "var(--amberSoft)", color: "var(--amber)" }}>
                    Open recall: {found.history.openRecalls[0]}. It rarely blocks a refinance, but get it fixed. <span className="hint">({found.historySource})</span>
                  </p>
                )}
              </div>
            ) : error ? (
              <p role="alert" style={{ color: "var(--redInk)" }} className="font-semibold">{error}</p>
            ) : (
              <div className="space-y-3"><div className="shimmer !h-28" /><div className="shimmer w-2/3" /><div className="shimmer w-1/2" /></div>
            )}
          </section>
          <div className="flex justify-between gap-4">
            <button className="btn btn-ghost" onClick={() => router.push("/setup/money")}>Back</button>
            <button className="btn btn-primary" disabled={!found || busy} onClick={next}>See my score <span aria-hidden>→</span></button>
          </div>
        </aside>
      </main>
      <Footer />
    </>
  );
}
