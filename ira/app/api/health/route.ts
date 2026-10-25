import { NextResponse } from "next/server";
import { missingKeys } from "@/lib/env";
import { pingNessie } from "@/lib/nessie/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health → which required keys are missing and whether Nessie answers. Never returns key values. */
export async function GET() {
  const missing = missingKeys();
  const nessie = missing.includes("NESSIE_API_KEY") ? { ok: false } : await pingNessie();
  const ok = missing.length === 0 && nessie.ok;
  return NextResponse.json({ ok, missing, nessieError: nessie.ok ? null : (nessie.error ?? null) }, { status: ok ? 200 : 503 });
}
