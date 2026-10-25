import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "./Logo";
import { MODEL_CREDITS } from "@/lib/vehicle/models3d";

/** TFS-style footer: red rule, logo left, link columns. */
export function Footer() {
  return (
    <footer className="mt-auto" style={{ borderTop: "2px solid var(--brand)", background: "var(--card)" }}>
      <div className="mx-auto max-w-[1248px] px-4 sm:px-8 py-12 grid gap-10 md:grid-cols-[1.2fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 text-[14px] max-w-[260px]" style={{ color: "var(--ink2)" }}>{brand.tagline}</p>
        </div>
        {brand.footerColumns.map((col) => (
          <div key={col.title}>
            <h2 className="text-[16px] font-semibold">{col.title}</h2>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("http")
                    ? <a href={l.href} className="text-[14px] no-underline hover:underline" style={{ color: "var(--ink2)" }}>{l.label}</a>
                    : <Link href={l.href} className="text-[14px] no-underline hover:underline" style={{ color: "var(--ink2)" }}>{l.label}</Link>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--line)" }}>
        <p className="mx-auto max-w-[1248px] px-4 sm:px-8 py-5 text-[12px]" style={{ color: "var(--muted)" }}>
          Estimates only, not a credit decision or loan offer. Checking your numbers here has no impact on your credit.
          {!brand.tfs && " Toyota is named only to describe vehicles; IRA is not affiliated with Toyota."}
        </p>
        {/* Attribution the 3D models' Creative Commons licenses require. */}
        <p className="mx-auto max-w-[1248px] px-4 sm:px-8 pb-5 text-[11px]" style={{ color: "var(--muted)" }}>
          3D models from Sketchfab:{" "}
          {MODEL_CREDITS.map((c, i) => (
            <span key={c.url}>{i > 0 && "; "}<a href={c.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{c.text}</a></span>
          ))}.
        </p>
      </div>
    </footer>
  );
}
