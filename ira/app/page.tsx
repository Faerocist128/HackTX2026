import Link from "next/link";
import { Header } from "@/components/chrome/Header";
import { brand } from "@/lib/brand";

const HOW = [
  { n: 1, title: "Connect your profile", text: "Pick a demo person or use your own info. We look at your income, bills and current car loan.", icon: "M10 14a4 4 0 0 1 0-5.66l2.34-2.34a4 4 0 0 1 5.66 5.66l-1.17 1.17M14 10a4 4 0 0 1 0 5.66l-2.34 2.34a4 4 0 0 1-5.66-5.66l1.17-1.17" },
  { n: 2, title: "Tell us about your car", text: "Year, model, miles and condition. We estimate what it's worth today.", icon: "M5 16h14M6 16l1.5-5h9L18 16M7.5 16v2M16.5 16v2M4 13h16" },
  { n: 3, title: "Get your score and plan", text: "Try different loans, see your score change live, and get simple next steps.", icon: "M4 17a8 8 0 0 1 16 0M12 17l3.5-5" },
];

export default function Landing() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-[1200px] px-4 sm:px-10 py-14 sm:py-20">
          <div className="rise max-w-[760px]">
            <p className="hint font-semibold" style={{ color: "var(--redInk)" }}>Free, and takes about 2 minutes</p>
            <h1 className="mt-4 text-[40px] sm:text-[56px] leading-[1.05] font-extrabold tracking-tight">Is now the right time to refinance your car?</h1>
            <p className="mt-5 text-[19px] max-w-[520px]" style={{ color: "var(--ink2)" }}>
              Get two free scores in 2 minutes: how likely a lender is to say yes, and whether refinancing is worth it for you. No credit check. No commitment.
              {brand.owner && <> {brand.tagline}</>}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/setup/money" className="btn btn-primary">Start my audit <span aria-hidden>→</span></Link>
              <span className="hint">You can try it with a demo profile first.</span>
            </div>
          </div>
        </section>
        <section id="how" className="mx-auto max-w-[1200px] px-4 sm:px-10 pb-16">
          <h2 className="text-[28px] font-extrabold">How it works</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {HOW.map((h) => (
              <div key={h.n} className="card p-6">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl inline-flex items-center justify-center" style={{ background: "var(--redSoft)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--redInk)" strokeWidth="2" strokeLinecap="round" aria-hidden><path d={h.icon} /></svg>
                  </span>
                  <span className="text-[12px] font-extrabold tracking-wider" style={{ color: "var(--ink2)" }}>STEP {h.n}</span>
                </div>
                <h3 className="mt-4 text-[19px] font-bold">{h.title}</h3>
                <p className="mt-2" style={{ color: "var(--ink2)" }}>{h.text}</p>
              </div>
            ))}
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-semibold" style={{ color: "var(--ink2)" }}>
            <li>✓ No impact on your credit</li>
            <li>✓ Your data stays private</li>
            <li>✓ No commitment to refinance</li>
          </ul>
        </section>
      </main>
    </>
  );
}
