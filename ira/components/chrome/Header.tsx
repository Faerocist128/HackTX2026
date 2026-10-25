"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { brand } from "@/lib/brand";
import { Logo } from "./Logo";

const STEPS = [
  { label: "Your money", href: "/setup/money" },
  { label: "Your car", href: "/setup/car" },
  { label: "Try it out", href: "/audit" },
  { label: "Your scores", href: "/scores" },
  { label: "Your plan", href: "/plan" },
];

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="currentColor">
      <rect x="0" y="0" width="6" height="6" rx="1" /><rect x="8" y="0" width="6" height="6" rx="1" />
      <rect x="0" y="8" width="6" height="6" rx="1" /><rect x="8" y="8" width="6" height="6" rx="1" />
    </svg>
  );
}

/** One step link: done steps link back, the current one is black with a red underline, future ones are dimmed. */
function StepLink({ label, href, n, step, onNavigate }: { label: string; href: string; n: number; step: number; onNavigate?: () => void }) {
  const done = step > 0 && n < step;
  const current = n === step;
  const base = "relative inline-flex items-center h-full text-[16px] font-semibold no-underline whitespace-nowrap";
  if (current) {
    return (
      <span aria-current="step" className={base} style={{ color: "var(--ink)" }}>
        {label}
        <span className="absolute left-0 right-0 bottom-0 h-[3px]" style={{ background: "var(--brand)" }} aria-hidden />
      </span>
    );
  }
  if (done || step === 0) {
    return (
      <Link href={href} onClick={onNavigate} className={`${base} hover:!text-[var(--ink)]`} style={{ color: "var(--ink2)" }}>
        {label}{done && <span className="sr-only">, done</span>}
      </Link>
    );
  }
  return <span className={base} style={{ color: "var(--muted)", opacity: 0.7 }}>{label}</span>;
}

/**
 * toyota.com-style bar: white, 64px, logo left, text links, actions right.
 * step: 1-based index of the current step; 0 is the landing page (all steps link).
 */
export function Header({ step = 0, right }: { step?: number; right?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const progress = step > 0 ? Math.min(step, STEPS.length) / STEPS.length : 0;

  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--card)", borderBottom: brand.tfs ? "2px solid var(--brand)" : "1px solid var(--line)" }}>
      <div className="mx-auto max-w-[1248px] px-4 sm:px-8 h-16 flex items-center gap-6 lg:gap-12">
        <Logo />
        <nav aria-label="Audit steps" className="hidden lg:flex items-stretch gap-9 h-full">
          {STEPS.map((s, i) => <StepLink key={s.href} {...s} n={i + 1} step={step} />)}
        </nav>
        <div className="ml-auto flex items-center gap-6">
          {brand.navLinks.map((l) => (
            <a key={l.href} href={l.href} className="hidden md:inline text-[15px] font-semibold no-underline" style={{ color: "var(--ink)" }}>{l.label}</a>
          ))}
          {step > 0 && <span className="hidden sm:inline text-[14px]" style={{ color: "var(--ink2)" }}>Step {Math.min(step, STEPS.length)} of {STEPS.length}</span>}
          {right}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="step-menu"
            className="lg:hidden inline-flex items-center gap-2 h-10 px-1 border-0 bg-transparent text-[15px] font-semibold cursor-pointer" style={{ color: "var(--ink)" }}>
            <MenuIcon /> Menu
          </button>
        </div>
      </div>
      {step > 0 && (
        <div className="lg:hidden h-[3px]" style={{ background: "var(--line)" }} aria-hidden>
          <div className="h-full" style={{ width: `${progress * 100}%`, background: "var(--brand)", transition: "width 500ms ease" }} />
        </div>
      )}
      {open && (
        <nav id="step-menu" aria-label="Audit steps" className="lg:hidden absolute inset-x-0 top-full" style={{ background: "var(--card)", borderBottom: "1px solid var(--line)", boxShadow: "var(--shadow)" }}>
          <ol className="mx-auto max-w-[1248px] px-4 sm:px-8 py-2">
            {STEPS.map((s, i) => (
              <li key={s.href} className="h-12 flex items-center" style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
                <span className="w-7 text-[14px] tabular-nums" style={{ color: "var(--muted)" }}>{i + 1}</span>
                <StepLink {...s} n={i + 1} step={step} onNavigate={() => setOpen(false)} />
              </li>
            ))}
            {brand.navLinks.map((l) => (
              <li key={l.href} className="h-12 flex items-center md:hidden" style={{ borderTop: "1px solid var(--line)" }}>
                <a href={l.href} className="text-[16px] font-semibold no-underline">{l.label}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </header>
  );
}
