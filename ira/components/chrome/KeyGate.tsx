"use client";
import { useEffect, useState } from "react";

interface Health { ok: boolean; missing: string[]; nessieError: string | null }

const WHERE: Record<string, { what: string; get: string }> = {
  NESSIE_API_KEY: { what: "Capital One Nessie (your bank data)", get: "http://api.nessieisreal.com — sign in and copy your API key" },
  GEMINI_API_KEY: { what: "Google Gemini (car values and explanations)", get: "https://aistudio.google.com/apikey" },
};

/** Blocks the whole app until the server has both API keys and Nessie answers. */
export function KeyGate({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, missing: [], nessieError: "The app server isn't answering." }));
  }, []);

  if (!health) return <main className="flex-1" aria-busy />;
  if (health.ok) return <>{children}</>;
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 sm:px-10 py-14">
      <h1 className="text-[34px] font-extrabold">Setup needed</h1>
      <p className="mt-2" style={{ color: "var(--ink2)" }}>IRA needs its API keys before it can run.</p>
      {health.missing.length > 0 && (
        <section className="card p-6 mt-6">
          <h2 className="text-[19px] font-bold">Add {health.missing.length === 1 ? "this key" : "these keys"} to <code>ira/.env.local</code></h2>
          <pre className="mt-4 rounded-2xl p-4 overflow-x-auto text-[15px]" style={{ background: "var(--chip)" }}>{health.missing.map((k) => `${k}=your-key-here`).join("\n")}</pre>
          <ul className="mt-4 space-y-2">
            {health.missing.map((k) => (
              <li key={k}><span className="font-bold">{k}</span>: {WHERE[k]?.what}. Get one at {WHERE[k]?.get}.</li>
            ))}
          </ul>
        </section>
      )}
      {health.nessieError && !health.missing.includes("NESSIE_API_KEY") && (
        <p role="alert" className="card p-6 mt-6 font-semibold" style={{ color: "var(--redInk)" }}>{health.nessieError}</p>
      )}
      <ol className="mt-6 space-y-1 list-decimal pl-5" style={{ color: "var(--ink2)" }}>
        <li>Copy <code>ira/.env.example</code> to <code>ira/.env.local</code> and fill in the keys.</li>
        <li>Run <code>npm run seed</code> once to create the demo people in Nessie.</li>
        <li>Restart <code>npm run dev</code> and reload this page.</li>
      </ol>
    </main>
  );
}
