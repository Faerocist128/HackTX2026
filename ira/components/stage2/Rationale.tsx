import type { Advice } from "@/lib/advice/types";

export function Rationale({ advice, updating, error }: { advice: Advice | null; updating: boolean; error: string | null }) {
  return (
    <section className="card p-6" aria-labelledby="why-h" aria-busy={updating}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="why-h" className="text-[22px] font-bold">Why these scores</h2>
        <span className="text-[12px] font-bold px-2.5 py-1 rounded-full" style={{ background: "var(--chip)", color: "var(--ink2)" }}>Written by Gemini</span>
      </div>
      {updating && (
        <p className="hint mt-2 inline-flex items-center gap-2" role="status">
          <span className="inline-block w-3 h-3 rounded-full animate-pulse" style={{ background: "var(--ink2)" }} /> Updating your explanation
        </p>
      )}
      {advice ? (
        <div className={`mt-3 space-y-3 transition-opacity ${updating ? "opacity-60" : ""}`}>
          {advice.rationale.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : error ? null : (
        <div className="mt-4 space-y-3" aria-hidden><div className="shimmer" /><div className="shimmer w-11/12" /><div className="shimmer w-4/5" /><div className="shimmer w-2/3" /></div>
      )}
      {error && <p role="alert" className="mt-3 font-semibold" style={{ color: "var(--redInk)" }}>{error} Your scores and steps are still accurate.</p>}
    </section>
  );
}
