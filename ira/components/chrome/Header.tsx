import Link from "next/link";
import { brand } from "@/lib/brand";

const STEPS = ["Your money", "Your car", "Try it out", "Your plan"];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-extrabold text-[17px] no-underline" style={{ color: "var(--ink)" }}>
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden>
        <path d="M2 12a9 9 0 0 1 18 0" fill="none" stroke="var(--brand)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M11 12 15.5 5.5" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {brand.product}
      {brand.owner && <span className="hint font-semibold">by {brand.owner}</span>}
    </Link>
  );
}

/** step: 1-based index of the current step; 0 hides the stepper (landing). */
export function Header({ step = 0, right }: { step?: number; right?: React.ReactNode }) {
  return (
    <header style={{ background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-10 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          {step > 0 ? <span className="hint">Step {Math.min(step, 4)} of 4</span> : right}
        </div>
        {step > 0 && (
          <ol className="mt-4 grid grid-cols-4 gap-2 sm:gap-3" aria-label="Progress">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const current = n === step;
              return (
                <li key={label} aria-current={current ? "step" : undefined}>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                    <div className="h-full rounded-full" style={{ width: done ? "100%" : current ? "60%" : "0%", background: "var(--brand)", transition: "width 500ms ease" }} />
                  </div>
                  <div className={`mt-2 text-[13px] ${current ? "font-bold" : ""}`} style={{ color: done || current ? "var(--ink)" : "var(--ink2)" }}>
                    {done && <span aria-hidden style={{ color: "var(--green)" }}>✓ </span>}
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{label.replace("Your ", "").replace("Try it out", "Try")}</span>
                    {done && <span className="sr-only">, done</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-10 py-6 hint">
        Estimates for educational purposes only. Not a credit decision or loan offer.
        {!brand.owner && " Not affiliated with or endorsed by Toyota or any lender; Toyota is named only to describe vehicles."}
      </div>
    </footer>
  );
}
