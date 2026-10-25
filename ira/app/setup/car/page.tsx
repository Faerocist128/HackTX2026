"use client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/chrome/Header";
import { PageBand } from "@/components/chrome/PageBand";
import { useAuditStore, useHydrated, type CarDraft } from "@/lib/store";
import type { Condition, MarketRate, Vehicle } from "@/lib/scoring/types";
import { carSpecFor, modelKey, withModelFile } from "@/lib/vehicle/models3d";
import { useModelFiles } from "@/components/car/useModelFiles";

const SketchfabStage = dynamic(() => import("@/components/car/SketchfabStage"), { ssr: false });
const CarStage = dynamic(() => import("@/components/car/CarStage"), { ssr: false, loading: () => <div className="shimmer !h-full !rounded-none" /> });

const CONDITIONS: { id: Condition; label: string; desc: string }[] = [
  { id: "excellent", label: "Excellent", desc: "Looks almost new. No dents or warning lights." },
  { id: "good", label: "Good", desc: "Normal wear. A few small scratches." },
  { id: "fair", label: "Fair", desc: "Some dents, worn inside, or needs minor repairs." },
  { id: "poor", label: "Poor", desc: "Major damage or mechanical problems." },
];
// Model years run from 1995 through next year's models, which go on sale this autumn.
const NEWEST = new Date().getFullYear() + 1;
const YEARS = Array.from({ length: NEWEST - 1995 + 1 }, (_, i) => NEWEST - i);
const MAX_MILES = 500_000;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

type CarInput = Omit<Vehicle, "estValue" | "estRetail">;
interface PersonaRow { id: string; vehicle?: CarInput }
interface VehicleResponse {
  vehicle: Vehicle;
  specs: { baseMsrp: number; segment: string; depreciationSource: "research" | "gemini" };
  market: MarketRate | null;
  history: { openRecalls: string[] };
  historySource: string;
  error?: string;
}

