// Typed Nessie fetchers. Server-only: the key never reaches the browser.
import "server-only";
import { requireKey } from "../env";
import type {
  NessieAccount,
  NessieBill,
  NessieBundle,
  NessieCustomer,
  NessieDeposit,
  NessieLoan,
  NessiePurchase,
} from "./types";

const BASE = process.env.NESSIE_BASE_URL ?? "https://api.nessieisreal.com";
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

async function get<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}key=${requireKey("NESSIE_API_KEY")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Nessie ${path.replace(/\/[0-9a-f]{24}/g, "/…")} → ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(path, { at: Date.now(), data });
  return data;
}

export const getCustomer = (id: string) => get<NessieCustomer>(`/customers/${id}`);
export const getAccounts = (id: string) => get<NessieAccount[]>(`/customers/${id}/accounts`);
export const getBills = (acct: string) => get<NessieBill[]>(`/accounts/${acct}/bills`);
export const getDeposits = (acct: string) => get<NessieDeposit[]>(`/accounts/${acct}/deposits`);
export const getPurchases = (acct: string) => get<NessiePurchase[]>(`/accounts/${acct}/purchases`);
export const getLoans = (acct: string) => get<NessieLoan[]>(`/accounts/${acct}/loans`);

export async function fetchBundle(customerId: string): Promise<NessieBundle> {
  const [customer, accounts] = await Promise.all([getCustomer(customerId), getAccounts(customerId)]);
  const bundle: NessieBundle = { customer, accounts, bills: {}, deposits: {}, purchases: {}, loans: {} };
  await Promise.all(
    accounts.map(async (a) => {
      const [b, d, p, l] = await Promise.all([
        getBills(a._id).catch(() => []),
        getDeposits(a._id).catch(() => []),
        getPurchases(a._id).catch(() => []),
        getLoans(a._id).catch(() => []),
      ]);
      bundle.bills[a._id] = b;
      bundle.deposits[a._id] = d;
      bundle.purchases[a._id] = p;
      bundle.loans[a._id] = l;
    }),
  );
  return bundle;
}

/** True when Nessie answers with this key (used by /api/health). */
export async function pingNessie(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/atms?key=${requireKey("NESSIE_API_KEY")}`, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Nessie rejected NESSIE_API_KEY. Check the key." };
    return res.ok ? { ok: true } : { ok: false, error: `Nessie answered ${res.status}.` };
  } catch (e) {
    return { ok: false, error: `Couldn't reach Nessie: ${(e as Error).message}` };
  }
}
