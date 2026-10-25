import Link from "next/link";
import { Header } from "@/components/chrome/Header";
import { QuickCheck } from "@/components/home/QuickCheck";
import { HeroCar } from "@/components/home/HeroCar";
import { brand } from "@/lib/brand";
import { BAND_COLORS, SCALE_COPY } from "@/lib/scoring/bands";
import type { Band, ScaleKey } from "@/lib/scoring/types";

const RANGES: { band: Band; range: string }[] = [
  { band: "green", range: "70–100" },
  { band: "yellow", range: "40–69" },
  { band: "red", range: "1–39" },
];

const LOOKS_AT = [
  { title: "Your money", text: "Income, monthly bills and your current car loan, read from your bank profile." },
  { title: "Your car", text: "Year, model, miles and condition, turned into what the car is worth today." },
  { title: "The loan you'd get", text: "Slide the length and rate, and watch both scores and the total cost move." },
];

export default function Landing() {
  return (
    <>
      <Header />
      <main>
        {/* Hero: black backdrop with the 3D car, centered white headline and pills (toyota.com hero). */}
        <section className="relative overflow-hidden text-white bg-black" aria-labelledby="hero-h">
          <div className="relative mx-auto max-w-[1248px] px-4 sm:px-8 pt-14 sm:pt-16 text-center rise">
            <p className="eyebrow" style={{ color: "rgba(255,255,255,0.8)" }}>{brand.owner ? `${brand.product} by ${brand.owner}` : "Car refinance audit"}</p>
            <h1 id="hero-h" className="h-display mt-3 mx-auto max-w-[760px]">Should you refinance your car?</h1>
            <p className="mt-3 mx-auto max-w-[620px] text-[19px] sm:text-[22px] font-light" style={{ color: "rgba(255,255,255,0.88)" }}>
              Find out how likely a lender is to say yes, and whether a new loan saves money once fees are counted.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/setup/money" className="btn btn-light">Start my audit</Link>
              <Link href="/setup/money" className="btn btn-outline-light">Try a demo profile</Link>
            </div>
          </div>
          <HeroCar className="relative mx-auto mt-4 h-[300px] sm:h-[380px] lg:h-[420px] max-w-[980px]" />
          <details className="absolute right-4 sm:right-8 bottom-4 text-[12px] text-right max-w-[300px]">
            <summary className="ml-auto w-fit list-none cursor-pointer rounded-full px-2.5 py-0.5 font-semibold" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.8)" }}>Info</summary>
            <p className="mt-2 rounded p-3 text-left" style={{ background: "rgba(0,0,0,0.75)" }}>
              Illustrative 3D model. IRA gives estimates, not a credit decision or loan offer. No impact on your credit.
            </p>
          </details>
        </section>

        {/* Quick check, framed like Toyota's "Shopping Tools" panel. */}
        <section className="mx-auto max-w-[1248px] px-4 sm:px-8 py-16 sm:py-20" aria-labelledby="qc-title">
          <h2 id="qc-title" className="h-section text-center">Try the numbers</h2>
          <p className="mt-3 text-center text-[17px] mx-auto max-w-[560px]" style={{ color: "var(--ink2)" }}>
            Your loan today and a rate you might get instead. The full audit adds approval odds and what your car is worth.
          </p>
          <div className="mt-10 rounded-lg p-4 sm:p-8" style={{ background: "var(--surface)" }}>
            <div className="mx-auto max-w-[640px]"><QuickCheck /></div>
          </div>
        </section>

        {/* Two scores, on the warm band. */}
        <section id="scores" style={{ background: "var(--warm)" }}>
          <div className="mx-auto max-w-[1248px] px-4 sm:px-8 py-16 sm:py-20">
            <p className="eyebrow text-center">How IRA decides</p>
            <h2 className="h-section text-center mt-2">Two scores, one answer</h2>
            <p className="mt-4 text-center text-[17px] mx-auto max-w-[640px]" style={{ color: "var(--ink2)" }}>
              Each runs from 1 to 100 on its own dial. Where either one falls short, your plan shows which step raises it and by how many points.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2 max-w-[960px] mx-auto">
              {(["odds", "worth"] as ScaleKey[]).map((k) => (
                <div key={k} className="card-raised p-6 sm:p-8">
                  <h3 className="text-[24px]">{SCALE_COPY[k].title}</h3>
                  <p className="mt-1" style={{ color: "var(--ink2)" }}>{SCALE_COPY[k].question}</p>
                  <ul className="mt-5 space-y-2">
                    {RANGES.map(({ band, range }) => (
                      <li key={band} className="flex items-center gap-3 rounded px-3 py-2.5" style={{ background: BAND_COLORS[band].soft, color: BAND_COLORS[band].ink }}>
                        <span className="w-14 shrink-0 font-bold tabular-nums">{range}</span>
                        <span className="font-semibold">{SCALE_COPY[k].bands[band]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What the audit looks at: TFS-style row of raised cards. */}
        <section id="looks-at" className="mx-auto max-w-[1248px] px-4 sm:px-8 py-16 sm:py-20">
          <h2 className="h-section text-center">What the audit looks at</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {LOOKS_AT.map((h, i) => (
              <li key={h.title} className="card-raised p-6 sm:p-8 text-center">
                <span className="mx-auto grid place-items-center w-11 h-11 rounded-full text-[18px] font-bold text-white tabular-nums" style={{ background: "var(--brand)" }}>{i + 1}</span>
                <h3 className="mt-4 text-[22px]">{h.title}</h3>
                <p className="mt-2" style={{ color: "var(--ink2)" }}>{h.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-center text-[15px]" style={{ color: "var(--ink2)" }}>
            No impact on your credit. Your data stays private. No commitment to refinance.
          </p>
        </section>

        {/* Dark CTA band (TFS "Follow TFS" band). */}
        <section className="text-white" style={{ background: "var(--night)" }}>
          <div className="mx-auto max-w-[1248px] px-4 sm:px-8 py-14 sm:py-16 flex flex-col sm:flex-row sm:items-center gap-6 sm:justify-between">
            <div>
              <h2 className="text-[30px] sm:text-[38px] font-semibold leading-tight">Ready to see your numbers?</h2>
              <p className="mt-2 text-[17px]" style={{ color: "rgba(255,255,255,0.8)" }}>About 2 minutes. {brand.helpLine}</p>
            </div>
            <Link href="/setup/money" className="btn btn-primary btn-lg self-start sm:self-auto">Start my audit</Link>
          </div>
        </section>
      </main>
    </>
  );
}