export default function CarPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, personaId, vehicle: saved, carDraft, setCarDraft, setVehicle } = useAuditStore();
  const [mode, setMode] = useState<"vin" | "ymm">("ymm");
  const [vin, setVin] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [mileage, setMileage] = useState("");
  const [condition, setCondition] = useState<Condition>("good");
  const [makes, setMakes] = useState<string[] | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [found, setFound] = useState<VehicleResponse | null>(null);
  // Where the prefilled car came from, for the heading; null once the user edits it.
  const [source, setSource] = useState<"saved" | "profile" | null>(null);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No profile yet → back to step 1.
  useEffect(() => { if (hydrated && !profile) router.replace("/setup/money"); }, [hydrated, profile, router]);

  // Prefill once: what you last typed here, else the car you saved, else the persona's car on file.
  useEffect(() => {
    if (!hydrated || restored) return;
    setRestored(true);
    const applyDraft = (d: CarDraft) => {
      setMode(d.mode); setVin(d.vin); setYear(d.year); setMake(d.make); setModel(d.model); setMileage(d.mileage); setCondition(d.condition);
    };
    const applyCar = (v: CarInput, from: "saved" | "profile") => {
      applyDraft({ mode: v.vin ? "vin" : "ymm", vin: v.vin ?? "", year: v.year, make: v.make, model: v.model, mileage: String(v.mileage), condition: v.condition });
      setSource(from);
    };
    const isSaved = (d: CarDraft) =>
      !!saved && d.year === saved.year && d.make === saved.make && d.model === saved.model && Number(d.mileage) === saved.mileage && d.condition === saved.condition;
    if (carDraft) { applyDraft(carDraft); if (isSaved(carDraft)) setSource("saved"); return; }
    if (saved) { applyCar(saved, "saved"); return; }
    if (personaId && personaId !== "manual")
      fetch("/api/profile").then((r) => r.json()).then((rows: PersonaRow[]) => { const p = rows.find((r) => r.id === personaId); if (p?.vehicle) applyCar(p.vehicle, "profile"); });
  }, [hydrated, restored, carDraft, saved, personaId]);

  // Keep what's typed in the store, so Back and the stepper links don't lose it.
  useEffect(() => {
    if (restored) setCarDraft({ mode, vin, year, make, model, mileage, condition });
  }, [restored, mode, vin, year, make, model, mileage, condition, setCarDraft]);

  // Any edit by the user means the car is no longer the prefilled one.
  const edit = <T,>(set: (v: T) => void) => (v: T) => { setSource(null); set(v); };

  // Makes for the chosen year (NHTSA).
  useEffect(() => {
    if (!year || makes) return;
    fetch(`/api/vehicle/catalog?year=${year}`).then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setMakes(j.makes))).catch(() => setError("We couldn't load the list of cars. Try your VIN instead."));
  }, [year, makes]);

  // Models for the chosen year and make (NHTSA).
  useEffect(() => {
    setModels(null);
    if (!year || !make) return;
    const ctl = new AbortController();
    fetch(`/api/vehicle/catalog?year=${year}&make=${encodeURIComponent(make)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => setModels(j.models ?? []))
      .catch(() => {});
    return () => ctl.abort();
  }, [year, make]);

  const miles = Number(mileage.replace(/[,\s]/g, ""));
  const milesOk = mileage.trim() !== "" && Number.isFinite(miles) && miles >= 0 && miles <= MAX_MILES;
  const vinOk = /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim());
  const carOk = mode === "vin" ? vinOk : !!(year && make && model);
  const ready = carOk && milesOk;

  // Switching how you pick the car starts the lookup over.
  function switchMode(m: "vin" | "ymm") {
    if (m === mode) return;
    setMode(m); setFound(null); setError(null); setSource(null);
  }

  // Look the car up once its inputs are complete.
  useEffect(() => {
    setFound(null);
    if (!ready) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        const car = mode === "vin" ? { vin: vin.trim() } : { year, make, model };
        const body = { ...car, mileage: miles, condition, tier: profile?.estCreditTier };
        const res = await fetch("/api/vehicle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        const json = (await res.json()) as VehicleResponse;
        if (!res.ok) setError(json.error ?? "We couldn't find that car.");
        else setFound(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("We couldn't reach the vehicle lookup. Try again.");
      } finally { if (!ctl.signal.aborted) setBusy(false); }
    }, 450);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [ready, mode, vin, year, make, model, miles, condition, profile?.estCreditTier]);

  function next() {
    if (!found) return;
    setVehicle(found.vehicle, found.market);
    router.push("/audit");
  }

  const modelOptions = models && model && !models.includes(model) ? [model, ...models] : models;

  // The stage follows the form; once the lookup returns, it follows the found car.
  const shown = found ? found.vehicle : mode === "ymm" && make && model ? { year, make, model, trim: undefined } : null;
  const modelFiles = useModelFiles();
  const stageSpec = useMemo(() => {
    const make = shown?.make ?? "", model = shown?.model ?? "";
    return withModelFile(carSpecFor(make, model, found?.specs.segment), modelFiles[modelKey(make, model)]);
  }, [shown?.make, shown?.model, found?.specs.segment, modelFiles]);

  return (
    <>
      <Header step={2} />
      <PageBand eyebrow="Step 2 of 5" title="Your car" width="max-w-[1100px]">We use this to estimate what your car is worth today.</PageBand>
      <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 py-10">
        {/* Dark stage with the name bottom-left, like a toyota.com model-page hero. */}
        <section className="rounded-lg overflow-hidden relative text-white" style={{ background: "radial-gradient(110% 80% at 50% 25%, #3a3f47 0%, #1d2025 50%, #0b0b0c 100%)" }}>
          {stageSpec.sketchfab
            ? <SketchfabStage spec={stageSpec} className="h-[300px] sm:h-[420px]" />
            : <CarStage spec={stageSpec} className="h-[300px] sm:h-[420px]" />}
          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none px-6 pb-5 pt-16" style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.7))" }}>
            <div className="text-[26px] sm:text-[36px] font-semibold leading-tight">{shown ? `${shown.year} ${shown.make} ${shown.model}${shown.trim ? ` ${shown.trim}` : ""}` : "Your car"}</div>
            <div className="text-[15px]" style={{ color: "rgba(255,255,255,0.8)" }}>{shown ? stageSpec.label : "Pick your car below to see it here"}</div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr] items-start">
        <div>
          <section className="card p-6">
            <h2 className="text-[19px] font-semibold">Which car is it?</h2>
            <div className="tabs mt-3" role="group" aria-label="How to find your car">
              <button className="tab" aria-pressed={mode === "vin"} onClick={() => switchMode("vin")}>Use my VIN</button>
              <button className="tab" aria-pressed={mode === "ymm"} onClick={() => switchMode("ymm")}>Choose year, make, model</button>
            </div>

            {mode === "vin" ? (
              <div className="mt-5">
                <label className="block">
                  <span className="label">Vehicle ID number (VIN)</span>
                  <input className="field mt-2 uppercase tracking-wider" maxLength={17} value={vin} onChange={(e) => edit(setVin)(e.target.value)} aria-describedby="vin-help" />
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
                <button className="mt-3 hint underline" onClick={() => switchMode("ymm")}>Don&apos;t know your VIN? Choose year/make/model instead</button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="block"><span className="label">Year</span>
                  <select className="field mt-2" value={year} onChange={(e) => { edit(setYear)(Number(e.target.value)); setModel(""); }}>
                    <option value="" disabled>Choose…</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="block"><span className="label">Make</span>
                  <select className="field mt-2" value={make} disabled={!year || !makes} onChange={(e) => { edit(setMake)(e.target.value); setModel(""); }}>
                    <option value="" disabled>{!year ? "Pick a year first" : makes ? "Choose…" : "Loading…"}</option>
                    {makes && make && !makes.includes(make) && <option value={make}>{make}</option>}
                    {makes?.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="block"><span className="label">Model</span>
                  <select className="field mt-2" value={model} disabled={!make || !modelOptions} onChange={(e) => edit(setModel)(e.target.value)}>
                    <option value="" disabled>{!make ? "Pick a make first" : !modelOptions ? "Loading…" : modelOptions.length ? "Choose…" : `No ${year} ${make} models found`}</option>
                    {modelOptions?.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
            )}

            <label className="block mt-6 max-w-[280px]">
              <span className="label">Miles on the car</span>
              <input className="field mt-2" inputMode="numeric" value={mileage} placeholder="e.g. 45,000" onChange={(e) => edit(setMileage)(e.target.value)} aria-invalid={mileage !== "" && !milesOk} />
              <span className="hint block mt-1.5">
                {mileage !== "" && !milesOk
                  ? <span style={{ color: "var(--redInk)" }}>Enter a number from 0 to {MAX_MILES.toLocaleString()}.</span>
                  : miles > 300_000
                    ? <span style={{ color: "var(--amber)" }}>That&apos;s a lot of miles. Double-check the odometer: at this point a car is valued close to scrap.</span>
                    : "It's on your dashboard. A close guess is fine."}
              </span>
            </label>

            <fieldset className="mt-6">
              <legend className="label">What shape is it in?</legend>
              <p className="hint">Be honest. It only changes the estimate.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup">
                {CONDITIONS.map((c) => (
                  <button key={c.id} role="radio" aria-checked={condition === c.id} onClick={() => edit(setCondition)(c.id)} className="text-left rounded-lg p-4 transition-shadow" style={{ background: "var(--card)", boxShadow: condition === c.id ? "inset 0 0 0 2px var(--brand)" : "inset 0 0 0 1.5px var(--line)" }}>
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
                <p className="font-semibold" style={{ color: "var(--green)" }}>
                  {source === "saved" ? "Your saved car" : source === "profile" ? "Your car from your profile" : mode === "vin" ? "We found your car from its VIN" : "Here's your car"}
                </p>
                <h2 className="mt-4 text-[24px] font-semibold">{found.vehicle.year} {found.vehicle.make} {found.vehicle.model}{found.vehicle.trim ? ` ${found.vehicle.trim}` : ""}</h2>
                <p className="hint">{found.vehicle.mileage.toLocaleString()} miles · {CONDITIONS.find((c) => c.id === found.vehicle.condition)?.label} condition · {found.specs.segment}</p>
                <div className="mt-5 rounded-lg p-4" style={{ background: "var(--chip)" }}>
                  <div className="hint">Estimated trade-in value</div>
                  <div className={`text-[32px] font-bold ${busy ? "opacity-50" : ""}`}>{usd(found.vehicle.estValue)}</div>
                  <div className="hint">
                    Retail about {usd(found.vehicle.estRetail ?? 0)}. Lenders usually use the lower trade-in number. Based on a {usd(found.specs.baseMsrp)} price when new (Gemini) and{" "}
                    {found.specs.depreciationSource === "research" ? "researched" : "Gemini's"} depreciation for this model. This is an estimate.
                  </div>
                </div>
                {found.history.openRecalls.length > 0 && (
                  <p className="mt-4 rounded-lg p-3 text-[15px]" style={{ background: "var(--amberSoft)", color: "var(--amber)" }}>
                    Open recall: {found.history.openRecalls[0]}. It rarely blocks a refinance, but get it fixed. <span className="hint">({found.historySource})</span>
                  </p>
                )}
              </div>
            ) : error ? (
              <p role="alert" style={{ color: "var(--redInk)" }} className="font-semibold">{error}</p>
            ) : busy ? (
              <div className="space-y-3" aria-busy><p className="hint">Looking up your car and pricing it with Gemini…</p><div className="shimmer w-3/4" /><div className="shimmer w-2/3" /><div className="shimmer w-1/2" /></div>
            ) : (
              <div>
                <h2 className="text-[19px] font-semibold">Tell us about your car</h2>
                <p className="hint mt-1">
                  {mode === "vin" ? "Enter your VIN" : "Choose the year, make and model"} and the miles, and we&apos;ll estimate what it&apos;s worth.
                </p>
              </div>
            )}
          </section>
          <div className="flex justify-between gap-4">
            <button className="btn btn-ghost" onClick={() => router.push("/setup/money")}>Back</button>
            <button className="btn btn-primary" disabled={!found || busy} onClick={next}>See my scores <span aria-hidden>→</span></button>
          </div>
        </aside>
        </div>
      </main>
    </>
  );
}
